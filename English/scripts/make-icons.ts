// Renders public/favicon.svg to the PNG icons the PWA manifest needs.
// Uses the locally installed Microsoft Edge (or Chrome) through playwright-core.
//   npx tsx scripts/make-icons.ts

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const svg = fs.readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
const outDir = path.join(root, 'public/icons');
fs.mkdirSync(outDir, { recursive: true });

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      /* try the next browser */
    }
  }
  throw new Error('Neither Microsoft Edge nor Google Chrome was found.');
}

const browser = await launch();
const page = await browser.newPage();
for (const [name, size, pad] of [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-512-maskable.png', 512, 0.12],
] as const) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(
    `<html><body style="margin:0;background:${pad ? '#4f46e5' : 'transparent'};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
     <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: path.join(outDir, name), omitBackground: !pad });
  console.log(`✓ public/icons/${name}`);
}
await browser.close();
