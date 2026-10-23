// Lists the speech-synthesis voices a browser offers (diagnosing silent audio).
// Usage: npx tsx e2e/voices.mts [msedge|chrome]
import { chromium } from '@playwright/test';

const channel = process.argv[2] ?? 'msedge';
// Playwright's defaults switch off background services such as online voices.
const browser = await chromium.launch({ channel, headless: false, ignoreDefaultArgs: ['--disable-component-extensions-with-background-pages', '--disable-background-networking', '--disable-component-update', '--disable-extensions', '--disable-default-apps'] });
const page = await browser.newPage();
await page.goto('http://localhost:4000/login');
// Passed as a string: tsx would otherwise inject helpers the page does not have.
const voices: string[] = await page.evaluate(`new Promise((resolve) => {
  const list = () => speechSynthesis.getVoices().map((v) => v.lang + ' | ' + v.name + ' | local=' + v.localService);
  if (list().length) setTimeout(() => resolve(list()), 1500);
  speechSynthesis.addEventListener('voiceschanged', () => setTimeout(() => resolve(list()), 300));
  setTimeout(() => resolve(list()), 5000);
})`);
console.log(`${channel}: ${voices.length} voices`);
console.log(voices.filter((v) => v.startsWith('ja')).join('\n') || 'no Japanese voice');
await browser.close();
