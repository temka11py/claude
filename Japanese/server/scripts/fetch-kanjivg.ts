/* Downloads KanjiVG stroke-order SVGs (CC BY-SA 3.0, https://kanjivg.tagaini.net)
   for every kanji and single kana character in the database into client/public/kanjivg. */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

process.loadEnvFile?.('.env');
const prisma = new PrismaClient();
const outDir = path.resolve('../client/public/kanjivg');
const BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji';

const hex = (ch: string) => ch.codePointAt(0)!.toString(16).padStart(5, '0');

async function main() {
  const [kanji, kana] = await Promise.all([prisma.kanji.findMany({ select: { char: true } }), prisma.kana.findMany({ select: { char: true } })]);
  const chars = [...new Set([...kanji.map((k) => k.char), ...kana.flatMap((k) => [...k.char])])].filter((c) => c !== 'ー');
  fs.mkdirSync(outDir, { recursive: true });
  let ok = 0;
  for (const ch of chars) {
    const file = path.join(outDir, `${hex(ch)}.svg`);
    if (fs.existsSync(file)) { ok++; continue; }
    const res = await fetch(`${BASE}/${hex(ch)}.svg`);
    if (!res.ok) { console.warn(`missing ${ch} (${res.status})`); continue; }
    fs.writeFileSync(file, await res.text());
    ok++;
  }
  console.log(`${ok}/${chars.length} stroke-order files ready in ${outDir}`);
}
main().finally(() => prisma.$disconnect());
