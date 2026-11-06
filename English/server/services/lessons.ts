// Lesson engine: builds the step-by-step lesson from content, saves progress and
// handles completion (XP, vocabulary, adaptive difficulty, CEFR evidence).

import type { DB } from '../db';
import { parseJson } from '../db';
import type { GrammarTopic, ListeningMaterial, PhraseEntry, PronunciationTopic, Question, ReadingMaterial, SpeakingTask, WritingTask } from '@shared/contentSchema';
import { CORE_SKILLS, type CoreSkill } from '@shared/cefr';
import { XP } from '@shared/gamification';
import { findWordForm, seededRandom, shuffle, tokenize } from '@shared/text';
import type { Dimension } from '@shared/srs';
import type { DifficultyAction } from '@shared/adaptive';
import { notFound } from '../http';
import { logActivity, type ActivityResult } from './activity';
import { adaptDifficulty, applyEvidence } from './skills';
import { exercisesForWords, introduceWords, rowToItem, wordView, getCard, type ReviewItem, type VocabRow } from './vocab';
import { addFocusExtra } from './focus';
import { nextStep, moduleView, type NextStep } from './course';
import { autoCompleteSessionItems } from './session';

export type QuestionDTO = Question & { id: string; skill: NonNullable<Question['skill']>; level: NonNullable<Question['level']> };

export function questionsFor(db: DB, ownerType: string, ownerId: string): QuestionDTO[] {
  const rows = db
    .prepare('SELECT id, skill, cefr_level, data FROM quiz_questions WHERE owner_type = ? AND owner_id = ? ORDER BY ord')
    .all(ownerType, ownerId) as { id: string; skill: string; cefr_level: string; data: string }[];
  return rows.map((r) => ({ ...(JSON.parse(r.data) as Question), id: r.id, skill: r.skill as QuestionDTO['skill'], level: r.cefr_level as QuestionDTO['level'] }));
}

export function readingMaterial(db: DB, id: string) {
  const r = db.prepare('SELECT id, cefr_level, data FROM reading_materials WHERE id = ?').get(id) as { id: string; cefr_level: string; data: string } | undefined;
  if (!r) return null;
  const data = JSON.parse(r.data) as Omit<ReadingMaterial, 'questions'>;
  return { ...data, id: r.id, level: r.cefr_level, questions: questionsFor(db, 'reading', r.id) };
}

export function listeningMaterial(db: DB, id: string) {
  const r = db.prepare('SELECT id, cefr_level, data FROM listening_materials WHERE id = ?').get(id) as { id: string; cefr_level: string; data: string } | undefined;
  if (!r) return null;
  const data = JSON.parse(r.data) as Omit<ListeningMaterial, 'gist' | 'detail'>;
  return { ...data, id: r.id, level: r.cefr_level, gist: questionsFor(db, 'listening_gist', r.id), detail: questionsFor(db, 'listening_detail', r.id) };
}

export function speakingTask(db: DB, id: string) {
  const r = db.prepare('SELECT id, cefr_level, data FROM speaking_tasks WHERE id = ?').get(id) as { id: string; cefr_level: string; data: string } | undefined;
  return r ? { ...(JSON.parse(r.data) as SpeakingTask), id: r.id, level: r.cefr_level } : null;
}

export function writingTask(db: DB, id: string) {
  const r = db.prepare('SELECT id, cefr_level, data FROM writing_tasks WHERE id = ?').get(id) as { id: string; cefr_level: string; data: string } | undefined;
  return r ? { ...(JSON.parse(r.data) as WritingTask), id: r.id, level: r.cefr_level } : null;
}

export function grammarTopic(db: DB, id: string) {
  const r = db.prepare('SELECT id, data FROM grammar_topics WHERE id = ?').get(id) as { id: string; data: string } | undefined;
  if (!r) return null;
  return {
    topic: JSON.parse(r.data) as Omit<GrammarTopic, 'guided' | 'free'> & { id: string },
    guided: questionsFor(db, 'grammar_guided', r.id),
    free: questionsFor(db, 'grammar_free', r.id),
  };
}

export function pronunciationTopic(db: DB, id: string) {
  const r = db.prepare('SELECT data FROM pronunciation_topics WHERE id = ?').get(id) as { data: string } | undefined;
  return r ? (JSON.parse(r.data) as PronunciationTopic & { id: string }) : null;
}

/** Base speech rate for listening at each level (B1 slow and clear → C1 native speed). */
export const LEVEL_SPEECH_RATE: Record<string, number> = { A2: 0.85, 'A2+': 0.88, B1: 0.9, 'B1+': 0.97, B2: 1.0, 'B2+': 1.05, C1: 1.1, 'C1+': 1.12 };

export function speechRate(level: string, listeningDifficulty: number | null): number {
  const base = LEVEL_SPEECH_RATE[level] ?? 1;
  const adj = listeningDifficulty ? (listeningDifficulty - 4) * 0.02 : 0;
  return Math.round(Math.min(1.25, Math.max(0.8, base + adj)) * 100) / 100;
}

export type Step =
  | { kind: 'warmup'; intro: string; questions: QuestionDTO[] }
  | { kind: 'objectives'; objectives: string[] }
  | { kind: 'vocabulary'; words: ReturnType<typeof wordView>[] }
  | { kind: 'vocab_practice'; match: { word: string; mongolian: string; vocabId: string }[]; items: ReviewItem[] }
  | { kind: 'phrases'; phrases: PhraseEntry[] }
  | { kind: 'grammar'; topic: NonNullable<ReturnType<typeof grammarTopic>>['topic']; guided: QuestionDTO[]; free: QuestionDTO[] }
  | { kind: 'reading'; material: NonNullable<ReturnType<typeof readingMaterial>> }
  | { kind: 'listening'; material: NonNullable<ReturnType<typeof listeningMaterial>>; rate: number }
  | { kind: 'pronunciation'; topic: PronunciationTopic & { id: string } }
  | { kind: 'speaking'; task: NonNullable<ReturnType<typeof speakingTask>> }
  | { kind: 'writing'; task: NonNullable<ReturnType<typeof writingTask>> }
  | { kind: 'quiz'; questions: QuestionDTO[]; vocab: ReviewItem[] }
  | { kind: 'grammar_mix'; questions: QuestionDTO[] }
  | { kind: 'dictation'; sentences: { text: string; voice: 'female' | 'male'; accent: string }[]; rate: number }
  | { kind: 'reading_mix'; question: QuestionDTO; source: string };

export type StepView = Step & { index: number; title: string; skill: string; minutes: number };

const STEP_TITLES: Record<string, string> = {
  warmup: 'Warm-up',
  objectives: 'Your goals',
  vocabulary: 'New words',
  vocab_practice: 'Word practice',
  phrases: 'Real-life English',
  grammar: 'Grammar',
  reading: 'Reading',
  listening: 'Listening',
  pronunciation: 'Pronunciation',
  speaking: 'Speaking',
  writing: 'Writing',
  quiz: 'Lesson quiz',
  grammar_mix: 'Grammar review',
  listening_mix: 'Dictation',
  reading_mix: 'Context challenge',
};

interface LessonRow {
  id: string;
  module_id: string;
  ord: number;
  title: string;
  kind: 'core' | 'review';
  focus: string;
  cefr_level: string;
  difficulty: number;
  minutes: number;
  objectives: string;
  warmup: string | null;
  phrases: string;
  grammar_topic_id: string | null;
  pronunciation_id: string | null;
}

function lessonRow(db: DB, id: string): LessonRow {
  const row = db.prepare(`SELECT l.* FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ? AND l.status = 'published' AND m.status = 'published'`).get(id) as LessonRow | undefined;
  if (!row) throw notFound('Lesson not found');
  return row;
}

function lessonWords(db: DB, lessonId: string): VocabRow[] {
  return db.prepare('SELECT * FROM vocabulary WHERE lesson_id = ? AND owner_user_id IS NULL ORDER BY ord').all(lessonId) as VocabRow[];
}

function skillDifficulty(db: DB, userId: number, skill: string): number | null {
  return (db.prepare('SELECT difficulty FROM skill_profile WHERE user_id = ? AND skill = ?').pluck().get(userId, skill) as number | undefined) ?? null;
}

/** Vocabulary exercise mix follows the learner's vocabulary difficulty: more production as it grows. */
function vocabDims(difficulty: number | null, purpose: 'practice' | 'quiz'): Dimension[] {
  const d = difficulty ?? 4;
  if (purpose === 'practice') return d >= 7 ? ['context', 'recall', 'production'] : d <= 3 ? ['recognition', 'recognition', 'context'] : ['recognition', 'context'];
  return d >= 7 ? ['production', 'context', 'production'] : d <= 3 ? ['context', 'recognition'] : ['context', 'production', 'recall'];
}

function attemptCount(db: DB, userId: number, lessonId: string): number {
  return (db.prepare('SELECT attempts FROM user_progress WHERE user_id = ? AND lesson_id = ?').pluck().get(userId, lessonId) as number | undefined) ?? 0;
}

function buildCoreSteps(db: DB, userId: number, lesson: LessonRow): StepView[] {
  const activities = db.prepare('SELECT ord, type, skill, ref_id, minutes FROM activities WHERE lesson_id = ? ORDER BY ord').all(lesson.id) as {
    ord: number;
    type: string;
    skill: string;
    ref_id: string | null;
    minutes: number;
  }[];
  const words = lessonWords(db, lesson.id);
  const wordIds = words.map((w) => w.id);
  const attempt = attemptCount(db, userId, lesson.id);
  const vocabDifficulty = skillDifficulty(db, userId, 'vocabulary');
  const lessonVocab = words.map((w) => w.word);
  const steps: StepView[] = [];

  for (const a of activities) {
    const base = { index: steps.length, title: STEP_TITLES[a.type] ?? a.type, skill: a.skill, minutes: a.minutes };
    switch (a.type) {
      case 'warmup': {
        const warm = parseJson<{ intro: string }>(lesson.warmup, { intro: '' });
        steps.push({ ...base, kind: 'warmup', intro: warm.intro, questions: questionsFor(db, 'lesson_warmup', lesson.id) });
        break;
      }
      case 'objectives':
        steps.push({ ...base, kind: 'objectives', objectives: parseJson(lesson.objectives, []) });
        break;
      case 'vocabulary':
        steps.push({ ...base, kind: 'vocabulary', words: words.map((w) => wordView(w, getCard(db, userId, w.id))) });
        break;
      case 'vocab_practice': {
        const matchWords = shuffle(words, seededRandom(`${lesson.id}:match:${attempt}`)).slice(0, 6);
        steps.push({
          ...base,
          kind: 'vocab_practice',
          match: matchWords.filter((w) => w.mongolian).map((w) => ({ word: w.word, mongolian: w.mongolian!, vocabId: w.id })),
          items: exercisesForWords(db, userId, wordIds, `${lesson.id}:practice:${attempt}`, vocabDims(vocabDifficulty, 'practice')),
        });
        break;
      }
      case 'phrases':
        steps.push({ ...base, kind: 'phrases', phrases: parseJson(lesson.phrases, []) });
        break;
      case 'grammar': {
        const g = a.ref_id ? grammarTopic(db, a.ref_id) : null;
        if (g) steps.push({ ...base, kind: 'grammar', topic: g.topic, guided: g.guided, free: g.free });
        break;
      }
      case 'reading': {
        const m = a.ref_id ? readingMaterial(db, a.ref_id) : null;
        if (m) steps.push({ ...base, kind: 'reading', material: m });
        break;
      }
      case 'listening': {
        const m = a.ref_id ? listeningMaterial(db, a.ref_id) : null;
        if (m) steps.push({ ...base, kind: 'listening', material: m, rate: speechRate(m.level, skillDifficulty(db, userId, 'listening')) });
        break;
      }
      case 'pronunciation': {
        const t = a.ref_id ? pronunciationTopic(db, a.ref_id) : null;
        if (t) steps.push({ ...base, kind: 'pronunciation', topic: t });
        break;
      }
      case 'speaking': {
        const t = a.ref_id ? speakingTask(db, a.ref_id) : null;
        if (t) steps.push({ ...base, kind: 'speaking', task: { ...t, targetWords: t.targetWords.length ? t.targetWords : lessonVocab.slice(0, 4) } });
        break;
      }
      case 'writing': {
        const t = a.ref_id ? writingTask(db, a.ref_id) : null;
        if (t) steps.push({ ...base, kind: 'writing', task: { ...t, targetWords: t.targetWords.length ? t.targetWords : lessonVocab.slice(0, 4) } });
        break;
      }
      case 'quiz': {
        const quizWords = shuffle(wordIds, seededRandom(`${lesson.id}:quiz:${attempt}`)).slice(0, Math.min(5, wordIds.length));
        steps.push({
          ...base,
          kind: 'quiz',
          questions: questionsFor(db, 'lesson_quiz', lesson.id),
          vocab: exercisesForWords(db, userId, quizWords, `${lesson.id}:quizv:${attempt}`, vocabDims(vocabDifficulty, 'quiz')),
        });
        break;
      }
    }
  }
  return steps;
}

/** The generated module review lesson: mixed, cumulative practice before the module test. */
function buildReviewSteps(db: DB, userId: number, lesson: LessonRow): StepView[] {
  const moduleId = lesson.module_id;
  const attempt = attemptCount(db, userId, lesson.id);
  const random = seededRandom(`${lesson.id}:${attempt}`);
  const steps: StepView[] = [];
  const add = (step: Step, skill: string, minutes: number) => steps.push({ ...step, index: steps.length, title: STEP_TITLES[step.kind === 'dictation' ? 'listening_mix' : step.kind] ?? step.kind, skill, minutes } as StepView);

  // 1. Vocabulary: the module's weakest words first.
  const words = db
    .prepare(
      `SELECT v.id FROM vocabulary v LEFT JOIN user_vocab uv ON uv.vocab_id = v.id AND uv.user_id = ?
       WHERE v.module_id = ? AND v.owner_user_id IS NULL ORDER BY COALESCE(uv.confidence, 0) ASC, uv.lapses DESC`,
    )
    .pluck()
    .all(userId, moduleId) as string[];
  const practiceIds = words.slice(0, 10);
  add({ kind: 'vocab_practice', match: [], items: exercisesForWords(db, userId, practiceIds, `${lesson.id}:v:${attempt}`, ['recognition', 'recall', 'context', 'production']) }, 'vocabulary', 5);

  // 2. Grammar mix from the module's grammar topics and lesson quizzes.
  const grammarPool = (
    db
      .prepare(
        `SELECT id, skill, cefr_level, data FROM quiz_questions WHERE module_id = ? AND skill = 'grammar'
         AND owner_type IN ('grammar_guided', 'grammar_free', 'lesson_quiz')`,
      )
      .all(moduleId) as { id: string; skill: string; cefr_level: string; data: string }[]
  ).map((r) => ({ ...(JSON.parse(r.data) as Question), id: r.id, skill: r.skill as QuestionDTO['skill'], level: r.cefr_level as QuestionDTO['level'] }));
  const grammarPicked = shuffle(grammarPool, random);
  if (grammarPicked.length) add({ kind: 'grammar_mix', questions: grammarPicked.slice(0, 6) }, 'grammar', 4);

  // 3. Dictation from the module's listening scripts.
  const listening = db.prepare(`SELECT data FROM listening_materials WHERE module_id = ? AND context = 'lesson'`).all(moduleId) as { data: string }[];
  const lines: { text: string; voice: 'female' | 'male'; accent: string }[] = [];
  for (const l of listening) {
    const m = JSON.parse(l.data) as ListeningMaterial;
    for (const line of m.lines) {
      const n = tokenize(line.text).length;
      if (n >= 6 && n <= 16) {
        const sp = m.speakers.find((s) => s.name === line.speaker);
        lines.push({ text: line.text, voice: sp?.voice ?? 'female', accent: sp?.accent ?? 'en-GB' });
      }
    }
  }
  if (lines.length) add({ kind: 'dictation', sentences: shuffle(lines, random).slice(0, 3), rate: speechRate(lesson.cefr_level, skillDifficulty(db, userId, 'listening')) }, 'listening', 4);

  // 4. Context challenge: a reading paragraph with module words removed.
  const readingQ = contextChallenge(db, moduleId, random);
  if (readingQ) add({ kind: 'reading_mix', question: readingQ.question, source: readingQ.source }, 'reading', 3);

  // 5. Speaking: retell with the module's words.
  const speak = db.prepare(`SELECT id FROM speaking_tasks WHERE module_id = ? AND context = 'lesson' ORDER BY id`).pluck().all(moduleId) as string[];
  const task = speak.length ? speakingTask(db, speak[Math.floor(random() * speak.length)]) : null;
  if (task) {
    const moduleWords = (db.prepare('SELECT word FROM vocabulary WHERE module_id = ? AND owner_user_id IS NULL').pluck().all(moduleId) as string[]).slice(0, 12);
    add({ kind: 'speaking', task: { ...task, prompt: `${task.prompt} This time, try to use at least three words from this module.`, targetWords: shuffle(moduleWords, random).slice(0, 5) } }, 'speaking', 3);
  }

  // 6. Final mixed quiz.
  const quizVocab = exercisesForWords(db, userId, shuffle(words, random).slice(0, 4), `${lesson.id}:q:${attempt}`, ['production', 'context']);
  add({ kind: 'quiz', questions: grammarPicked.slice(6, 10), vocab: quizVocab }, 'mixed', 3);
  return steps;
}

/** Build a summary-completion question from a module reading paragraph. */
function contextChallenge(db: DB, moduleId: string, random: () => number): { question: QuestionDTO; source: string } | null {
  const readings = db.prepare(`SELECT id, title, data FROM reading_materials WHERE module_id = ? AND context = 'lesson'`).all(moduleId) as { id: string; title: string; data: string }[];
  const words = db.prepare('SELECT word FROM vocabulary WHERE module_id = ? AND owner_user_id IS NULL').pluck().all(moduleId) as string[];
  let best: { paragraph: string; hits: { word: string; form: string }[]; title: string; id: string } | null = null;
  for (const r of readings) {
    const data = JSON.parse(r.data) as ReadingMaterial;
    for (const p of data.text) {
      const hits: { word: string; form: string }[] = [];
      for (const w of words) {
        const form = findWordForm(p, w);
        if (form && !hits.some((h) => h.form.toLowerCase() === form.toLowerCase())) hits.push({ word: w, form });
      }
      if (!best || hits.length > best.hits.length) best = { paragraph: p, hits, title: r.title, id: r.id };
    }
  }
  if (!best || best.hits.length < 2) return null;
  const chosen = best.hits.slice(0, 4);
  let text = best.paragraph;
  chosen.forEach((h, i) => {
    text = text.replace(h.form, `{${i + 1}}`);
  });
  const distractors = shuffle(words.filter((w) => !chosen.some((c) => c.word === w)), random).slice(0, 2);
  return {
    source: best.title,
    question: {
      id: `${best.id}:context-challenge`,
      type: 'summary',
      prompt: 'Complete the paragraph with the right words. (The form may change, e.g. plural or past tense.)',
      text,
      bank: shuffle([...chosen.map((c) => c.form), ...distractors], random),
      answers: chosen.map((c) => c.form),
      skill: 'vocabulary',
      level: 'B1',
      tag: 'vocab_context',
    },
  };
}

export function lessonPayload(db: DB, userId: number, lessonId: string) {
  const lesson = lessonRow(db, lessonId);
  const module = db.prepare('SELECT id, title, level_code FROM modules WHERE id = ?').get(lesson.module_id) as { id: string; title: string; level_code: string };
  const steps = lesson.kind === 'review' ? buildReviewSteps(db, userId, lesson) : buildCoreSteps(db, userId, lesson);
  const progress = db.prepare('SELECT status, current_step, step_data, attempts, best_score FROM user_progress WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId) as
    | { status: string; current_step: number; step_data: string; attempts: number; best_score: number | null }
    | undefined;
  const view = moduleView(db, userId, lesson.module_id);
  const lessonState = view?.lessons.find((l) => l.id === lessonId)?.state ?? 'available';
  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      kind: lesson.kind,
      focus: lesson.focus,
      level: lesson.cefr_level,
      difficulty: lesson.difficulty,
      minutes: lesson.minutes,
      objectives: parseJson<string[]>(lesson.objectives, []),
      state: lessonState,
    },
    module: { id: module.id, title: module.title, level: module.level_code },
    steps,
    progress: progress
      ? { status: progress.status, currentStep: Math.min(progress.current_step, Math.max(0, steps.length - 1)), stepData: parseJson(progress.step_data, {}), attempts: progress.attempts, bestScore: progress.best_score }
      : { status: 'new', currentStep: 0, stepData: {}, attempts: 0, bestScore: null },
  };
}

export function saveLessonStep(db: DB, userId: number, lessonId: string, step: number, stepData: unknown, now: Date): void {
  lessonRow(db, lessonId);
  const data = JSON.stringify(stepData ?? {}).slice(0, 200_000);
  db.prepare(
    `INSERT INTO user_progress (user_id, lesson_id, status, current_step, step_data, started_at, updated_at) VALUES (?, ?, 'in_progress', ?, ?, ?, ?)
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET current_step = excluded.current_step, step_data = excluded.step_data, updated_at = excluded.updated_at,
       status = CASE WHEN user_progress.status = 'completed' THEN 'completed' ELSE 'in_progress' END`,
  ).run(userId, lessonId, step, data, now.toISOString(), now.toISOString());
  // A planned segment finished outside the session (e.g. from the course page) is ticked off too.
  autoCompleteSessionItems(db, userId, 'lesson', (p) => p.lessonId === lessonId && typeof p.toStep === 'number' && step > p.toStep, now);
}

export interface CompletionInput {
  /** Overall quiz score 0–1. */
  score: number;
  /** Per-skill scores from the lesson (e.g. { grammar: 0.8, vocabulary: 0.6 }). */
  skillScores?: Partial<Record<string, number>>;
  minutes?: number;
}

export interface CompletionResult extends ActivityResult {
  firstCompletion: boolean;
  score: number;
  action: DifficultyAction | null;
  message: string;
  wordsAdded: number;
  /** Words taught in this lesson (all now scheduled for review). */
  lessonWords: number;
  next: NextStep;
  moduleProgress: number;
}

const FEEDBACK: Record<DifficultyAction, (skill: string) => string> = {
  increase: () => 'Excellent work! The next activities will be a little more challenging.',
  maintain: () => 'Good work — you are on track. Keep going!',
  extra_practice: (skill) => `You're getting closer. Extra ${skill} practice has been added to your upcoming sessions.`,
  review_prerequisites: (skill) => `Not quite yet — let's review this. Try the lesson practice again, and extra ${skill} review has been added to your next session.`,
};

export function completeLesson(db: DB, userId: number, lessonId: string, input: CompletionInput, now: Date): CompletionResult {
  const lesson = lessonRow(db, lessonId);
  const score = Math.max(0, Math.min(1, input.score));
  const prev = db.prepare('SELECT status FROM user_progress WHERE user_id = ? AND lesson_id = ?').pluck().get(userId, lessonId) as string | undefined;
  const firstCompletion = prev !== 'completed';

  db.prepare(
    `INSERT INTO user_progress (user_id, lesson_id, status, current_step, score, best_score, attempts, started_at, completed_at, updated_at)
     VALUES (@u, @l, 'completed', 0, @s, @s, 1, @now, @now, @now)
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'completed', current_step = 0, step_data = '{}', score = @s,
       best_score = MAX(COALESCE(best_score, 0), @s), attempts = attempts + 1, completed_at = @now, updated_at = @now`,
  ).run({ u: userId, l: lessonId, s: score, now: now.toISOString() });

  const taught = lessonWords(db, lessonId);
  const wordsAdded = introduceWords(db, userId, taught.map((w) => w.id), now);

  // Adaptive difficulty and CEFR evidence per skill practised in the quiz.
  const skillScores = { ...(input.skillScores ?? {}) };
  const focus = (CORE_SKILLS as readonly string[]).includes(lesson.focus) ? lesson.focus : 'vocabulary';
  if (skillScores[focus] === undefined) skillScores[focus] = score;
  let action: DifficultyAction | null = null;
  let weakest: { skill: string; value: number } | null = null;
  for (const [skill, value] of Object.entries(skillScores)) {
    if (value === undefined || !(CORE_SKILLS as readonly string[]).includes(skill)) continue;
    const a = adaptDifficulty(db, userId, skill, value, now);
    if (skill === focus) action = a;
    applyEvidence(db, userId, skill, lesson.cefr_level, value, 'lesson', now);
    if (!weakest || value < weakest.value) weakest = { skill, value };
  }
  if (weakest && weakest.value < 0.7) addFocusExtra(db, userId, weakest.skill as CoreSkill, now);

  const xp = (firstCompletion ? XP.lessonComplete : Math.round(XP.lessonComplete / 2)) + (score >= 0.999 ? XP.lessonPerfectBonus : 0);
  const act = logActivity(db, userId, { type: lesson.kind === 'review' ? 'review_lesson' : 'lesson', ref: lessonId, skill: focus, minutes: input.minutes ?? lesson.minutes, score, xp, xpReason: `Lesson: ${lesson.title}` }, now);
  autoCompleteSessionItems(db, userId, 'lesson', (p) => p.lessonId === lessonId, now);

  const view = moduleView(db, userId, lesson.module_id);
  const messageSkill = weakest && weakest.value < 0.7 ? weakest.skill : focus;
  return {
    ...act,
    firstCompletion,
    score,
    action,
    message: FEEDBACK[action ?? 'maintain'](messageSkill),
    wordsAdded,
    lessonWords: taught.length,
    next: nextStep(db, userId),
    moduleProgress: view?.progress ?? 0,
  };
}

export { rowToItem };
