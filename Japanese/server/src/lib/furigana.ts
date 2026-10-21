import { createRequire } from 'node:module';
import path from 'node:path';
import kuromoji from 'kuromoji';
import { prisma } from './prisma.js';
import { parseJson } from './json.js';

/** A run of text; `r` is the furigana shown above it (kanji runs only). */
export interface RubySeg {
  t: string;
  r?: string;
}

const require = createRequire(import.meta.url);
const dicPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');

type Tokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;
let tokenizerPromise: Promise<Tokenizer> | null = null;

/** Loads the IPADIC dictionary once (≈1–2 s); later calls reuse it. */
export function getTokenizer(): Promise<Tokenizer> {
  tokenizerPromise ??= new Promise<Tokenizer>((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
  });
  return tokenizerPromise;
}

const KANJI = /[一-龯々〆ヶ]/;
const KANA = /[぀-ヿー]/;

export const hasKanji = (s: string) => KANJI.test(s);

export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 食べます / たべます → [食|た] べます — furigana only above the kanji part. */
export function splitRuby(surface: string, reading: string): RubySeg[] {
  // Kana in the surface may be katakana (モンゴル人) while the reading is hiragana.
  const same = (a: string, b: string) => KANA.test(a) && toHiragana(a) === b;
  let start = 0;
  while (start < surface.length && start < reading.length && same(surface[start], reading[start])) start++;
  let end = 0;
  while (end < surface.length - start && end < reading.length - start && same(surface[surface.length - 1 - end], reading[reading.length - 1 - end])) end++;
  const segs: RubySeg[] = [];
  if (start) segs.push({ t: surface.slice(0, start) });
  const core = surface.slice(start, surface.length - end);
  const rt = reading.slice(start, reading.length - end);
  segs.push(rt && rt !== core ? { t: core, r: rt } : { t: core });
  if (end) segs.push({ t: surface.slice(surface.length - end) });
  return segs;
}

// Readings written by hand in the course content win over the analyser's guess
// (e.g. 六百 → ろっぴゃく, 一人 → ひとり).
let overrides: Promise<Map<string, string>> | null = null;
function knownReadings(): Promise<Map<string, string>> {
  overrides ??= (async () => {
    const map = new Map<string, string>();
    const [vocab, kanji] = await Promise.all([
      prisma.vocabulary.findMany({ select: { word: true, kana: true } }),
      prisma.kanji.findMany({ select: { examples: true } }),
    ]);
    const add = (word: string, reading: string) => {
      if (word.length >= 2 && hasKanji(word) && reading && !/[、。〜（(/]/.test(word + reading)) map.set(word, toHiragana(reading));
    };
    for (const k of kanji) for (const ex of parseJson<{ word: string; reading: string }[]>(k.examples, [])) add(ex.word, ex.reading);
    for (const v of vocab) add(v.word, v.kana);
    return map;
  })();
  return overrides;
}

/** Forget cached readings (after the content was re-seeded). */
export function resetFuriganaCache() {
  overrides = null;
  cache.clear();
}

function merge(segs: RubySeg[]): RubySeg[] {
  const out: RubySeg[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && !last.r && !s.r) last.t += s.t;
    else out.push({ ...s });
  }
  return out;
}

const cache = new Map<string, RubySeg[]>();
const CACHE_LIMIT = 20_000;

export async function furigana(text: string): Promise<RubySeg[]> {
  if (!hasKanji(text)) return [{ t: text }];
  const hit = cache.get(text);
  if (hit) return hit;
  const [tokenizer, known] = await Promise.all([getTokenizer(), knownReadings()]);
  const tokens = tokenizer.tokenize(text);
  const segs: RubySeg[] = [];
  for (let i = 0; i < tokens.length; i++) {
    // Up to three adjacent tokens can form one known word (一 + 人 → ひとり).
    let matched = false;
    for (let n = Math.min(3, tokens.length - i); n >= 1; n--) {
      const surface = tokens.slice(i, i + n).map((t) => t.surface_form).join('');
      const reading = known.get(surface);
      if (reading) {
        segs.push(...splitRuby(surface, reading));
        i += n - 1;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const tok = tokens[i];
    const surface = tok.surface_form;
    if (!hasKanji(surface) || !tok.reading || tok.reading === '*') {
      segs.push({ t: surface });
      continue;
    }
    let reading = toHiragana(tok.reading);
    // 何 is read なん before d/t/n sounds: 何ですか, 何の, 何と.
    if (surface === '何' && /^[でだどのとつ]/.test(tokens[i + 1]?.surface_form ?? '')) reading = 'なん';
    // 来る changes its stem: 来る/来れば (く), 来ます/来て/来た (き), 来ない/来られる/来よう/来させる (こ).
    const after = surface.slice(1) + tokens.slice(i + 1, i + 3).map((t) => t.surface_form).join('');
    if (surface[0] === '来' && /^[ぁ-ん]*$/.test(surface.slice(1)) && /^[るれまてたなられよさ]/.test(after)) {
      reading = (/^[るれ]/.test(after) ? 'く' : /^[なられよさ]/.test(after) ? 'こ' : 'き') + surface.slice(1);
    }
    segs.push(...splitRuby(surface, reading));
  }
  const result = merge(segs);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(text, result);
  return result;
}
