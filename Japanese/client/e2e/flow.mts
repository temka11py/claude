// Click-through of one day's flashcards and quiz (manual smoke check).
// Usage: npx tsx e2e/flow.mts <outDir> [baseUrl]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'screenshots';
const base = process.argv[3] ?? 'http://localhost:4000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${base}/login`);
await page.fill('input[type=email]', 'demo@hanamaru.app');
await page.fill('input[type=password]', 'demo12345');
await page.click('button[type=submit]');
await page.waitForURL(`${base}/`);

// Words: list → flashcards (Space flips, 2 = knew it) → match game
await page.goto(`${base}/day/10/words-1`);
await page.getByRole('button', { name: /Флэш карт эхлэх/ }).click();
for (let i = 0; i < 12; i++) {
  if (await page.getByText('үгийг мэдэж байна').isVisible()) break;
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  await page.keyboard.press('2');
  await page.waitForTimeout(150);
}
await page.screenshot({ path: `${out}/flow-1-cards-done.png` });
await page.getByRole('button', { name: /үг холбох/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/flow-2-match.png` });

// Quiz: answer with the first option, check, continue until the summary
await page.goto(`${base}/day/10/quiz`);
for (let i = 0; i < 20; i++) {
  if (await page.getByText(/Эхний оролдлогоор/).isVisible()) break;
  await page.getByRole('button', { name: 'Шалгах' }).waitFor();
  const radio = page.getByRole('radio').first();
  if (await radio.isVisible()) await radio.click();
  else if (await page.locator('textarea').isVisible()) await page.locator('textarea').fill('a');
  else if (await page.getByText('сонгоно уу', { exact: true }).first().isVisible()) {
    // matching: pick each left word, then the first meaning still free
    const rows = await page.getByText('сонгоно уу', { exact: true }).count();
    for (let r = 0; r < rows; r++) {
      await page.getByText('сонгоно уу', { exact: true }).first().click();
      await page.locator('.grid > div:nth-child(2) button:not(.text-muted)').first().click();
    }
  }
  try {
    await page.getByRole('button', { name: 'Шалгах' }).click({ timeout: 5000 });
  } catch {
    await page.screenshot({ path: `${out}/flow-stuck.png`, fullPage: true });
    console.log('stuck at question', i + 1);
    break;
  }
  await page.waitForTimeout(250);
  if (i === 0) await page.screenshot({ path: `${out}/flow-3-feedback.png` });
  await page.getByRole('button', { name: /Үргэлжлүүлэх/ }).click();
  await page.waitForTimeout(250);
}
await page.screenshot({ path: `${out}/flow-4-summary.png` });
await page.getByRole('button', { name: /Үргэлжлүүлэх/ }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/flow-5-reward.png` });
console.log('reward visible:', await page.getByText(/XP/).first().isVisible());
await browser.close();
