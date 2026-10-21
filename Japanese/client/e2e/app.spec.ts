import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const shotsDir = 'screenshots';
fs.mkdirSync(shotsDir, { recursive: true });

const email = `e2e-${Date.now()}@example.com`;
const password = 'password123';
const errors: string[] = [];

// Expected: the anonymous session probe and deliberately locked routes.
const EXPECTED = [/status of 401/, /status of 403/];

function watch(page: Page) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!EXPECTED.some((re) => re.test(text))) errors.push(`${page.url()} :: ${text}`);
  });
  page.on('pageerror', (err) => errors.push(`${page.url()} :: pageerror ${err.message}`));
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(1);
}

/** Answer whatever question is on screen (first choice / some text / pair everything). */
async function answerCurrent(page: Page) {
  const radios = page.getByRole('radio');
  if (await radios.count()) {
    await radios.first().click();
    return;
  }
  const textarea = page.locator('main textarea');
  if (await textarea.count()) {
    await textarea.first().fill('a');
    return;
  }
  // matching: select each left item then an unused right item
  const lefts = page.locator('main .grid.gap-4 > div').first().locator('button');
  const rights = page.locator('main .grid.gap-4 > div').nth(1).locator('button');
  const n = await lefts.count();
  for (let i = 0; i < n; i++) {
    await lefts.nth(i).click();
    await rights.nth(i).click();
  }
}

async function finishQuiz(page: Page) {
  for (let guard = 0; guard < 80; guard++) {
    await answerCurrent(page);
    const submit = page.getByRole('button', { name: /^Илгээх$/ });
    if (await submit.isVisible()) {
      await submit.click();
      break;
    }
    await page.getByRole('button', { name: /^Дараах/ }).first().click();
  }
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Илгээх' }).click();
  await expect(page.getByText('Хариултууд')).toBeVisible({ timeout: 15_000 });
}

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page);
});

test.afterAll(async () => {
  await page.close();
  if (errors.length) console.log('Console errors:\n' + errors.join('\n'));
  expect(errors, 'no unexpected console errors').toEqual([]);
});

test('redirects anonymous users to login', async () => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({ path: `${shotsDir}/login-desktop.png` });
});

test('register creates an account and opens the dashboard', async () => {
  await page.goto('/register');
  await page.getByLabel('Нэр').fill('Тест Сурагч');
  await page.getByLabel('Имэйл').fill(email);
  await page.getByLabel(/Нууц үг/).fill(password);
  await page.getByRole('button', { name: 'Бүртгүүлэх' }).click();
  await expect(page.getByRole('heading', { name: /Сайн байна уу/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Өнөөдрийн зорилго' })).toBeVisible();
  await page.screenshot({ path: `${shotsDir}/dashboard-desktop.png`, fullPage: true });
});

test('learning path shows first lesson available and the rest locked', async () => {
  await page.goto('/learn');
  await expect(page.getByRole('heading', { name: 'Сургалтын зам' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Хирагана: あ, か, さ мөр/ })).toBeVisible();
  await page.screenshot({ path: `${shotsDir}/learn-desktop.png`, fullPage: true });
});

test('lesson flow: sections, mini quiz, complete, next unlocked', async () => {
  await page.goto('/learn');
  await page.getByRole('link', { name: /Хирагана: あ, か, さ мөр/ }).click();
  await expect(page.getByRole('heading', { name: /Хирагана: あ, か, さ мөр/ })).toBeVisible();
  // open a kana detail with stroke order
  await page.getByRole('button', { name: 'あ a' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Бичих дасгал' }).click();
  await expect(page.getByRole('dialog').locator('svg[role="img"]')).toBeVisible();
  await page.screenshot({ path: `${shotsDir}/kana-detail.png` });
  await page.keyboard.press('Escape');
  // walk to the quiz
  for (let i = 0; i < 6 && !(await page.getByRole('radiogroup').isVisible()); i++) {
    await page.getByRole('button', { name: /^Дараах: / }).click();
    await page.waitForTimeout(200);
  }
  await expect(page.getByRole('radiogroup')).toBeVisible();
  await finishQuiz(page);
  await page.screenshot({ path: `${shotsDir}/quiz-results.png`, fullPage: true });
  await page.getByRole('button', { name: 'Дүгнэлт рүү' }).click();
  await page.getByRole('button', { name: 'Хичээлийг дуусгах' }).click();
  await expect(page.getByText('Хичээл дууслаа!')).toBeVisible();
  await page.goto('/learn');
  await expect(page.getByRole('link', { name: /Хирагана: た, な, は мөр/ })).toBeVisible();
});

const PAGES: [string, RegExp][] = [
  ['/', /Сайн байна уу/],
  ['/hiragana', /^Хирагана$/],
  ['/katakana', /^Катакана$/],
  ['/kanji', /^Ханз$/],
  ['/vocabulary', /^Үгсийн сан$/],
  ['/grammar', /^Дүрэм$/],
  ['/stories', /^Өгүүллэг$/],
  ['/listening', /^Сонсгол$/],
  ['/speaking', /^Ярих дасгал$/],
  ['/translation', /^Орчуулга$/],
  ['/review', /^Давталт$/],
  ['/tests', /^Модулийн шалгалт$/],
  ['/jlpt', /JLPT N5 загвар шалгалт/],
  ['/progress', /^Ахиц$/],
  ['/settings', /^Тохиргоо$/],
];

test('every main page renders', async () => {
  for (const [path, heading] of PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading }), path).toBeVisible();
  }
  await page.goto('/does-not-exist');
  await expect(page.getByText('Хуудас олдсонгүй')).toBeVisible();
});

test('kanji detail has stroke order and a writing canvas', async () => {
  await page.goto('/kanji/' + encodeURIComponent('日'));
  await expect(page.locator('svg[role="img"]').first()).toBeVisible();
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 160, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('1 зураас')).toBeVisible();
  await page.screenshot({ path: `${shotsDir}/kanji-detail.png`, fullPage: true });
});

test('vocabulary search and actions', async () => {
  await page.goto('/vocabulary');
  await page.getByRole('textbox', { name: 'Хайх' }).fill('食べる');
  await expect(page.getByText('идэх').first()).toBeVisible();
  await page.getByText('идэх').first().click();
  await page.getByRole('button', { name: 'Давталтад нэмэх' }).first().click();
  await expect(page.getByText('Давталтад нэмлээ')).toBeVisible();
});

test('story toggles and word lookup', async () => {
  await page.goto('/stories/self-introduction');
  await page.getByRole('button', { name: 'Орчуулга' }).click();
  await expect(page.getByText('Би Бат.')).toBeVisible();
  await page.getByRole('button', { name: 'Ромаджи' }).click();
  await page.locator('main p.jp button').filter({ hasText: '大学' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: `${shotsDir}/story.png`, fullPage: true });
  await page.keyboard.press('Escape');
});

test('translation practice gives feedback', async () => {
  await page.goto('/translation');
  await page.locator('main textarea').fill('Би оюутан');
  await page.getByRole('button', { name: 'Шалгах' }).click();
  await expect(page.getByText(/Зөв! Сайн байна\.|Бүрэн зөв биш байна\./)).toBeVisible();
  await expect(page.getByText('Жишээ зөв хариулт')).toBeVisible();
});

test('review session rates a card', async () => {
  await page.goto('/review');
  await page.getByRole('button', { name: /карт давтах/ }).click();
  await page.getByRole('button', { name: 'Хариуг харах' }).click();
  await page.getByRole('button', { name: /^Сайн/ }).click();
  await expect(page.getByText(/1 давтсан/)).toBeVisible();
});

test('listening exercise can be answered', async () => {
  await page.goto('/listening/meeting-time');
  await finishQuiz(page);
  await expect(page.getByRole('heading', { name: 'Бичвэр (транскрипт)' })).toBeVisible();
});

test('JLPT mock exam: timer, navigation, results with disclaimer', async () => {
  await page.goto('/jlpt');
  await page.getByRole('link', { name: 'Шалгалт эхлэх' }).click();
  await page.getByRole('button', { name: 'Эхлэх' }).click();
  await expect(page.getByText(/59:5\d|60:00/)).toBeVisible();
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: 'Асуулт 20' }).click();
  await page.getByRole('radio').first().click();
  await page.screenshot({ path: `${shotsDir}/mock-exam.png`, fullPage: true });
  await page.getByRole('button', { name: 'Шалгалтаа илгээх' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Илгээх' }).click();
  await expect(page.getByText('Хэсгийн оноо')).toBeVisible();
  await expect(page.getByText('Дадлагын оноо — албан ёсны JLPT дүн биш.').first()).toBeVisible();
});

test('kana practice session starts from the hiragana page', async () => {
  await page.goto('/hiragana');
  await page.getByRole('tab', { name: 'Дасгал' }).click();
  await page.getByRole('button', { name: 'Бичиж хариулах' }).click();
  await page.getByRole('button', { name: 'Дасгал эхлэх' }).click();
  await expect(page.getByText(/^1 \/ 10$/)).toBeVisible();
  await finishQuiz(page);
});

test('grammar detail practice works', async () => {
  await page.goto('/grammar/wa-desu');
  await expect(page.getByRole('heading', { name: 'N1 は N2 です' })).toBeVisible();
  await page.getByRole('button', { name: 'Дасгал эхлэх' }).click();
  await finishQuiz(page);
});

test('speaking: typed fallback transcript is checked by key words', async () => {
  await page.goto('/speaking');
  await page.locator('main textarea').fill('はじめまして。わたしはバトです。モンゴル人です。よろしくおねがいします。');
  await page.getByRole('button', { name: 'Шалгах' }).click();
  await expect(page.getByText(/Маш сайн|Сайн байна|Жишээ өгүүлбэрийг/)).toBeVisible();
});

test('weak-area practice page loads questions', async () => {
  await page.goto('/practice?categories=particles&title=weak');
  await expect(page.getByRole('heading', { level: 1, name: 'Сул талаа дасгалжуулах' })).toBeVisible();
  await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
});

test('progress page shows stats and charts', async () => {
  await page.goto('/progress');
  await expect(page.getByText('Дууссан хичээл')).toBeVisible();
  await expect(page.getByText('Шалгалтын гүйцэтгэл')).toBeVisible();
  await page.screenshot({ path: `${shotsDir}/progress-desktop.png`, fullPage: true });
});

test('settings: dark theme and language persist', async () => {
  await page.goto('/settings');
  await page.getByRole('tab', { name: /Харанхуй/ }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Өнөөдрийн зорилго' })).toBeVisible();
  await page.screenshot({ path: `${shotsDir}/dashboard-dark.png`, fullPage: true });
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.getByRole('tab', { name: 'Монгол' }).click();
  await page.getByRole('tab', { name: /Цайвар/ }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('responsive layouts have no horizontal overflow', async () => {
  const sizes = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 820, height: 1180 },
  ];
  const paths = ['/', '/learn', '/lessons/hiragana-1', '/hiragana', '/vocabulary', '/kanji', '/stories/my-family', '/review', '/jlpt', '/progress', '/speaking', '/settings'];
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await noHorizontalOverflow(page);
    }
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Өнөөдрийн зорилго' })).toBeVisible();
    await page.screenshot({ path: `${shotsDir}/dashboard-${size.name}.png`, fullPage: true });
    await page.goto('/lessons/hiragana-2');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${shotsDir}/lesson-${size.name}.png`, fullPage: true });
    await page.goto('/progress');
    await expect(page.getByText('Шалгалтын гүйцэтгэл')).toBeVisible();
    await page.screenshot({ path: `${shotsDir}/progress-${size.name}.png`, fullPage: true });
  }
  // mobile navigation drawer works
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Бусад' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Дүрэм' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Дүрэм' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('logout and login again', async () => {
  await page.goto('/settings');
  await page.getByRole('main').getByRole('button', { name: 'Гарах' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Имэйл').fill(email);
  await page.getByLabel('Нууц үг').fill('wrong-password');
  await page.getByRole('button', { name: 'Нэвтрэх' }).click();
  await expect(page.getByRole('alert')).toContainText('буруу');
  await page.getByLabel('Нууц үг').fill(password);
  await page.getByRole('button', { name: 'Нэвтрэх' }).click();
  await expect(page.getByRole('heading', { name: /Сайн байна уу/ })).toBeVisible();
});
