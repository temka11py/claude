// Speaks a Japanese word in a real browser and reports the speech events,
// with and without cancel() right before speak() (diagnosing silent audio).
// Usage: npx tsx e2e/speak-test.mts [msedge|chrome]
import { chromium } from '@playwright/test';

const channel = process.argv[2] ?? 'msedge';
const browser = await chromium.launch({
  channel,
  headless: false,
  ignoreDefaultArgs: ['--disable-component-extensions-with-background-pages', '--disable-background-networking', '--disable-component-update', '--disable-extensions', '--disable-default-apps', '--mute-audio'],
});
const page = await browser.newPage();
await page.goto('http://localhost:4000/login');
await page.click('body');
// Passed as strings: tsx would otherwise inject helpers the page does not have.
const run = (cancelFirst: boolean, waitVoices: boolean) =>
  page.evaluate(`new Promise(async (resolve) => {
    const log = [];
    const t0 = performance.now();
    if (${waitVoices}) {
      for (let i = 0; i < 50 && !speechSynthesis.getVoices().some((v) => v.lang === 'ja-JP'); i++) await new Promise((r) => setTimeout(r, 100));
    }
    const voice = speechSynthesis.getVoices().find((v) => v.lang === 'ja-JP' && /natural|online/i.test(v.name)) || null;
    log.push('voices=' + speechSynthesis.getVoices().length + ' voice=' + (voice ? voice.name : 'none'));
    if (${cancelFirst}) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('こんにちは');
    u.lang = 'ja-JP';
    if (voice) u.voice = voice;
    u.onstart = () => log.push('start@' + Math.round(performance.now() - t0));
    u.onend = () => { log.push('end@' + Math.round(performance.now() - t0)); resolve(log); };
    u.onerror = (e) => { log.push('error:' + e.error); resolve(log); };
    speechSynthesis.speak(u);
    setTimeout(() => { log.push('timeout, speaking=' + speechSynthesis.speaking + ' pending=' + speechSynthesis.pending); resolve(log); }, 8000);
  })`);
console.log('immediately, no wait for voices, cancel first:', await run(true, false));
console.log('after voices load, cancel first:            ', await run(true, true));
console.log('after voices load, no cancel:               ', await run(false, true));
await browser.close();
