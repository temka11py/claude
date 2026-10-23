// Clicks the app's speaker buttons in a real browser and logs every speech call
// and event (diagnosing silent audio). Usage: npx tsx e2e/speak-app.mts [msedge|chrome]
import { chromium } from '@playwright/test';

const channel = process.argv[2] ?? 'msedge';
const browser = await chromium.launch({
  channel,
  headless: false,
  ignoreDefaultArgs: ['--disable-component-extensions-with-background-pages', '--disable-background-networking', '--disable-component-update', '--disable-extensions', '--disable-default-apps', '--mute-audio'],
});
const page = await browser.newPage();
page.on('console', (m) => m.text().startsWith('[tts]') && console.log(m.text()));
// Passed as a string: tsx would otherwise inject helpers the page does not have.
await page.addInitScript(`(() => {
  const s = window.speechSynthesis;
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const speak = s.speak.bind(s), cancel = s.cancel.bind(s);
  s.speak = (u) => {
    console.log('[tts] speak@' + at() + ' "' + u.text + '" voice=' + (u.voice ? u.voice.name : 'none') + ' lang=' + u.lang + ' voices=' + s.getVoices().length);
    u.addEventListener('start', () => console.log('[tts] start@' + at()));
    u.addEventListener('end', () => console.log('[tts] end@' + at()));
    u.addEventListener('error', (e) => console.log('[tts] error@' + at() + ' ' + e.error));
    speak(u);
  };
  s.cancel = () => { console.log('[tts] cancel@' + at()); cancel(); };
})()`);
await page.goto('http://localhost:4000/login');
await page.fill('input[type=email]', 'demo@hanamaru.app');
await page.fill('input[type=password]', 'demo12345');
await page.click('button[type=submit]');
await page.waitForURL('http://localhost:4000/');
await page.goto('http://localhost:4000/day/10/words-1');
await page.waitForLoadState('networkidle');
const buttons = page.getByRole('button', { name: 'Сонсох' });
console.log('speaker buttons:', await buttons.count());
await buttons.first().click();
await page.waitForTimeout(9000);
await buttons.nth(1).click();
await page.waitForTimeout(9000);
await browser.close();
