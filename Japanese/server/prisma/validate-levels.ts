// Checks the N4+ day files before seeding.
// Usage (from server/): npx tsx prisma/validate-levels.ts [file-prefix ...]
//   e.g. npx tsx prisma/validate-levels.ts n3-u01 n3-u02   (only report those files)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { LevelDayContent, QuestionDef } from './content/types.js';
import { OUTLINE } from './content/program-outline.js';
import { KANJI } from './content/kanji.js';
import { VOCAB_A } from './content/vocab-a.js';
import { VOCAB_B } from './content/vocab-b.js';
import { GRAMMAR_A } from './content/grammar-a.js';
import { GRAMMAR_B } from './content/grammar-b.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'content', 'levels');
const only = process.argv.slice(2);
const isReported = (f: string) => only.length === 0 || only.some((p) => f.startsWith(p));
// Files you are not checking are registered first, so an item that another
// file already uses is reported in the file being written now.
const files = fs
  .readdirSync(dir)
  .filter((f) => /^n\d-u\d\d\.ts$/.test(f))
  .sort((a, b) => Number(isReported(a)) - Number(isReported(b)) || order(a) - order(b));
function order(f: string) {
  const [, lvl, u] = f.match(/^n(\d)-u(\d\d)/)!;
  return (6 - Number(lvl)) * 100 + Number(u);
}

const outlineDays = new Map(OUTLINE.flatMap((u, i) => u.days.map((d) => [d.slug, { ...d, unit: i }] as const)));
const usedKanji = new Map<string, string>(Object.values(KANJI).flat().map((k) => [k.char, 'N5']));
const usedWords = new Map<string, string>(
  [...Object.values(VOCAB_A), ...Object.values(VOCAB_B)].flatMap((g) => g.items).map((v) => [`${v[0]}|${v[1]}`, 'N5']),
);
const usedGrammar = new Map<string, string>([...GRAMMAR_A, ...GRAMMAR_B].map((g) => [g.slug, 'N5']));
const seenDays = new Set<string>();

const POS = new Set(['noun', 'pronoun', 'verb1', 'verb2', 'verb3', 'i-adj', 'na-adj', 'adverb', 'expression', 'question', 'number', 'counter', 'suffix', 'prenoun', 'conjunction']);
const CATEGORIES = new Set(['particles', 'verbs', 'adjectives', 'grammar', 'numbers', 'expressions']);
const CHOICE = new Set(['multiple_choice', 'fill_blank', 'listening', 'kanji_reading', 'ja_to_mn', 'mn_to_ja']);
const CYR = /[а-яёөү]/i;
const JA = /[぀-ヿ一-龯]/;
const KANA_ONLY = /^[぀-ヿー・〜、。 ]+$/;
const LISTENING_TYPES = new Set(['numbers', 'task', 'point', 'utterance', 'response']);

let errors = 0;
let warnings = 0;
let days = 0;

function checkQuestion(q: QuestionDef, where: string, err: (m: string) => void, listening = false) {
  if (listening && q.type !== 'listening') err(`${where}: listening questions must have type 'listening'`);
  if (q.type === 'true_false') {
    if (q.answer !== 'true' && q.answer !== 'false') err(`${where}: true_false answer must be 'true' or 'false'`);
  } else if (CHOICE.has(q.type)) {
    const opts = q.options ?? [];
    if (opts.length < 3 || opts.length > 4) err(`${where}: needs 3–4 options (has ${opts.length})`);
    if (new Set(opts).size !== opts.length) err(`${where}: duplicate options`);
    if (!opts.includes(q.answer)) err(`${where}: answer "${q.answer}" is not one of the options`);
  } else {
    err(`${where}: unsupported question type ${q.type} (use multiple_choice, fill_blank, true_false, listening)`);
  }
  if (!q.explanation || q.explanation.length < 4) err(`${where}: needs an explanation (Mongolian, may quote the text)`);
  if (!q.prompt) err(`${where}: empty prompt`);
}

for (const file of files) {
  const report = isReported(file);
  const mod = (await import(pathToFileURL(path.join(dir, file)).href)) as Record<string, LevelDayContent[]>;
  const list: LevelDayContent[] = Object.values(mod).find((v) => Array.isArray(v)) ?? [];
  const msgs: string[] = [];
  const fileTag = file.replace('.ts', '');
  for (const d of list) {
    days++;
    const err = (m: string) => {
      if (report) msgs.push(`  ✗ ${d.slug}: ${m}`);
      if (report) errors++;
    };
    const warn = (m: string) => {
      if (report) msgs.push(`  ! ${d.slug}: ${m}`);
      if (report) warnings++;
    };
    const outline = outlineDays.get(d.slug);
    if (!outline) err('slug is not an outline day');
    else if (!file.startsWith(d.slug.slice(0, 2))) err('day belongs to another level file');
    if (seenDays.has(d.slug)) err('day written twice');
    seenDays.add(d.slug);

    if (!CYR.test(d.intro) || d.intro.length < 40) err('intro must be a Mongolian paragraph');
    if (d.objectives.length < 2) err('needs at least 2 objectives');

    if (d.words.length < 6 || d.words.length > 10) err(`needs 6–10 words (has ${d.words.length})`);
    for (const w of d.words) {
      const [word, kana, mn, en, pos, ex, exMn] = w;
      if (w.length !== 7) err(`word ${word}: tuple must have 7 fields`);
      if (!KANA_ONLY.test(kana)) err(`word ${word}: reading "${kana}" must be kana only`);
      if (!CYR.test(mn)) err(`word ${word}: meaning must be Mongolian`);
      if (!en) err(`word ${word}: missing English meaning`);
      if (!POS.has(pos)) err(`word ${word}: unknown part of speech ${pos}`);
      if (!JA.test(ex) || !/[。？！]$/.test(ex)) err(`word ${word}: example must be a Japanese sentence ending with 。/？/！`);
      if (!CYR.test(exMn)) err(`word ${word}: example translation must be Mongolian`);
      const key = `${word}|${kana}`;
      const prev = usedWords.get(key);
      if (prev) err(`word ${word}（${kana}） already taught in ${prev} — choose another word`);
      usedWords.set(key, fileTag);
    }

    if (d.kanji.length < 2 || d.kanji.length > 4) err(`needs 2–4 kanji (has ${d.kanji.length})`);
    for (const k of d.kanji) {
      if ([...k.char].length !== 1 || !/[一-龯]/.test(k.char)) err(`kanji "${k.char}" must be one kanji`);
      const prev = usedKanji.get(k.char);
      if (prev) err(`kanji ${k.char} already taught in ${prev} — choose another kanji`);
      usedKanji.set(k.char, fileTag);
      if (!CYR.test(k.meaning)) err(`kanji ${k.char}: meaning must be Mongolian`);
      if (k.strokes < 1 || k.strokes > 30) err(`kanji ${k.char}: stroke count looks wrong`);
      if (k.examples.length < 2) err(`kanji ${k.char}: needs ≥2 example words`);
      for (const [word, reading] of k.examples) if (!KANA_ONLY.test(reading)) err(`kanji ${k.char}: example reading "${reading}" for ${word} must be kana`);
      if (!JA.test(k.sentence[0]) || !CYR.test(k.sentence[1])) err(`kanji ${k.char}: sentence must be [japanese, mongolian]`);
    }

    if (d.grammar.length < 1 || d.grammar.length > 2) err(`needs 1–2 grammar points (has ${d.grammar.length})`);
    for (const g of d.grammar) {
      const prev = usedGrammar.get(g.slug);
      if (prev) err(`grammar slug ${g.slug} already used in ${prev}`);
      usedGrammar.set(g.slug, fileTag);
      if (!g.slug.startsWith(d.slug.slice(0, 2) + '-')) err(`grammar slug ${g.slug} must start with "${d.slug.slice(0, 2)}-"`);
      if (!CATEGORIES.has(g.category)) err(`grammar ${g.slug}: unknown category ${g.category}`);
      if (!CYR.test(g.explanation) || g.explanation.length < 120) err(`grammar ${g.slug}: explanation must be a full Mongolian paragraph`);
      if (g.examples.length < 3) err(`grammar ${g.slug}: needs ≥3 examples`);
      for (const [ja, mn] of g.examples) if (!JA.test(ja) || !CYR.test(mn)) err(`grammar ${g.slug}: example must be [japanese, mongolian]`);
      if (g.mistakes.length < 1) err(`grammar ${g.slug}: needs ≥1 common mistake`);
      if (g.questions.length < 3) err(`grammar ${g.slug}: needs ≥3 questions`);
      g.questions.forEach((q, i) => checkQuestion(q, `grammar ${g.slug} q${i + 1}`, err));
    }

    if (d.dialogue && d.dialogue.length < 2) err('dialogue needs ≥2 lines (or leave it out)');
    if (!d.dialogue) warn('no dialogue (recommended: 3–5 lines)');

    const minPassage = d.slug.startsWith('n4') ? 100 : d.slug.startsWith('n3') ? 180 : 250;
    if (d.reading.passage.length < minPassage) err(`reading passage too short (${d.reading.passage.length} < ${minPassage} chars)`);
    if (d.reading.questions.length < 2) err('reading needs ≥2 questions');
    d.reading.questions.forEach((q, i) => checkQuestion(q, `reading q${i + 1}`, err));

    const l = d.listening;
    if (!LISTENING_TYPES.has(l.type)) err(`listening type ${l.type} is not allowed`);
    if (l.script.length < 3) err('listening script needs ≥3 lines');
    for (const s of l.script) if (!s.speaker || !JA.test(s.ja) || !CYR.test(s.mn)) err('listening line needs speaker, ja and mn');
    if (!CYR.test(l.context)) err('listening context must be Mongolian');
    if (l.questions.length < 2) err('listening needs ≥2 questions');
    l.questions.forEach((q, i) => checkQuestion(q, `listening q${i + 1}`, err, true));

    const sp = d.speaking;
    if (!JA.test(sp.prompt) || !CYR.test(sp.promptMn) || !CYR.test(sp.hint)) err('speaking needs prompt (ja), promptMn and hint (mn)');
    if (sp.expected.length < 2) err('speaking needs ≥2 model answers');
    if (sp.keywords.length < 2) err('speaking needs ≥2 keywords');
  }
  if (report && (msgs.length || list.length)) {
    console.log(`${file}: ${list.length} days`);
    for (const m of msgs) console.log(m);
  }
}

const expected = only.length ? '' : ` / ${outlineDays.size} outline days`;
console.log(`\n${days} days written${expected}; ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
