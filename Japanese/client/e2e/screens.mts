// Screenshot tour of the daily-program pages (manual visual check).
// Usage: npx tsx e2e/screens.mts <outDir> [baseUrl]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'screenshots';
const base = process.argv[3] ?? 'http://localhost:4000';
const pages: [string, string][] = [
  ['today', '/'],
  ['program', '/program'],
  ['day10', '/day/10'],
  ['day10-words', '/day/10/words-1'],
  ['day10-kanji', '/day/10/kanji-1'],
  ['day10-grammar', '/day/10/grammar-1'],
  ['day10-reading', '/day/10/reading'],
  ['day10-speaking', '/day/10/speaking'],
  ['day16-sudoku', '/day/16/game'],
  ['day2-kana', '/day/2/kana-1'],
  ['flashcards', '/flashcards'],
  ['games', '/games'],
  ['n4-day', '/day/65'],
  ['n4-grammar', '/day/65/grammar-1'],
];

const browser = await chromium.launch();
for (const [width, height, tag] of [[1280, 900, 'desktop'], [390, 844, 'mobile']] as const) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'mn-MN' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${tag}] pageerror:`, e.message));
  await page.goto(`${base}/login`);
  await page.fill('input[type=email]', 'demo@hanamaru.app');
  await page.fill('input[type=password]', 'demo12345');
  await page.click('button[type=submit]');
  await page.waitForURL(`${base}/`);
  for (const [name, path] of tag === 'mobile' ? pages.slice(0, 4) : pages) {
    await page.goto(`${base}${path}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) console.log(`[${tag}] ${name}: horizontal overflow ${overflow}px`);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: name !== 'program' });
  }
  await ctx.close();
}
await browser.close();
console.log('done');
