/* eslint-disable no-console */
import fs from 'node:fs';
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { kanaToRomaji, tokenRomaji, hasKanji } from '../src/lib/kana.js';
import { MODULES } from './content/curriculum.js';
import { HIRAGANA, KATAKANA, type KanaSection } from './content/kana.js';
import { VOCAB_A } from './content/vocab-a.js';
import { VOCAB_B } from './content/vocab-b.js';
import { KANJI } from './content/kanji.js';
import { GRAMMAR_A } from './content/grammar-a.js';
import { GRAMMAR_B } from './content/grammar-b.js';
import { STORIES, FUNCTION_GLOSSES } from './content/stories.js';
import { READINGS } from './content/reading.js';
import { LISTENING } from './content/listening.js';
import { SPEAKING, TRANSLATIONS, ACHIEVEMENTS } from './content/practice.js';
import { MOCK_EXAM } from './content/mock-exam.js';
import type { GrammarDef, KanjiDef, ListeningDef, ModuleDef, QuestionDef, SpeakingDef, VocabTuple } from './content/types.js';
import { LEVEL_CONTENT } from './content/levels/index.js';
import { OUTLINE } from './content/program-outline.js';
import { planProgram } from './program-build.js';
import { adoptCompletedLessons, restoreLearning, snapshotLearning, type LearningSnapshot } from './preserve.js';

process.loadEnvFile?.('.env');
const prisma = new PrismaClient();

// ───────────── N4+ day content → the same shapes as the N5 content ─────────────
const levelBySlug = new Map(LEVEL_CONTENT.map((d) => [d.slug, d]));
const LEVEL_MODULES: ModuleDef[] = [];
const LEVEL_VOCAB: Record<string, { topic: string; items: VocabTuple[] }> = {};
const LEVEL_KANJI: Record<string, KanjiDef[]> = {};
const LEVEL_GRAMMAR: GrammarDef[] = [];
const LEVEL_LISTENING: ListeningDef[] = [];
const LEVEL_SPEAKING: SpeakingDef[] = [];
const levelReadings = new Map<string, number[]>();
const ALL_READINGS = [...READINGS];
OUTLINE.forEach((unit, u) => {
  const lessons = unit.days.flatMap((day) => {
    const c = levelBySlug.get(day.slug);
    if (!c) return [];
    LEVEL_VOCAB[day.slug] = { topic: day.title, items: c.words };
    LEVEL_KANJI[day.slug] = c.kanji;
    LEVEL_GRAMMAR.push(...c.grammar.map((g) => ({ ...g, lesson: day.slug })));
    LEVEL_LISTENING.push({ ...c.listening, slug: `${day.slug}-listening`, lesson: day.slug });
    LEVEL_SPEAKING.push({ ...c.speaking, slug: `${day.slug}-speaking` });
    levelReadings.set(day.slug, [ALL_READINGS.length]);
    ALL_READINGS.push({ lesson: day.slug, passage: c.reading.passage, questions: c.reading.questions });
    return [{ key: day.slug, slug: day.slug, title: day.title, titleJa: day.titleJa, summary: c.intro.split('。')[0], objectives: c.objectives, intro: c.intro, dialogue: c.dialogue, minutes: 25 }];
  });
  if (lessons.length) LEVEL_MODULES.push({ order: 100 + u, slug: `${unit.level.toLowerCase()}-unit-${u + 1}`, title: `${unit.level}: ${unit.title}`, titleJa: unit.titleJa, description: unit.title, lessons });
});
const ALL_MODULES = [...MODULES, ...LEVEL_MODULES];
const ALL_LISTENING = [...LISTENING, ...LEVEL_LISTENING];
const ALL_SPEAKING = [...SPEAKING, ...LEVEL_SPEAKING];

// ───────────── deterministic randomness ─────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260926);
function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = <T,>(items: T[], n: number) => shuffle(items).slice(0, n);
const uniq = <T,>(items: T[]) => [...new Set(items)];

/** Choose `n` distractors distinct from the answer (and from each other). */
function distractors(answer: string, pool: string[], n = 3): string[] {
  return pick(uniq(pool.filter((p) => p && p !== answer)), n);
}

// ───────────── question buffer ─────────────
interface NewQuestion {
  key: string;
  type: string;
  category: string;
  section?: string;
  prompt: string;
  passage?: string | null;
  audioText?: string | null;
  options: unknown;
  correctAnswer: string;
  explanation: string;
  difficulty?: number;
  lessonId?: number | null;
  grammarId?: number | null;
}
const questions: NewQuestion[] = [];
const addQuestion = (q: NewQuestion) => questions.push(q);

/** Turn a hand-written QuestionDef into a stored question (shuffling choice options). */
function fromDef(def: QuestionDef, key: string, extra: Partial<NewQuestion>): NewQuestion {
  const options = def.type === 'true_false' ? [] : def.options ? shuffle(def.options) : [];
  return {
    key,
    type: def.type,
    category: def.category ?? extra.category ?? 'grammar',
    section: def.section ?? '',
    prompt: def.prompt,
    passage: def.passage ?? extra.passage ?? null,
    audioText: def.audioText ?? extra.audioText ?? null,
    options,
    correctAnswer: def.answer,
    explanation: def.explanation,
    difficulty: def.difficulty ?? extra.difficulty ?? 1,
    lessonId: extra.lessonId ?? null,
    grammarId: extra.grammarId ?? null,
  };
}

const POS_MN: Record<string, string> = {
  noun: 'нэр үг', pronoun: 'төлөөний үг', verb1: 'үйл үг (I бүлэг)', verb2: 'үйл үг (II бүлэг)', verb3: 'үйл үг (III бүлэг)',
  'i-adj': 'い тэмдэг нэр', 'na-adj': 'な тэмдэг нэр', adverb: 'дайвар үг', expression: 'хэллэг', question: 'асуух үг',
  number: 'тоо', counter: 'тоолох дагавар', suffix: 'дагавар', prenoun: 'тодотгол үг', conjunction: 'холбоос үг',
};

async function resetContent() {
  // Learning data that references content is cleared together with the content.
  await prisma.quizAnswer.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.quizQuestion.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.question.deleteMany();
  await prisma.reviewItem.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.userProgress.deleteMany();
  await prisma.story.deleteMany();
  await prisma.listeningExercise.deleteMany();
  await prisma.speakingPrompt.deleteMany();
  await prisma.kana.deleteMany();
  await prisma.vocabulary.deleteMany();
  await prisma.kanji.deleteMany();
  await prisma.grammar.deleteMany();
  await prisma.programDay.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.module.deleteMany();
}

async function main() {
  console.log('Seeding Hanamaru content…');
  // The snapshot is kept on disk until progress is restored, so a seed that
  // fails half-way can simply be run again without losing anyone's progress.
  const snapshotFile = new URL('./.learning-snapshot.json', import.meta.url);
  const snapshot: LearningSnapshot = fs.existsSync(snapshotFile) ? JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) : await snapshotLearning(prisma);
  if (!fs.existsSync(snapshotFile)) fs.writeFileSync(snapshotFile, JSON.stringify(snapshot));
  else console.log('  resuming with the saved progress snapshot from an unfinished seed');
  await resetContent();

  // ───────────── modules & lessons ─────────────
  const lessonIds = new Map<string, number>();
  const lessonModule = new Map<number, number>(); // lessonId → module order
  let globalOrder = 0;
  for (const mod of ALL_MODULES) {
    const created = await prisma.module.create({
      data: { order: mod.order, slug: mod.slug, title: mod.title, titleJa: mod.titleJa, description: mod.description },
    });
    for (const [i, l] of mod.lessons.entries()) {
      globalOrder++;
      const lesson = await prisma.lesson.create({
        data: {
          moduleId: created.id,
          order: i + 1,
          globalOrder,
          slug: l.slug,
          title: l.title,
          titleJa: l.titleJa,
          summary: l.summary,
          minutes: l.minutes ?? 15,
          objectives: JSON.stringify(l.objectives),
          content: JSON.stringify({ intro: l.intro, examples: l.examples ?? [], dialogue: l.dialogue ?? null, tips: l.tips ?? [], links: l.links ?? [] }),
        },
      });
      lessonIds.set(l.key, lesson.id);
      lessonModule.set(lesson.id, mod.order);
    }
  }
  const lessonId = (key: string) => {
    const id = lessonIds.get(key);
    if (!id) throw new Error(`Unknown lesson key ${key}`);
    return id;
  };
  console.log(`  ${ALL_MODULES.length} modules, ${globalOrder} lessons`);

  // ───────────── kana ─────────────
  const kanaRows: { id: number; char: string; romaji: string; script: string; group: string; lessonId: number | null }[] = [];
  for (const [script, sections] of [['hiragana', HIRAGANA], ['katakana', KATAKANA]] as [string, KanaSection[]][]) {
    let order = 0;
    for (const section of sections) {
      for (const [char, romaji, row, example, exampleReading, exampleMeaning, note] of section.items) {
        const k = await prisma.kana.create({
          data: { char, romaji, script, group: section.group, row, order: ++order, example, exampleReading, exampleMeaning, note: note ?? '', lessonId: lessonId(section.lesson) },
        });
        kanaRows.push({ id: k.id, char, romaji, script, group: section.group, lessonId: k.lessonId });
      }
    }
  }
  console.log(`  ${kanaRows.length} kana`);

  // kana questions: character → sound, sound → character, typing
  for (const k of kanaRows) {
    if (k.group === 'sokuon' || k.romaji.startsWith('(')) continue;
    const same = kanaRows.filter((o) => o.script === k.script && o.id !== k.id && !o.romaji.startsWith('('));
    const near = same.filter((o) => o.group === k.group);
    const pool = near.length >= 6 ? near : same;
    const canonical = k.romaji.split('|')[0];
    const scriptMn = k.script === 'hiragana' ? 'хирагана' : 'катакана';
    const base = `kana-${k.script}-${k.group}`;
    addQuestion({
      key: `${base}-c2s-${k.id}`, type: 'multiple_choice', category: 'kana', lessonId: k.lessonId,
      prompt: `「${k.char}」 хэрхэн дуудагдах вэ?`,
      options: shuffle([canonical, ...distractors(canonical, pool.map((p) => p.romaji.split('|')[0]))]),
      correctAnswer: canonical, explanation: `${k.char} = ${canonical} (${scriptMn}).`,
    });
    addQuestion({
      key: `${base}-s2c-${k.id}`, type: 'multiple_choice', category: 'kana', lessonId: k.lessonId,
      prompt: `"${canonical}" авиаг ${scriptMn}аар аль нь вэ?`,
      options: shuffle([k.char, ...distractors(k.char, pool.map((p) => p.char))]),
      correctAnswer: k.char, explanation: `"${canonical}" = ${k.char}.`,
    });
    addQuestion({
      key: `${base}-type-${k.id}`, type: 'typing', category: 'kana', lessonId: k.lessonId,
      prompt: `「${k.char}」-г ромаджиар бичнэ үү.`,
      options: [], correctAnswer: k.romaji.split('|').join('||'), explanation: `${k.char} = ${canonical}.`,
    });
  }

  // ───────────── vocabulary ─────────────
  const vocabRows: { id: number; word: string; kana: string; meaning: string; pos: string; lessonId: number; romaji: string; example: string; exampleMn: string }[] = [];
  const seen = new Set<string>();
  for (const source of [VOCAB_A, VOCAB_B, LEVEL_VOCAB]) {
    for (const [key, group] of Object.entries(source)) {
      const lid = lessonId(key);
      const moduleOrder = lessonModule.get(lid) ?? 0;
      for (const [word, kana, meaning, meaningEn, pos, example, exampleMn] of group.items) {
        const dedupe = `${word}|${kana}`;
        if (seen.has(dedupe)) {
          console.warn(`  ! duplicate vocabulary skipped: ${word}`);
          continue;
        }
        seen.add(dedupe);
        const romaji = kanaToRomaji(kana.replace(/[、。〜]/g, ' ')).replace(/\s+/g, ' ').trim();
        const v = await prisma.vocabulary.create({
          data: {
            word, kana, romaji, meaning, meaningEn, partOfSpeech: pos, example, exampleMn,
            difficulty: moduleOrder <= 3 ? 1 : moduleOrder <= 6 ? 2 : 3,
            topic: group.topic, lessonId: lid,
          },
        });
        vocabRows.push({ id: v.id, word, kana, meaning, pos, lessonId: lid, romaji, example, exampleMn });
      }
    }
  }
  console.log(`  ${vocabRows.length} vocabulary`);

  // ───────────── kanji ─────────────
  const kanjiRows: { id: number; char: string; meaning: string; lessonId: number; firstWord: [string, string, string] }[] = [];
  let kanjiOrder = 0;
  for (const [key, list] of Object.entries({ ...KANJI, ...LEVEL_KANJI })) {
    for (const k of list) {
      const row = await prisma.kanji.create({
        data: {
          char: k.char, meaning: k.meaning, meaningEn: k.en, onyomi: k.on, kunyomi: k.kun, strokes: k.strokes,
          examples: JSON.stringify(k.examples.map(([word, reading, meaning]) => ({ word, reading, meaning }))),
          sentences: JSON.stringify([{ ja: k.sentence[0], mn: k.sentence[1] }]),
          order: ++kanjiOrder, lessonId: lessonId(key),
        },
      });
      kanjiRows.push({ id: row.id, char: k.char, meaning: k.meaning, lessonId: row.lessonId!, firstWord: k.examples[0] });
    }
  }
  const kanjiByChar = new Map(kanjiRows.map((k) => [k.char, k.id]));
  for (const v of vocabRows) {
    const ids = uniq([...v.word].map((c) => kanjiByChar.get(c)).filter((x): x is number => !!x));
    if (ids.length) await prisma.vocabulary.update({ where: { id: v.id }, data: { kanji: { connect: ids.map((id) => ({ id })) } } });
  }
  console.log(`  ${kanjiRows.length} kanji`);

  // vocabulary questions
  for (const [i, v] of vocabRows.entries()) {
    const lessonPool = vocabRows.filter((o) => o.lessonId === v.lessonId && o.id !== v.id);
    const posPool = vocabRows.filter((o) => o.pos === v.pos && o.id !== v.id);
    const pool = lessonPool.length >= 3 ? [...lessonPool, ...posPool] : [...posPool, ...vocabRows];
    const meaningOpts = uniq([v.meaning, ...distractors(v.meaning, pool.map((p) => p.meaning), 6)]).slice(0, 4);
    const label = v.word === v.kana ? v.word : `${v.word}（${v.kana}）`;
    const explain = `${label} — ${v.meaning} [${POS_MN[v.pos] ?? v.pos}]. Жишээ: ${v.example} — ${v.exampleMn}`;
    addQuestion({
      key: `vocab-mean-${v.id}`, type: 'multiple_choice', category: 'vocabulary', lessonId: v.lessonId,
      prompt: `「${v.word}」 гэдэг үгийн утга аль нь вэ?`, options: shuffle(meaningOpts), correctAnswer: v.meaning, explanation: explain,
    });
    const wordOpts = uniq([v.word, ...distractors(v.word, pool.map((p) => p.word), 6)]).slice(0, 4);
    addQuestion({
      key: `vocab-rev-${v.id}`, type: 'mn_to_ja', category: 'vocabulary', lessonId: v.lessonId,
      prompt: `「${v.meaning}」 гэдэг нь япон хэлээр аль нь вэ?`, options: shuffle(wordOpts), correctAnswer: v.word, explanation: explain,
    });
    if (hasKanji(v.word) && v.word !== v.kana) {
      const readingPool = vocabRows.filter((o) => o.id !== v.id && o.kana.length >= v.kana.length - 1 && o.kana.length <= v.kana.length + 2).map((o) => o.kana);
      const readOpts = uniq([v.kana, ...distractors(v.kana, readingPool, 6)]).slice(0, 4);
      addQuestion({
        key: `vocab-read-${v.id}`, type: 'kanji_reading', category: 'kanji-reading', lessonId: v.lessonId,
        prompt: `「${v.word}」-ийн уншлага аль нь вэ?`, options: shuffle(readOpts), correctAnswer: v.kana, explanation: `${v.word} = ${v.kana} (${v.romaji}) — ${v.meaning}.`,
      });
    }
    if (i % 3 === 0) {
      const truthful = rand() < 0.5;
      const shown = truthful ? v.meaning : distractors(v.meaning, pool.map((p) => p.meaning), 1)[0] ?? v.meaning;
      addQuestion({
        key: `vocab-tf-${v.id}`, type: 'true_false', category: 'vocabulary', lessonId: v.lessonId,
        prompt: `「${v.word}」 гэдэг үг "${shown}" гэсэн утгатай.`, options: [], correctAnswer: String(shown === v.meaning), explanation: explain,
      });
    }
  }

  // matching per lesson
  const byLesson = new Map<number, typeof vocabRows>();
  for (const v of vocabRows) byLesson.set(v.lessonId, [...(byLesson.get(v.lessonId) ?? []), v]);
  for (const [lid, items] of byLesson) {
    const chosen = pick(items.filter((v, i, arr) => arr.findIndex((o) => o.meaning === v.meaning) === i), 4);
    if (chosen.length < 4) continue;
    addQuestion({
      key: `match-lesson-${lid}`, type: 'matching', category: 'vocabulary', lessonId: lid,
      prompt: 'Үг бүрийг утгатай нь холбоно уу.',
      options: { left: chosen.map((c) => c.word), right: chosen.map((c) => c.meaning) },
      correctAnswer: JSON.stringify(chosen.map((c) => c.meaning)),
      explanation: chosen.map((c) => `${c.word} = ${c.meaning}`).join('; '),
    });
  }

  // kanji questions
  for (const k of kanjiRows) {
    const pool = kanjiRows.filter((o) => o.id !== k.id);
    addQuestion({
      key: `kanji-mean-${k.id}`, type: 'multiple_choice', category: 'kanji-meaning', lessonId: k.lessonId,
      prompt: `「${k.char}」 ханзны утга аль нь вэ?`,
      options: shuffle([k.meaning, ...distractors(k.meaning, pool.map((p) => p.meaning))]), correctAnswer: k.meaning,
      explanation: `${k.char} — ${k.meaning}.`,
    });
    const [word, reading, meaning] = k.firstWord;
    if (word !== reading) {
      const readingPool = kanjiRows.filter((o) => o.id !== k.id).map((o) => o.firstWord[1]);
      addQuestion({
        key: `kanji-read-${k.id}`, type: 'kanji_reading', category: 'kanji-reading', lessonId: k.lessonId,
        prompt: `「${word}」-ийн уншлага аль нь вэ?`,
        options: shuffle([reading, ...distractors(reading, readingPool)]), correctAnswer: reading,
        explanation: `${word}（${reading}）— ${meaning}.`,
      });
    }
  }

  // ───────────── grammar ─────────────
  const grammarAll = [...GRAMMAR_A, ...GRAMMAR_B, ...LEVEL_GRAMMAR];
  const grammarRows: { id: number; slug: string; title: string; lessonId: number; category: string; examples: [string, string][] }[] = [];
  for (const [i, g] of grammarAll.entries()) {
    const lid = lessonId(g.lesson);
    const row = await prisma.grammar.create({
      data: {
        slug: g.slug, title: g.title, meaning: g.meaning, structure: g.structure, explanation: g.explanation,
        examples: JSON.stringify(g.examples.map(([ja, mn]) => ({ ja, mn }))),
        mistakes: JSON.stringify(g.mistakes), category: g.category, order: i + 1, lessonId: lid,
      },
    });
    grammarRows.push({ id: row.id, slug: g.slug, title: g.title, lessonId: lid, category: g.category, examples: g.examples });
    const category = g.category === 'expressions' ? 'grammar' : g.category;
    g.questions.forEach((q, j) => addQuestion(fromDef(q, `gram-${g.slug}-${j}`, { lessonId: lid, grammarId: row.id, category: q.category ?? category, difficulty: (lessonModule.get(lid) ?? 1) > 6 ? 2 : 1 })));
  }
  console.log(`  ${grammarRows.length} grammar points`);

  // sentence comprehension (reading) questions from grammar examples
  const allExamples = grammarRows.flatMap((g) => g.examples.map(([ja, mn]) => ({ ja, mn, lessonId: g.lessonId })));
  for (const g of grammarRows) {
    g.examples.slice(0, 2).forEach(([ja, mn], i) => {
      if (ja.includes('→')) return;
      const pool = allExamples.filter((e) => e.mn !== mn).map((e) => e.mn);
      addQuestion({
        key: `sent-${g.slug}-${i}`, type: 'ja_to_mn', category: 'reading', lessonId: g.lessonId,
        prompt: `「${ja}」 — өгүүлбэрийн утгыг сонгоно уу.`,
        options: shuffle([mn, ...distractors(mn, pool)]), correctAnswer: mn, explanation: `${ja} = ${mn}`,
      });
    });
  }

  // ───────────── reading passages ─────────────
  ALL_READINGS.forEach((r, i) => r.questions.forEach((q, j) => addQuestion(fromDef(q, `read-${i}-${j}`, { lessonId: lessonId(r.lesson), category: 'reading', passage: r.passage }))));

  // ───────────── stories ─────────────
  const vocabByWord = new Map(vocabRows.map((v) => [v.word, v.id]));
  const vocabByKana = new Map<string, number | null>();
  for (const v of vocabRows) vocabByKana.set(v.kana, vocabByKana.has(v.kana) ? null : v.id); // null = ambiguous
  const PUNCT = /^[。、！？「」]$/;
  // Tokens are separated by spaces; glosses may contain spaces, so parts without any
  // Japanese character are glued back onto the previous token.
  const JA = /[　-ヿ一-龯＀-￯]/;
  const splitTokens = (markup: string) =>
    markup.split(' ').filter(Boolean).reduce<string[]>((acc, part) => {
      const continuation = !JA.test(part) || (/[а-яёөү]/i.test(part) && !part.includes('/'));
      if (continuation && acc.length) acc[acc.length - 1] += ` ${part}`;
      else acc.push(part);
      return acc;
    }, []);
  const storyIds = new Map<string, number>();
  for (const [order, s] of STORIES.entries()) {
    const sentences = s.sentences.map(([markup, mn]) => ({
      mn,
      tokens: splitTokens(markup).map((raw) => {
        const [surface, reading, lemma, ...rest] = raw.split('/');
        const gloss = rest.filter(Boolean).join('/');
        const r = reading || undefined;
        if (PUNCT.test(surface)) return { s: surface };
        const target = lemma || surface;
        const isFunctionWord = !lemma && surface in FUNCTION_GLOSSES;
        const vocabId = isFunctionWord ? undefined : gloss ? vocabByWord.get(target) : vocabByWord.get(target) ?? vocabByKana.get(target) ?? undefined;
        const g = gloss || (vocabId ? undefined : FUNCTION_GLOSSES[surface]);
        if (!vocabId && !g) console.warn(`  ! story "${s.slug}": no gloss for token "${surface}"`);
        return { s: surface, r: hasKanji(surface) ? r : undefined, ro: tokenRomaji(surface, r), vocabId: vocabId ?? undefined, gloss: g };
      }),
    }));
    const story = await prisma.story.create({
      data: {
        slug: s.slug, title: s.title, titleJa: s.titleJa, topic: s.topic, summary: s.summary, order: order + 1, level: 1,
        sentences: JSON.stringify(sentences), grammarNotes: JSON.stringify(s.grammarNotes), lessonId: lessonId(s.lesson),
      },
    });
    storyIds.set(s.slug, story.id);
    s.questions.forEach((q, j) => addQuestion(fromDef(q, `story-${s.slug}-${j}`, { lessonId: lessonId(s.lesson), category: 'reading' })));
  }
  console.log(`  ${STORIES.length} stories`);

  // ───────────── listening ─────────────
  const listeningIds = new Map<string, number>();
  for (const [order, l] of ALL_LISTENING.entries()) {
    const row = await prisma.listeningExercise.create({
      data: {
        slug: l.slug, title: l.title, type: l.type, order: order + 1, context: l.context,
        script: JSON.stringify(l.script), vocabulary: JSON.stringify(l.vocabulary.map(([word, reading, meaning]) => ({ word, reading, meaning }))),
        grammarNote: l.grammarNote,
      },
    });
    listeningIds.set(l.slug, row.id);
    const fullScript = l.script.map((line) => `${line.speaker}：${line.ja}`).join('\n');
    l.questions.forEach((q, j) => addQuestion(fromDef(q, `listen-${l.slug}-${j}`, { lessonId: l.lesson ? lessonId(l.lesson) : null, category: 'listening', audioText: fullScript })));
  }
  console.log(`  ${ALL_LISTENING.length} listening exercises`);

  // ───────────── speaking ─────────────
  const speakingIds = new Map<string, number>();
  for (const [order, sp] of ALL_SPEAKING.entries()) {
    const row = await prisma.speakingPrompt.create({
      data: { slug: sp.slug, order: order + 1, title: sp.title, prompt: sp.prompt, promptMn: sp.promptMn, hint: sp.hint, expected: JSON.stringify(sp.expected), keywords: JSON.stringify(sp.keywords) },
    });
    speakingIds.set(sp.slug, row.id);
  }

  // ───────────── translation ─────────────
  TRANSLATIONS.forEach((t, i) => {
    const lid = t.lesson ? lessonId(t.lesson) : null;
    addQuestion({
      key: `tr-jm-${i}`, type: 'ja_to_mn', category: 'translation', lessonId: lid,
      prompt: t.ja, options: { keywords: t.mnKeywords }, correctAnswer: t.mn, explanation: `Жишээ орчуулга: ${t.mn}`,
    });
    addQuestion({
      key: `tr-mj-${i}`, type: 'mn_to_ja', category: 'translation', lessonId: lid,
      prompt: t.mn, options: { keywords: t.jaKeywords }, correctAnswer: [t.ja, ...t.jaAccepted].join('||'), explanation: `Жишээ хариулт: ${t.ja}`,
    });
  });

  // ───────────── mock exam questions ─────────────
  MOCK_EXAM.forEach((q, i) => addQuestion(fromDef(q, `mock-a-${String(i + 1).padStart(2, '0')}`, { category: q.category })));

  // ───────────── daily program (adds generated listening/reading questions) ─────────────
  const plannedDays = planProgram({
    modules: ALL_MODULES,
    lessonIds,
    vocab: vocabRows,
    kanji: kanjiRows,
    grammar: grammarRows,
    kana: kanaRows,
    stories: new Map(STORIES.map((s) => [s.slug, { id: storyIds.get(s.slug)!, title: s.title, titleJa: s.titleJa }])),
    listening: new Map(ALL_LISTENING.map((l) => [l.slug, { id: listeningIds.get(l.slug)!, title: l.title }])),
    speaking: speakingIds,
    readingKeys: (i) => ALL_READINGS[i].questions.map((_, j) => `read-${i}-${j}`),
    readingPassage: (i) => ALL_READINGS[i].passage,
    levelReadings,
    levelDays: new Set(levelBySlug.keys()),
    questions,
    rand,
  });

  // ───────────── persist questions ─────────────
  const data: Prisma.QuestionCreateManyInput[] = questions.map((q) => ({
    key: q.key, type: q.type, category: q.category, section: q.section ?? '', prompt: q.prompt, passage: q.passage ?? null,
    audioText: q.audioText ?? null, options: JSON.stringify(q.options), correctAnswer: q.correctAnswer, explanation: q.explanation,
    difficulty: q.difficulty ?? 1, lessonId: q.lessonId ?? null, grammarId: q.grammarId ?? null,
  }));
  for (let i = 0; i < data.length; i += 500) await prisma.question.createMany({ data: data.slice(i, i + 500) });
  const stored = await prisma.question.findMany({ select: { id: true, key: true, category: true, type: true, lessonId: true } });
  const qid = new Map(stored.map((q) => [q.key, q.id]));
  console.log(`  ${stored.length} questions`);

  // ───────────── quizzes ─────────────
  async function createQuiz(data: Omit<Prisma.QuizUncheckedCreateInput, 'questions'>, keys: string[]) {
    const ids = uniq(keys).map((k) => qid.get(k)).filter((x): x is number => !!x);
    const quiz = await prisma.quiz.create({ data });
    await prisma.quizQuestion.createMany({ data: ids.map((questionId, order) => ({ quizId: quiz.id, questionId, order })) });
    return quiz;
  }
  const keysWhere = (pred: (q: (typeof stored)[number]) => boolean) => stored.filter(pred).map((q) => q.key);
  const inLessons = (ids: number[]) => (q: (typeof stored)[number]) => q.lessonId !== null && ids.includes(q.lessonId) && !q.key.startsWith('mock-') && !q.key.startsWith('tr-');
  const GRAMMAR_CATS = ['grammar', 'particles', 'verbs', 'adjectives', 'numbers'];

  const allLessons = await prisma.lesson.findMany({ include: { module: true }, orderBy: { globalOrder: 'asc' } });
  for (const lesson of allLessons) {
    const own = keysWhere(inLessons([lesson.id]));
    let keys: string[] = [];
    if (lesson.slug === 'review-vocab-kanji') {
      keys = pick(keysWhere((q) => ['vocabulary', 'kanji-reading', 'kanji-meaning'].includes(q.category) && q.type !== 'true_false' && q.type !== 'matching' && (q.key.startsWith('vocab') || q.key.startsWith('kanji'))), 15);
    } else if (lesson.slug === 'review-particles') {
      keys = pick(keysWhere((q) => q.category === 'particles' && q.key.startsWith('gram-')), 15);
    } else if (lesson.slug === 'review-forms') {
      keys = pick(keysWhere((q) => (q.category === 'verbs' || q.category === 'adjectives') && q.key.startsWith('gram-')), 15);
    } else if (lesson.slug === 'mock-exam-prep') {
      keys = [
        ...pick(keysWhere((q) => q.key.startsWith('vocab-mean') || q.key.startsWith('kanji-read')), 4),
        ...pick(keysWhere((q) => q.key.startsWith('gram-')), 4),
        ...pick(keysWhere((q) => q.key.startsWith('read-') || q.key.startsWith('listen-')), 2),
      ];
    } else if (own.some((k) => k.startsWith('kana-'))) {
      const kana = own.filter((k) => k.startsWith('kana-'));
      keys = [
        ...pick(kana.filter((k) => k.includes('-c2s-')), 4),
        ...pick(kana.filter((k) => k.includes('-s2c-')), 3),
        ...pick(kana.filter((k) => k.includes('-type-')), 3),
        ...pick(own.filter((k) => k.startsWith('vocab-mean') || k.startsWith('match-')), 2),
      ];
    } else {
      keys = [
        ...own.filter((k) => k.startsWith('match-')),
        ...pick(own.filter((k) => k.startsWith('vocab-mean')), 3),
        ...pick(own.filter((k) => k.startsWith('vocab-rev') || k.startsWith('vocab-tf')), 1),
        ...pick(own.filter((k) => k.startsWith('vocab-read') || k.startsWith('kanji-')), 3),
        ...pick(own.filter((k) => k.startsWith('gram-')), 4),
        ...pick(own.filter((k) => k.startsWith('sent-')), 1),
        ...pick(own.filter((k) => k.startsWith('read-') || k.startsWith('story-')), 4),
        ...pick(own.filter((k) => k.startsWith('listen-')), 6),
      ].slice(0, 14);
    }
    if (keys.length < 5) keys = uniq([...keys, ...pick(own, 8)]);
    if (keys.length === 0) continue;
    await createQuiz({ slug: `lesson-${lesson.slug}`, title: `${lesson.title} — мини шалгалт`, kind: 'lesson', passingScore: 80, lessonId: lesson.id }, keys);
  }

  // story & listening quizzes
  for (const s of STORIES) {
    await createQuiz({ slug: `story-${s.slug}`, title: `${s.titleJa} — ойлголтын асуулт`, kind: 'story', passingScore: 60, storyId: storyIds.get(s.slug)! }, s.questions.map((_, j) => `story-${s.slug}-${j}`));
  }
  for (const l of LISTENING) {
    await createQuiz({ slug: `listening-${l.slug}`, title: l.title, kind: 'listening', passingScore: 60, listeningId: listeningIds.get(l.slug)! }, l.questions.map((_, j) => `listen-${l.slug}-${j}`));
  }

  // module tests (30 questions: vocabulary 10, grammar 10, kana/kanji 5, reading 5)
  const modules = await prisma.module.findMany({ include: { lessons: { select: { id: true } } }, orderBy: { order: 'asc' } });
  for (const mod of modules) {
    if (mod.order === 13) continue; // the mock exam is the final test
    const scope = mod.order === 12 ? allLessons.filter((l) => l.module.order < 100).map((l) => l.id) : mod.lessons.map((l) => l.id);
    const pool = stored.filter(inLessons(scope));
    const keysOf = (pred: (q: (typeof stored)[number]) => boolean) => pool.filter(pred).map((q) => q.key);
    const vocab = keysOf((q) => q.category === 'vocabulary');
    const grammar = keysOf((q) => GRAMMAR_CATS.includes(q.category));
    const script = keysOf((q) => ['kana', 'kanji-reading', 'kanji-meaning'].includes(q.category) && q.type !== 'typing');
    const reading = keysOf((q) => q.category === 'reading' || q.category === 'listening');
    let keys = uniq([...pick(vocab, 10), ...pick(grammar, 10), ...pick(script, mod.order === 0 ? 15 : 5), ...pick(reading, 5)]);
    if (keys.length < 30) keys = uniq([...keys, ...pick(pool.map((q) => q.key).filter((k) => !keys.includes(k) && !k.includes('-type-')), 30 - keys.length)]);
    if (keys.length < 30) {
      // Small modules (e.g. listening) borrow listening/reading questions from the whole course.
      const extra = stored.filter((q) => (q.category === 'listening' || q.category === 'reading') && !q.key.startsWith('mock-') && !keys.includes(q.key)).map((q) => q.key);
      keys = uniq([...keys, ...pick(extra, 30 - keys.length)]);
    }
    await createQuiz({
      slug: `module-test-${mod.order}`, title: `Модуль ${mod.order}: ${mod.title} — шалгалт`, description: 'Үг 10 · Дүрэм 10 · Кана/Ханз 5 · Уншлага 5. Тэнцэх оноо 80%.',
      kind: 'module_test', passingScore: 80, timeLimitSec: 30 * 60, moduleId: mod.id,
    }, keys.slice(0, 30));
  }

  // JLPT N5 mock exam
  await createQuiz({
    slug: 'jlpt-n5-mock-a', title: 'JLPT N5 загвар шалгалт', kind: 'mock_exam', passingScore: 60, timeLimitSec: 60 * 60,
    description: 'Үг, ханз · Дүрэм · Уншлага · Сонсгол. Дадлагын оноо — албан ёсны JLPT дүн биш.',
  }, MOCK_EXAM.map((_, i) => `mock-a-${String(i + 1).padStart(2, '0')}`));

  const quizCount = await prisma.quiz.count();
  console.log(`  ${quizCount} quizzes`);

  for (const day of plannedDays) {
    const steps = day.steps.map(({ questionKeys, ...step }) => ({
      ...step,
      ...(questionKeys ? { questionIds: uniq(questionKeys).map((k) => qid.get(k)).filter((x): x is number => !!x) } : {}),
    }));
    await prisma.programDay.create({ data: { ...day, outline: JSON.stringify(day.outline), steps: JSON.stringify(steps) } });
  }
  const readyDays = plannedDays.filter((d) => d.ready);
  console.log(`  ${plannedDays.length} program days (${readyDays.length} ready, ${readyDays.reduce((n, d) => n + d.steps.length, 0)} steps)`);

  // ───────────── achievements (upsert keeps users' unlocked badges) ─────────────
  for (const [order, a] of ACHIEVEMENTS.entries()) {
    await prisma.achievement.upsert({ where: { code: a.code }, create: { ...a, order: order + 1 }, update: { ...a, order: order + 1 } });
  }

  // ───────────── learners' progress ─────────────
  const restored = await restoreLearning(prisma, snapshot);
  fs.rmSync(snapshotFile);
  const adopted = await adoptCompletedLessons(prisma);
  console.log(`  restored progress: ${JSON.stringify(restored)}; days adopted from completed lessons: ${adopted}`);

  // ───────────── demo account ─────────────
  const demoEmail = 'demo@hanamaru.app';
  if (!(await prisma.user.findUnique({ where: { email: demoEmail } }))) {
    await prisma.user.create({
      data: { name: 'Demo', email: demoEmail, passwordHash: await bcrypt.hash('demo12345', 12), avatar: '桜', settings: { create: {} } },
    });
    console.log(`  demo user: ${demoEmail} / demo12345`);
  }
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
