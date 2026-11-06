// End-to-end smoke test in a real browser (installed Edge or Chrome).
//   npm run build && npm run e2e
// Starts the server on a temporary database, goes through first-run setup and
// onboarding, visits every main page at phone and desktop sizes, fails on
// console errors or horizontal overflow, and saves screenshots to ./screenshots.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const port = 3199;
const base = `http://127.0.0.1:${port}`;
const dbFile = path.join(root, 'data', 'e2e.db');
const shots = path.join(root, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('Run "npm run build" first — the e2e test uses the production build.');
  process.exit(1);
}

const server = spawn(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'server/index.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DATABASE_PATH: dbFile, RECORDINGS_DIR: path.join(root, 'data', 'e2e-recordings'), ANTHROPIC_API_KEY: '', NATURAL_VOICES: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start:\n${serverLog}`);
}

const problems: string[] = [];

async function check(page: Page, name: string, viewport: 'mobile' | 'desktop') {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) problems.push(`${viewport} ${name}: horizontal overflow of ${overflow}px`);
  const errorBox = await page.locator('text=Couldn\'t load this').count();
  if (errorBox) problems.push(`${viewport} ${name}: page shows an error state`);
  await page.screenshot({ path: path.join(shots, `${viewport}-${name}.png`), fullPage: true });
}

/**
 * Play through a whole lesson like a learner who answers quickly (not always
 * correctly): the lesson must reach its summary screen without errors.
 */
async function walkLesson(page: Page, lessonId: string): Promise<number> {
  await page.goto(`${base}/lesson/${lessonId}`);
  await page.waitForLoadState('networkidle');
  const nav = /^(Let's start|Practise these words|Next word|Start the questions|Continue|Next|Finish lesson|Next: word check|Show answer|Good.*|Finish|Attack!)$/;
  for (let i = 0; i < 400; i++) {
    if (await page.getByText('Lesson complete!').isVisible().catch(() => false)) return i;
    const main = page.locator('div.animate-slide-up').last();
    // 1. Navigation buttons.
    const navBtn = main.getByRole('button', { name: nav }).locator('visible=true');
    if ((await navBtn.count()) && (await navBtn.first().isEnabled())) {
      await navBtn.first().click({ timeout: 3000 }).catch(() => undefined);
      continue;
    }
    // 2. Choice questions.
    const radio = main.locator('[role=radio]:enabled').locator('visible=true');
    if (await radio.count()) {
      await radio.first().click({ timeout: 3000 }).catch(() => undefined);
      continue;
    }
    // 3. An answer is ready to be checked (matching, tiles, typed).
    const ready = main.getByRole('button', { name: /^Check$/ }).locator('visible=true');
    if ((await ready.count()) && (await ready.first().isEnabled())) {
      await ready.first().click({ timeout: 3000 }).catch(() => undefined);
      continue;
    }
    // 4. Match game: pick a left card, then try right cards until it locks in.
    const left = main.locator('button[aria-pressed]:enabled').locator('visible=true');
    if (await left.count()) {
      await left.first().click({ timeout: 3000 }).catch(() => undefined);
      const rights = main.locator('div.grid.grid-cols-2 > div:nth-child(2) > button:enabled');
      const n = await rights.count();
      for (let k = 0; k < n; k++) {
        if (!(await left.first().getAttribute('aria-pressed').catch(() => null))) break;
        await rights.nth(k).click({ timeout: 2000 }).catch(() => undefined);
        await page.waitForTimeout(80);
      }
      continue;
    }
    // 4. Typed answers.
    const input = main.locator('input:enabled:not([type=checkbox]), textarea:enabled').locator('visible=true');
    if ((await input.count()) && !(await input.first().inputValue())) {
      await input.first().fill('answer');
      const check = main.getByRole('button', { name: /^Check$/ });
      if ((await check.count()) && (await check.first().isEnabled())) await check.first().click({ timeout: 3000 }).catch(() => undefined);
      else await input.first().press('Enter');
      continue;
    }
    // 5. Tiles and letters (word order, ordering, word builder).
    const tiles = main.locator('button.rounded-xl.bg-surface:enabled, button.size-11:enabled').locator('visible=true');
    if (await tiles.count()) {
      await tiles.first().click({ timeout: 3000 }).catch(() => undefined);
      continue;
    }
    const check = main.getByRole('button', { name: /^Check$/ });
    if ((await check.count()) && (await check.first().isEnabled())) {
      await check.first().click({ timeout: 3000 }).catch(() => undefined);
      continue;
    }
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: path.join(shots, 'lesson-stuck.png'), fullPage: true });
  throw new Error(`Lesson ${lessonId} did not reach its summary screen (see lesson-stuck.png)`);
}

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      /* next */
    }
  }
  throw new Error('Microsoft Edge or Google Chrome is required for the e2e test.');
}

try {
  await waitForServer();
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|401|Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));

  // First run: create the account.
  await page.goto(`${base}/`);
  await page.waitForURL(/login/);
  await page.getByLabel('Your name').fill('Test Learner');
  await page.getByLabel('Username').fill('learner');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Onboarding.
  await page.waitForURL(/welcome/);
  await check(page, 'welcome', 'desktop');
  await page.getByRole('button', { name: /set up your plan/i }).click();
  await page.getByRole('radio', { name: /every other day/i }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /skip for now/i }).click();
  await page.waitForURL(`${base}/`);

  const pages: [string, string][] = [
    ['dashboard', '/'],
    ['course', '/course'],
    ['module', '/module/b1-01'],
    ['lesson', '/lesson/b1-01-l1'],
    ['review', '/review'],
    ['vocabulary', '/vocabulary'],
    ['practice', '/practice'],
    ['mistakes', '/mistakes'],
    ['progress', '/progress'],
    ['achievements', '/achievements'],
    ['tutor', '/tutor'],
    ['conversation', '/conversation'],
    ['settings', '/settings'],
    ['admin', '/admin'],
    ['session', '/session'],
    ['placement', '/placement'],
    ['challenge', '/practice/challenge'],
    ['certificate', '/certificate'],
  ];
  for (const [name, url] of pages) {
    await page.goto(`${base}${url}`);
    await check(page, name, 'desktop');
  }

  // Walk the first steps of a lesson: warm-up and objectives.
  await page.goto(`${base}/lesson/b1-01-l1`);
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: /next|continue/i }).first().click();
  await check(page, 'lesson-step2', 'desktop');

  // A complete lesson, start to finish.
  const steps = await walkLesson(page, 'b1-01-l1');
  console.log(`  lesson b1-01-l1 completed in ${steps} interactions`);
  await check(page, 'lesson-complete', 'desktop');
  await page.goto(`${base}/review`);
  await check(page, 'review-after-lesson', 'desktop');
  await page.goto(`${base}/vocabulary`);
  await check(page, 'vocabulary-after-lesson', 'desktop');
  await page.goto(`${base}/`);
  await check(page, 'dashboard-after-lesson', 'desktop');
  // Games unlock once 8+ words are known.
  for (const g of ['word-match', 'memory', 'speed', 'collocation', 'missing-word', 'word-builder', 'synonym-battle', 'listening-detective', 'boss']) {
    await page.goto(`${base}/games/${g}`);
    await check(page, `game-${g}`, 'desktop');
  }
  await page.goto(`${base}/practice/mistakes`);
  await check(page, 'practice-mistakes', 'desktop');

  // Phone size.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, url] of pages.slice(0, 10)) {
    await page.goto(`${base}${url}`);
    await check(page, name, 'mobile');
  }
  await page.goto(`${base}/lesson/b1-01-l1`);
  await check(page, 'lesson', 'mobile');

  // Dark mode.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/`);
  await check(page, 'dashboard-dark', 'desktop');

  await browser.close();
} catch (err) {
  problems.push(`fatal: ${(err as Error).stack ?? err}`);
} finally {
  server.kill();
}

if (problems.length) {
  console.log(`\n✗ ${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log(`\nScreenshots: ${shots}`);
  process.exit(1);
}
console.log(`\n✓ e2e passed. Screenshots in ${shots}`);
process.exit(0);
