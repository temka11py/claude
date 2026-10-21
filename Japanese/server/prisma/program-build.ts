// Builds the day-by-day program (N5 → N2) from the seeded content. Each day
// keeps one topic and is split into short steps of 2–5 minutes so that a
// learner always sees a small, finishable next task.
import type { ModuleDef, LessonDef } from './content/types.js';
import { N5_PROGRAM, type ProgramDayDef } from './content/program-n5.js';
import { OUTLINE, type Level } from './content/program-outline.js';

export interface PlanQuestion {
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

export type StepKind = 'review' | 'kana' | 'words' | 'kanji' | 'grammar' | 'dialogue' | 'reading' | 'listening' | 'speaking' | 'game' | 'quiz';

export interface Sentence {
  ja: string;
  mn: string;
  speaker?: string;
}

export interface PlannedStep {
  key: string;
  kind: StepKind;
  title: string;
  minutes: number;
  optional?: boolean;
  kanaIds?: number[];
  vocabIds?: number[];
  kanjiIds?: number[];
  grammarIds?: number[];
  storyId?: number;
  passages?: string[];
  sentences?: Sentence[];
  listeningIds?: number[];
  speakingId?: number;
  questionKeys?: string[];
  game?: 'sudoku' | 'match';
  sudoku?: { size: 4 | 6; symbols: string[]; hints: string[] };
}

export interface PlannedDay {
  number: number;
  slug: string;
  level: Level;
  unit: number;
  unitTitle: string;
  unitTitleJa: string;
  title: string;
  titleJa: string;
  goal: string;
  kind: string;
  ready: boolean;
  outline: string[];
  lessonId: number | null;
  steps: PlannedStep[];
}

interface VocabRow { id: number; word: string; kana: string; meaning: string; example: string; exampleMn: string; lessonId: number }
interface KanjiRow { id: number; char: string; lessonId: number }
interface GrammarRow { id: number; slug: string; title: string; lessonId: number; examples: [string, string][] }
interface KanaRow { id: number; char: string; romaji: string; group: string; lessonId: number | null }

export interface PlanInput {
  modules: ModuleDef[];
  lessonIds: Map<string, number>;
  vocab: VocabRow[];
  kanji: KanjiRow[];
  grammar: GrammarRow[];
  kana: KanaRow[];
  stories: Map<string, { id: number; title: string; titleJa: string }>;
  listening: Map<string, { id: number; title: string }>;
  speaking: Map<string, number>;
  readingKeys: (index: number) => string[];
  readingPassage: (index: number) => string;
  /** Reading indexes written for each N4+ day. */
  levelReadings: Map<string, number[]>;
  levelDays: Set<string>;
  questions: PlanQuestion[];
  rand: () => number;
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
const KANJI_NUMBERS = ['一', '二', '三', '四', '五', '六'];
const KANJI_NUMBER_READINGS = ['いち', 'に', 'さん', 'よん', 'ご', 'ろく'];

/** Split into the fewest chunks of at most `max`, keeping chunk sizes even. */
function chunk<T>(items: T[], max: number): T[][] {
  if (items.length === 0) return [];
  const n = Math.ceil(items.length / max);
  const size = Math.ceil(items.length / n);
  return Array.from({ length: n }, (_, i) => items.slice(i * size, (i + 1) * size)).filter((c) => c.length);
}

const isSentence = (ja: string) => ja.length >= 5 && /[。？！?]$/.test(ja) && !ja.includes('→');

export function planProgram(input: PlanInput): PlannedDay[] {
  const { rand, questions } = input;
  const shuffle = <T,>(items: T[]) => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = <T,>(items: T[], n: number) => shuffle(items).slice(0, n);

  const lessonDefs = new Map<string, LessonDef>();
  for (const m of input.modules) for (const l of m.lessons) lessonDefs.set(l.key, l);
  const lessonId = (key: string) => {
    const id = input.lessonIds.get(key);
    if (!id) throw new Error(`program: unknown lesson ${key}`);
    return id;
  };
  const keysByPrefix = (prefix: string) => questions.filter((q) => q.key.startsWith(prefix)).map((q) => q.key);
  const hasKey = new Set(questions.map((q) => q.key));
  const mnPool = [...new Set(input.vocab.map((v) => v.exampleMn).filter(Boolean))];

  // ───────── kanji without a day of their own (N5 kanji lessons) are spread over the lesson days ─────────
  const dayLessonKeys = new Set(N5_PROGRAM.flatMap((u) => u.days.filter((d) => d.kind !== 'review' && d.kind !== 'exam' && d.lesson).map((d) => d.lesson!)));
  const dayLessonIds = new Set([...dayLessonKeys].map(lessonId));
  const orphanKanji = input.kanji.filter((k) => !dayLessonIds.has(k.lessonId) && !input.levelDays.has(lessonKeyOf(k.lessonId)));
  const orphanVocab = input.vocab.filter((v) => !dayLessonIds.has(v.lessonId) && !input.levelDays.has(lessonKeyOf(v.lessonId)));
  function lessonKeyOf(id: number) {
    for (const [key, value] of input.lessonIds) if (value === id) return key;
    return '';
  }
  const kanjiLessonDays = N5_PROGRAM.flatMap((u) => u.days).filter((d) => (d.kind ?? 'lesson') === 'lesson');
  const assignedKanji = new Map<string, KanjiRow[]>();
  const assignedVocab = new Map<string, VocabRow[]>();
  {
    const pool = [...orphanKanji];
    const vocabPool = [...orphanVocab];
    kanjiLessonDays.forEach((day, i) => {
      const words = input.vocab.filter((v) => v.lessonId === lessonId(day.lesson!)).map((v) => v.word).join('');
      const target = Math.ceil(pool.length / (kanjiLessonDays.length - i));
      const chosen = pool.filter((k) => words.includes(k.char)).slice(0, target);
      for (const k of pool) if (chosen.length < target && !chosen.includes(k)) chosen.push(k);
      for (const k of chosen) pool.splice(pool.indexOf(k), 1);
      assignedKanji.set(day.slug, chosen);
      const extra = vocabPool.filter((v) => chosen.some((k) => v.word.includes(k.char)));
      for (const v of extra) vocabPool.splice(vocabPool.indexOf(v), 1);
      assignedVocab.set(day.slug, extra);
    });
  }

  // ───────── content helpers ─────────
  const vocabOf = (key: string) => input.vocab.filter((v) => v.lessonId === lessonId(key));
  const kanjiOf = (key: string) => input.kanji.filter((k) => k.lessonId === lessonId(key));
  const grammarOf = (key: string) => input.grammar.filter((g) => g.lessonId === lessonId(key));
  const kanaOf = (key: string) => input.kana.filter((k) => k.lessonId === lessonId(key));

  function sentencesOf(keys: string[]) {
    const dialogue: Sentence[] = [];
    const examples: Sentence[] = [];
    for (const key of keys) {
      const l = lessonDefs.get(key);
      if (!l) continue;
      for (const d of l.dialogue ?? []) dialogue.push({ ja: d.ja, mn: d.mn, speaker: d.speaker });
      for (const e of l.examples ?? []) if (isSentence(e.ja)) examples.push({ ja: e.ja, mn: e.mn });
      for (const g of grammarOf(key)) for (const [ja, mn] of g.examples) if (isSentence(ja)) examples.push({ ja, mn });
    }
    return { dialogue, examples };
  }

  function generatedListening(slug: string, words: VocabRow[], lid: number | null): PlannedStep | null {
    const picks = pick(words.filter((v) => isSentence(v.example) && v.exampleMn), 3);
    if (picks.length < 2) return null;
    const keys = picks.map((v, i) => {
      const key = `day-${slug}-listen-${i}`;
      const distract = pick(mnPool.filter((m) => m !== v.exampleMn), 3);
      questions.push({
        key, type: 'listening', category: 'listening', prompt: 'Сонссон өгүүлбэрийн утгыг сонгоно уу.', audioText: v.example,
        options: shuffle([v.exampleMn, ...distract]), correctAnswer: v.exampleMn, explanation: `${v.example} — ${v.exampleMn}`, lessonId: lid,
      });
      return key;
    });
    return { key: 'listening', kind: 'listening', title: 'Сонсгол: өгүүлбэр таних', minutes: 2, questionKeys: keys };
  }

  function generatedReadingQuestions(slug: string, sentences: Sentence[], lid: number | null) {
    return pick(sentences.filter((s) => isSentence(s.ja)), 2).map((s, i) => {
      const key = `day-${slug}-read-${i}`;
      questions.push({
        key, type: 'ja_to_mn', category: 'reading', prompt: `「${s.ja}」 — өгүүлбэрийн утгыг сонгоно уу.`,
        options: shuffle([s.mn, ...pick(mnPool.filter((m) => m !== s.mn), 3)]), correctAnswer: s.mn, explanation: `${s.ja} = ${s.mn}`, lessonId: lid,
      });
      return key;
    });
  }

  function speakingStep(sentences: Sentence[], promptSlug?: string): PlannedStep | null {
    const shortFirst = [...sentences].sort((a, b) => a.ja.length - b.ja.length).filter((s) => s.ja.length <= 28);
    const chosen = pick(shortFirst.slice(0, 8), 3);
    const speakingId = promptSlug ? input.speaking.get(promptSlug) : undefined;
    if (chosen.length < 2 && !speakingId) return null;
    return { key: 'speaking', kind: 'speaking', title: speakingId ? 'Ярих: давтах ба өөрөө хэлэх' : 'Ярих: давтан хэлэх', minutes: speakingId ? 5 : 3, sentences: chosen, speakingId };
  }

  function gameStep(kind: 'sudoku' | 'match', opts: { vocab?: VocabRow[]; kana?: KanaRow[]; big?: boolean }): PlannedStep {
    if (kind === 'match') {
      if (opts.kana?.length) {
        const basic = opts.kana.filter((k) => !k.romaji.startsWith('('));
        return { key: 'game', kind: 'game', game: 'match', title: 'Тоглоом: хос олох', minutes: 2, optional: true, kanaIds: pick(basic, 6).map((k) => k.id) };
      }
      if ((opts.vocab?.length ?? 0) >= 4) {
        return { key: 'game', kind: 'game', game: 'match', title: 'Тоглоом: үг холбох', minutes: 2, optional: true, vocabIds: pick(opts.vocab!, 6).map((v) => v.id) };
      }
    }
    const kanaSymbols = opts.kana?.filter((k) => k.group === 'basic' && !k.romaji.startsWith('('));
    if (kanaSymbols && kanaSymbols.length >= 4) {
      const chosen = kanaSymbols.slice(0, 4);
      return { key: 'game', kind: 'game', game: 'sudoku', title: 'Тоглоом: кана судоку', minutes: 3, optional: true, sudoku: { size: 4, symbols: chosen.map((k) => k.char), hints: chosen.map((k) => k.romaji.split('|')[0]) } };
    }
    const size = opts.big ? 6 : 4;
    return {
      key: 'game', kind: 'game', game: 'sudoku', title: `Тоглоом: ханзан тооны судоку ${size}×${size}`, minutes: size === 6 ? 5 : 3, optional: true,
      sudoku: { size, symbols: KANJI_NUMBERS.slice(0, size), hints: KANJI_NUMBER_READINGS.slice(0, size) },
    };
  }

  const reviewStep = (optional = true): PlannedStep => ({ key: 'review', kind: 'review', title: 'Давталт (флэш карт)', minutes: 3, optional });

  function wordsSteps(words: VocabRow[], label = 'Шинэ үг'): PlannedStep[] {
    const groups = chunk(words, 8);
    return groups.map((g, i) => ({
      key: `words-${i + 1}`, kind: 'words', title: groups.length > 1 ? `${label} ${CIRCLED[i]}` : label, minutes: Math.max(2, Math.round(1 + g.length * 0.4)), vocabIds: g.map((v) => v.id),
    }));
  }

  function kanjiSteps(kanji: KanjiRow[]): PlannedStep[] {
    const groups = chunk(kanji, 3);
    return groups.map((g, i) => ({
      key: `kanji-${i + 1}`, kind: 'kanji', title: groups.length > 1 ? `Ханз ${CIRCLED[i]}` : 'Ханз', minutes: 1 + g.length, kanjiIds: g.map((k) => k.id),
      questionKeys: g.map((k) => `kanji-mean-${k.id}`).filter((k) => hasKey.has(k)),
    }));
  }

  function grammarSteps(grammar: GrammarRow[]): PlannedStep[] {
    return grammar.map((g, i) => ({
      key: `grammar-${i + 1}`, kind: 'grammar', title: `Дүрэм: ${g.title}`, minutes: 4, grammarIds: [g.id], questionKeys: keysByPrefix(`gram-${g.slug}-`).slice(0, 3),
    }));
  }

  function quizStep(key: string, title: string, keys: string[], n = 8): PlannedStep | null {
    const chosen = [...new Set(keys)].filter((k) => hasKey.has(k));
    if (chosen.length < 3) return null;
    const picked = pick(chosen, n);
    return { key, kind: 'quiz', title, minutes: Math.max(2, Math.round(picked.length * 0.4)), questionKeys: picked };
  }

  // ───────── day builders ─────────
  function kanaDay(def: ProgramDayDef): PlannedStep[] {
    const lid = lessonId(def.lesson!);
    const kana = kanaOf(def.lesson!);
    const steps: PlannedStep[] = [reviewStep()];
    chunk(kana, 10).forEach((g, i, all) => steps.push({ key: `kana-${i + 1}`, kind: 'kana', title: all.length > 1 ? `Үсэг ${CIRCLED[i]}` : 'Үсэг', minutes: Math.max(2, Math.round(g.length * 0.35)), kanaIds: g.map((k) => k.id) }));
    const words = vocabOf(def.lesson!);
    steps.push(...wordsSteps(words, 'Шинэ үг'));
    if (words.length >= 4) {
      const listening = generatedListening(def.slug, words, lid);
      if (listening) steps.push(listening);
    }
    steps.push(gameStep(def.game ?? 'match', { kana, vocab: words }));
    const own = questions.filter((q) => q.lessonId === lid && q.key.startsWith('kana-')).map((q) => q.key);
    const quiz = quizStep('quiz', 'Өдрийн шалгалт', [
      ...pick(own.filter((k) => k.includes('-c2s-')), 4), ...pick(own.filter((k) => k.includes('-s2c-')), 3), ...pick(own.filter((k) => k.includes('-type-')), 2),
    ], 9);
    if (quiz) steps.push(quiz);
    return steps;
  }

  function lessonDay(def: ProgramDayDef, big: boolean): PlannedStep[] {
    const key = def.lesson!;
    const lid = lessonId(key);
    const words = [...vocabOf(key), ...(assignedVocab.get(def.slug) ?? [])];
    const kanji = [...kanjiOf(key), ...(assignedKanji.get(def.slug) ?? [])];
    const grammar = grammarOf(key);
    const { dialogue, examples } = sentencesOf([key]);
    const steps: PlannedStep[] = [reviewStep(), ...wordsSteps(words), ...kanjiSteps(kanji), ...grammarSteps(grammar)];

    if (dialogue.length >= 2) steps.push({ key: 'dialogue', kind: 'dialogue', title: 'Харилцан яриа', minutes: 3, sentences: dialogue });
    if (def.story && input.stories.has(def.story)) {
      const s = input.stories.get(def.story)!;
      steps.push({ key: 'reading', kind: 'reading', title: `Өгүүллэг: ${s.titleJa}`, minutes: 5, storyId: s.id, questionKeys: keysByPrefix(`story-${def.story}-`) });
    } else if (def.readings?.length) {
      def.readings.forEach((idx, i, all) =>
        steps.push({ key: `reading-${i + 1}`, kind: 'reading', title: all.length > 1 ? `Уншлага ${CIRCLED[i]}` : 'Уншлага', minutes: 4, passages: [input.readingPassage(idx)], questionKeys: input.readingKeys(idx) }),
      );
    } else if (dialogue.length < 2) {
      const sentences = examples.length >= 3 ? examples.slice(0, 6) : [...examples, ...words.filter((v) => isSentence(v.example)).map((v) => ({ ja: v.example, mn: v.exampleMn }))].slice(0, 5);
      if (sentences.length >= 3) {
        const sent = grammar.flatMap((g) => keysByPrefix(`sent-${g.slug}-`)).slice(0, 2);
        steps.push({ key: 'reading', kind: 'reading', title: 'Өгүүлбэр унших', minutes: 3, sentences, questionKeys: sent.length ? sent : generatedReadingQuestions(def.slug, sentences, lid) });
      }
    }

    if (def.listening?.length) {
      def.listening.forEach((slug, i, all) => {
        const l = input.listening.get(slug);
        if (l) steps.push({ key: all.length > 1 ? `listening-${i + 1}` : 'listening', kind: 'listening', title: `Сонсгол: ${l.title}`, minutes: 3, listeningIds: [l.id], questionKeys: keysByPrefix(`listen-${slug}-`) });
      });
    } else {
      const listening = generatedListening(def.slug, words, lid);
      if (listening) steps.push(listening);
    }

    const speaking = speakingStep([...dialogue, ...examples, ...words.filter((v) => isSentence(v.example)).map((v) => ({ ja: v.example, mn: v.exampleMn }))], def.speaking);
    if (speaking) steps.push(speaking);
    steps.push(gameStep(def.game ?? 'match', { vocab: words, big }));

    const quiz = quizStep('quiz', 'Өдрийн шалгалт', [
      ...pick(words.map((v) => `vocab-mean-${v.id}`), 3),
      ...pick(words.map((v) => `vocab-read-${v.id}`).filter((k) => hasKey.has(k)), 1),
      ...pick(words.map((v) => `vocab-rev-${v.id}`), 1),
      ...pick(kanji.map((k) => `kanji-read-${k.id}`).filter((k) => hasKey.has(k)), 1),
      ...pick(grammar.flatMap((g) => keysByPrefix(`gram-${g.slug}-`).slice(3)), 2),
      ...(hasKey.has(`match-lesson-${lid}`) ? [`match-lesson-${lid}`] : []),
    ]);
    if (quiz) steps.push(quiz);
    return steps;
  }

  function reviewDay(def: ProgramDayDef, unitDays: ProgramDayDef[]): PlannedStep[] {
    const keys = def.reviewOf ?? unitDays.filter((d) => d.lesson).map((d) => d.lesson!);
    const words = [...keys.flatMap((k) => (input.lessonIds.has(k) ? vocabOf(k) : [])), ...unitDays.flatMap((d) => assignedVocab.get(d.slug) ?? [])];
    const kanji = [...keys.flatMap((k) => (input.lessonIds.has(k) ? kanjiOf(k) : [])), ...unitDays.flatMap((d) => assignedKanji.get(d.slug) ?? [])];
    const grammar = keys.flatMap((k) => (input.lessonIds.has(k) ? grammarOf(k) : []));
    const { dialogue, examples } = sentencesOf(keys);
    const lid = def.lesson ? lessonId(def.lesson) : null;
    const steps: PlannedStep[] = [reviewStep(false), ...wordsSteps(pick(words, 8), 'Үгээ сэргээх')];
    const vq = quizStep('quiz-words', 'Шалгалт: үг ба ханз', [
      ...words.map((v) => `vocab-mean-${v.id}`), ...words.map((v) => `vocab-read-${v.id}`), ...kanji.map((k) => `kanji-mean-${k.id}`), ...kanji.map((k) => `kanji-read-${k.id}`),
    ], 8);
    if (vq) steps.push(vq);
    const gq = quizStep('quiz-grammar', 'Шалгалт: дүрэм', grammar.flatMap((g) => keysByPrefix(`gram-${g.slug}-`)), 8);
    if (gq) steps.push(gq);
    if (def.listening?.length) {
      for (const slug of def.listening) {
        const l = input.listening.get(slug);
        if (l) steps.push({ key: 'listening', kind: 'listening', title: `Сонсгол: ${l.title}`, minutes: 3, listeningIds: [l.id], questionKeys: keysByPrefix(`listen-${slug}-`) });
      }
    } else {
      const listening = generatedListening(def.slug, words, lid);
      if (listening) steps.push(listening);
    }
    const speaking = speakingStep([...dialogue, ...examples]);
    if (speaking) steps.push(speaking);
    steps.push(gameStep('sudoku', { big: true }));
    return steps;
  }

  function examDay(def: ProgramDayDef): PlannedStep[] {
    const steps: PlannedStep[] = [];
    for (const slug of def.listening ?? []) {
      const l = input.listening.get(slug);
      if (l) steps.push({ key: 'listening', kind: 'listening', title: `Бэлтгэл: ${l.title}`, minutes: 2, listeningIds: [l.id], questionKeys: keysByPrefix(`listen-${slug}-`) });
    }
    const sections: [string, string][] = [['vocabulary', 'үг ба ханз'], ['grammar', 'дүрэм'], ['reading', 'уншлага'], ['listening', 'сонсгол']];
    sections.forEach(([section, label], s) => {
      const keys = questions.filter((q) => q.key.startsWith('mock-a-') && q.section === section).map((q) => q.key);
      // Keep every part short: at most 9 questions per step.
      chunk(keys, 9).forEach((part, i, all) =>
        steps.push({ key: `mock-${section}-${i + 1}`, kind: 'quiz', title: `Шалгалт ${CIRCLED[s]}: ${label}${all.length > 1 ? ` (${i + 1}/${all.length})` : ''}`, minutes: Math.max(2, Math.round(part.length * 0.7)), questionKeys: part }),
      );
    });
    return steps;
  }

  // ───────── assemble ─────────
  const days: PlannedDay[] = [];
  let unitNo = 0;
  N5_PROGRAM.forEach((unit) => {
    unitNo++;
    for (const def of unit.days) {
      const kind = def.kind ?? 'lesson';
      const lesson = def.lesson ? lessonDefs.get(def.lesson) : undefined;
      const steps =
        kind === 'kana' ? kanaDay(def) : kind === 'review' ? reviewDay(def, unit.days.filter((d) => d !== def)) : kind === 'exam' ? examDay(def) : lessonDay(def, unitNo >= 6);
      days.push({
        number: days.length + 1, slug: def.slug, level: 'N5', unit: unitNo, unitTitle: unit.title, unitTitleJa: unit.titleJa,
        title: def.title ?? lesson?.title ?? def.slug, titleJa: def.titleJa ?? lesson?.titleJa ?? '', goal: def.goal, kind, ready: true, outline: [],
        lessonId: def.lesson ? lessonId(def.lesson) : null, steps,
      });
    }
  });

  for (const unit of OUTLINE) {
    unitNo++;
    const readyDefs: ProgramDayDef[] = [];
    for (const d of unit.days) {
      const base = { number: 0, slug: d.slug, level: unit.level, unit: unitNo, unitTitle: unit.title, unitTitleJa: unit.titleJa, title: d.title, titleJa: d.titleJa, outline: d.points };
      if (input.levelDays.has(d.slug)) {
        const def: ProgramDayDef = { slug: d.slug, lesson: d.slug, goal: lessonDefs.get(d.slug)?.summary ?? d.points.join(' · '), readings: input.levelReadings.get(d.slug), listening: [`${d.slug}-listening`], speaking: `${d.slug}-speaking`, game: 'match' };
        readyDefs.push(def);
        days.push({ ...base, number: days.length + 1, goal: def.goal, kind: 'lesson', ready: true, lessonId: lessonId(d.slug), steps: lessonDay(def, true) });
      } else {
        days.push({ ...base, number: days.length + 1, goal: d.points.join(' · '), kind: 'lesson', ready: false, lessonId: null, steps: [] });
      }
    }
    const reviewSlug = `${unit.days[0].slug}-review`;
    const review: ProgramDayDef = { slug: reviewSlug, kind: 'review', goal: 'Нэгжийн үг, ханз, дүрмээ бататгана.', reviewOf: readyDefs.map((d) => d.lesson!), game: 'sudoku' };
    const ready = readyDefs.length === unit.days.length;
    days.push({
      number: days.length + 1, slug: reviewSlug, level: unit.level, unit: unitNo, unitTitle: unit.title, unitTitleJa: unit.titleJa,
      title: `Давталт: ${unit.title}`, titleJa: 'ふくしゅう', goal: review.goal, kind: 'review', ready, outline: ['Нэгжийн үг, ханз, дүрмийн давталт', 'Сонсгол, ярих, тоглоом'],
      lessonId: null, steps: ready ? reviewDay(review, readyDefs) : [],
    });
  }
  return days;
}
