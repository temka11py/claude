// Module tests, level exams and the placement test.
// Papers are generated on the server; answers never reach the browser before
// submission. Grading, feedback and unlocking also happen here.

import type { DB } from '../db';
import { parseJson } from '../db';
import type { ListeningMaterial, PlacementDoc, Question, ReadingMaterial } from '@shared/contentSchema';
import { checkAnswer, expectedAnswer, stripAnswer, weightedPercent, type AnswerValue } from '@shared/scoring';
import { seededRandom, shuffle } from '@shared/text';
import { exerciseFor, type VocabExercise } from '@shared/vocabExercises';
import { COURSE_LEVELS, labelFor, levelValue, type CourseLevel, type CoreSkill } from '@shared/cefr';
import { estimateFromItems, estimateWritingLevel, summarizePlacement, type PlacementItemResult } from '@shared/placement';
import { analyzeWriting } from '@shared/writingChecker';
import { XP } from '@shared/gamification';
import { badRequest, conflict, notFound } from '../http';
import type { AIProvider } from '../ai/provider';
import { speakingFeedback, writingFeedback, type SpeakingFeedback, type WritingFeedback } from '../ai/feedback';
import { logActivity, type ActivityResult } from './activity';
import { adaptDifficulty, applyEvidence, recordResponses, setSkillScore, snapshot, type ResponseInput } from './skills';
import { distractorPool, gradeWord, rowToItem, type VocabRow } from './vocab';
import { listeningMaterial, readingMaterial, speakingTask, writingTask, questionsFor, type QuestionDTO } from './lessons';
import { completeLevel, LEVEL_PASS, LEVEL_SKILL_FLOOR, MODULE_PASS, moduleView, nextStep, placeAtLevel, roadmap } from './course';
import { addFocusExtra } from './focus';
import { effectiveExplanationLanguage, getSettings } from './users';
import { autoCompleteSessionItems } from './session';

type SectionSkill = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'writing' | 'speaking';

interface PaperQuestion {
  id: string;
  skill: string;
  level: string;
  question: Question;
  vocabId?: string;
}

interface PaperSection {
  skill: SectionSkill;
  title: string;
  weight: number;
  instructions: string;
  questions: PaperQuestion[];
  /** Reading texts or listening scripts (without questions). */
  materials?: (Omit<ReadingMaterial, 'questions'> | (Omit<ListeningMaterial, 'gist' | 'detail'> & { rate: number }))[];
  task?: Record<string, unknown>;
}

export interface Paper {
  kind: 'module_test' | 'level_exam' | 'placement';
  refId: string;
  title: string;
  level: string;
  minutes: number;
  sections: PaperSection[];
}

const SECTION_TITLES: Record<SectionSkill, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
};

/** Convert a generated vocabulary exercise into a gradable question. */
function vocabQuestion(ex: VocabExercise): Question | null {
  if (ex.kind === 'choice') {
    const prompt = ex.sentence ? `${ex.sentence.replace(/_{3,}/g, '___')}\n${ex.prompt}` : ex.prompt;
    return { type: 'mcq', prompt, options: ex.options, answer: ex.answerIndex, skill: 'vocabulary', explanation: `${ex.reveal.word}: ${ex.reveal.definition}` };
  }
  if (ex.kind === 'typed' && ex.sentence) {
    return { type: 'gap', prompt: `${ex.sentence.replace(/_{3,}/g, '___')}`, answers: ex.answers, skill: 'vocabulary', explanation: `${ex.reveal.word}: ${ex.reveal.definition}` };
  }
  return null;
}

function vocabQuestions(db: DB, userId: number, rows: VocabRow[], count: number, seed: string): PaperQuestion[] {
  const random = seededRandom(seed);
  const pool = distractorPool(db, userId);
  const dims = ['recognition', 'context', 'context', 'production'] as const;
  const out: PaperQuestion[] = [];
  for (const row of shuffle(rows, random)) {
    if (out.length >= count) break;
    const q = vocabQuestion(exerciseFor(rowToItem(row), dims[out.length % dims.length], pool, random, ['flashcard', 'builder', 'spelling']));
    if (q) out.push({ id: `v:${row.id}:${out.length}`, skill: 'vocabulary', level: row.cefr_level, question: q, vocabId: row.id });
  }
  return out;
}

/** Up to `fromPrimary` random items from the primary set, the rest from the pool (topped up from either). */
function mixQuestions(primary: PaperQuestion[], pool: PaperQuestion[], total: number, fromPrimary: number, random: () => number): PaperQuestion[] {
  const p = shuffle(primary, random);
  const picked = p.slice(0, fromPrimary);
  const rest = shuffle([...pool, ...p.slice(fromPrimary)], random);
  for (const q of rest) {
    if (picked.length >= total) break;
    if (!picked.some((x) => x.id === q.id)) picked.push(q);
  }
  return picked;
}

function toPaperQuestions(qs: QuestionDTO[]): PaperQuestion[] {
  return qs.map((q) => ({ id: q.id, skill: q.skill, level: q.level, question: q }));
}

function materialSection(db: DB, skill: 'reading' | 'listening', ids: string[], weight: number, listeningRate: number): PaperSection {
  const materials: PaperSection['materials'] = [];
  const questions: PaperQuestion[] = [];
  for (const id of ids) {
    if (skill === 'reading') {
      const m = readingMaterial(db, id);
      if (!m) continue;
      const { questions: qs, ...rest } = m;
      materials.push(rest);
      questions.push(...toPaperQuestions(qs));
    } else {
      const m = listeningMaterial(db, id);
      if (!m) continue;
      const { gist, detail, ...rest } = m;
      materials.push({ ...rest, rate: listeningRate });
      questions.push(...toPaperQuestions([...gist, ...detail]));
    }
  }
  return {
    skill,
    title: SECTION_TITLES[skill],
    weight,
    instructions: skill === 'reading' ? 'Read the text and answer the questions.' : 'Listen (you can replay up to two times) and answer the questions. The transcript is hidden in tests.',
    questions,
    materials,
  };
}

function createAttempt(db: DB, userId: number, paper: Paper, now: Date): number {
  const info = db
    .prepare(`INSERT INTO quiz_attempts (user_id, context_type, context_id, status, paper, started_at) VALUES (?, ?, ?, 'in_progress', ?, ?)`)
    .run(userId, paper.kind, paper.refId, JSON.stringify(paper), now.toISOString());
  return Number(info.lastInsertRowid);
}

/** Paper as sent to the browser: no answers, no explanations. */
export function publicPaper(paper: Paper, attemptId: number) {
  return {
    attemptId,
    kind: paper.kind,
    refId: paper.refId,
    title: paper.title,
    level: paper.level,
    minutes: paper.minutes,
    sections: paper.sections.map((s) => ({
      skill: s.skill,
      title: s.title,
      weight: s.weight,
      instructions: s.instructions,
      materials: s.materials,
      task: s.task,
      questions: s.questions.map((q) => ({ ...stripAnswer({ ...q.question, id: q.id }), id: q.id })),
    })),
  };
}

function existingAttempt(db: DB, userId: number, kind: string, refId: string): { id: number; paper: Paper } | null {
  const row = db
    .prepare(`SELECT id, paper FROM quiz_attempts WHERE user_id = ? AND context_type = ? AND context_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1`)
    .get(userId, kind, refId) as { id: number; paper: string } | undefined;
  return row ? { id: row.id, paper: JSON.parse(row.paper) as Paper } : null;
}

// ---------------------------------------------------------------------------
// Module test
// ---------------------------------------------------------------------------

export function startModuleTest(db: DB, userId: number, moduleId: string, now: Date, opts: { fresh?: boolean } = {}) {
  const view = moduleView(db, userId, moduleId);
  if (!view || view.state === 'planned') throw notFound('Module not found');
  if (view.state === 'locked') throw badRequest(view.lockedReason ?? 'This module is locked.');
  if (!view.hasTest) throw badRequest('This module has no test yet.');
  if (!opts.fresh) {
    const existing = existingAttempt(db, userId, 'module_test', moduleId);
    if (existing) return publicPaper(existing.paper, existing.id);
  }
  const attemptNo = db.prepare(`SELECT COUNT(*) FROM quiz_attempts WHERE user_id = ? AND context_type = 'module_test' AND context_id = ?`).pluck().get(userId, moduleId) as number;
  const random = seededRandom(`${userId}:${moduleId}:${attemptNo}:${now.getTime()}`);
  const testQs = questionsFor(db, 'module_test', moduleId);
  const grammarPool = (db
    .prepare(`SELECT id, skill, cefr_level, data FROM quiz_questions WHERE module_id = ? AND skill = 'grammar' AND owner_type IN ('grammar_guided', 'grammar_free', 'lesson_quiz')`)
    .all(moduleId) as { id: string; skill: string; cefr_level: string; data: string }[]).map((r) => ({ id: r.id, skill: r.skill, level: r.cefr_level, question: JSON.parse(r.data) as Question }));

  // Each attempt draws a different mix: some unseen test items plus items from the module's pools.
  const grammar = mixQuestions(toPaperQuestions(testQs.filter((q) => q.skill === 'grammar')), grammarPool, 8, 5, random);
  const vocabTest = shuffle(toPaperQuestions(testQs.filter((q) => q.skill === 'vocabulary')), random).slice(0, 4);
  const moduleWords = db.prepare('SELECT * FROM vocabulary WHERE module_id = ? AND owner_user_id IS NULL').all(moduleId) as VocabRow[];
  const vocab = [...vocabTest, ...vocabQuestions(db, userId, moduleWords, Math.max(0, 8 - vocabTest.length), `${moduleId}:${attemptNo}`)].slice(0, 8);
  const level = view.level;
  const listeningRate = { B1: 0.9, 'B1+': 0.97, B2: 1, 'B2+': 1.05, C1: 1.1 }[level] ?? 1;
  const writing = writingTask(db, `${moduleId}-test-writing`);
  const speaking = speakingTask(db, `${moduleId}-test-speaking`);

  const paper: Paper = {
    kind: 'module_test',
    refId: moduleId,
    title: `Module test: ${view.title}`,
    level,
    minutes: 30,
    sections: [
      { skill: 'grammar', title: 'Grammar', weight: 20, instructions: 'Choose or write the correct answer.', questions: shuffle(grammar, random) },
      { skill: 'vocabulary', title: 'Vocabulary', weight: 20, instructions: 'Show what you know about the words from this module.', questions: shuffle(vocab, random) },
      materialSection(db, 'reading', [`${moduleId}-test-reading`], 20, listeningRate),
      materialSection(db, 'listening', [`${moduleId}-test-listening`], 15, listeningRate),
      { skill: 'writing', title: 'Writing', weight: 15, instructions: 'Write your answer. Aim for the word count shown.', questions: [], task: writing ?? undefined },
      { skill: 'speaking', title: 'Speaking', weight: 10, instructions: 'Record your answer. If speech recognition is not available, rate yourself honestly with the checklist.', questions: [], task: speaking ?? undefined },
    ],
  };
  return publicPaper(paper, createAttempt(db, userId, paper, now));
}

// ---------------------------------------------------------------------------
// Level exam
// ---------------------------------------------------------------------------

export function startLevelExam(db: DB, userId: number, level: CourseLevel, now: Date, opts: { fresh?: boolean } = {}) {
  const map = roadmap(db, userId);
  const lv = map.find((l) => l.code === level);
  if (!lv) throw notFound('Level not found');
  if (!lv.hasExam) throw badRequest('This level exam is not available yet.');
  if (!lv.examAvailable) throw badRequest('Complete more modules in this level before taking the exam.');
  if (!opts.fresh) {
    const existing = existingAttempt(db, userId, 'level_exam', level);
    if (existing) return publicPaper(existing.paper, existing.id);
  }
  const exam = parseJson<{ title: string; readingIds: string[]; listeningIds: string[]; writingId: string; speakingId: string } | null>(
    db.prepare('SELECT exam_json FROM levels WHERE code = ?').pluck().get(level) as string | null,
    null,
  );
  if (!exam) throw badRequest('This level exam is not available yet.');
  const random = seededRandom(`${userId}:${level}:${now.getTime()}`);
  const examQs = questionsFor(db, 'level_exam', level);
  const moduleIds = lv.modules.filter((m) => m.state !== 'planned').map((m) => m.id);
  const placeholders = moduleIds.map(() => '?').join(',') || "''";
  const grammarPool = (db
    .prepare(`SELECT id, skill, cefr_level, data FROM quiz_questions WHERE skill = 'grammar' AND owner_type IN ('grammar_free', 'module_test') AND module_id IN (${placeholders})`)
    .all(...moduleIds) as { id: string; skill: string; cefr_level: string; data: string }[]).map((r) => ({ id: r.id, skill: r.skill, level: r.cefr_level, question: JSON.parse(r.data) as Question }));
  const grammar = mixQuestions(toPaperQuestions(examQs.filter((q) => q.skill === 'grammar')), grammarPool, 12, 8, random);
  const vocabExam = shuffle(toPaperQuestions(examQs.filter((q) => q.skill !== 'grammar')), random).slice(0, 8);
  const levelWords = db.prepare(`SELECT * FROM vocabulary WHERE owner_user_id IS NULL AND module_id IN (${placeholders})`).all(...moduleIds) as VocabRow[];
  const vocab = [...vocabExam, ...vocabQuestions(db, userId, levelWords, Math.max(0, 12 - vocabExam.length), `${level}:${now.getTime()}`)].slice(0, 12);
  const listeningRate = { B1: 0.92, 'B1+': 1, B2: 1.02, 'B2+': 1.08, C1: 1.12 }[level] ?? 1;

  const paper: Paper = {
    kind: 'level_exam',
    refId: level,
    title: exam.title,
    level,
    minutes: 75,
    sections: [
      { skill: 'grammar', title: 'Grammar', weight: 15, instructions: 'Choose or write the correct answer.', questions: shuffle(grammar, random) },
      { skill: 'vocabulary', title: 'Vocabulary', weight: 15, instructions: 'Vocabulary from the whole level.', questions: shuffle(vocab, random) },
      materialSection(db, 'reading', exam.readingIds, 20, listeningRate),
      materialSection(db, 'listening', exam.listeningIds, 20, listeningRate),
      { skill: 'writing', title: 'Writing', weight: 20, instructions: 'Write your answer.', questions: [], task: writingTask(db, exam.writingId) ?? undefined },
      { skill: 'speaking', title: 'Speaking', weight: 10, instructions: 'Record your answer.', questions: [], task: speakingTask(db, exam.speakingId) ?? undefined },
    ],
  };
  return publicPaper(paper, createAttempt(db, userId, paper, now));
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface SubmitInput {
  answers: Record<string, AnswerValue>;
  writing?: { text: string } | null;
  speaking?: { transcript?: string | null; durationSec?: number | null; selfRating?: number | null; attemptId?: number | null } | null;
  minutes?: number;
}

export interface SectionResult {
  skill: SectionSkill;
  title: string;
  weight: number;
  percent: number | null;
  correct: number;
  total: number;
  note?: string;
}

export interface Mistake {
  section: string;
  prompt: string;
  yourAnswer: string;
  correctAnswer: string;
  explanation: string | null;
}

function describeAnswer(q: Question, value: AnswerValue): string {
  if (value === null || value === undefined || value === '') return '(no answer)';
  if (q.type === 'mcq') return q.options[Number(value)] ?? String(value);
  if (q.type === 'error') return q.segments[Number(value)] ?? String(value);
  if (q.type === 'tfng') return value === 'not_given' ? 'Not given' : value === 'true' ? 'True' : 'False';
  if (Array.isArray(value)) return value.join(q.type === 'order' ? ' → ' : q.type === 'words' ? ' ' : ', ');
  return String(value);
}

function promptOf(q: Question): string {
  if (q.type === 'tfng') return q.prompt;
  if (q.type === 'correct' || q.type === 'transform') return `${q.prompt} ${q.sentence}`;
  if (q.type === 'summary') return q.prompt;
  return q.prompt;
}

/** Sentence with the learner's answer filled into the gap — used for the mistakes notebook. */
function filled(q: Question, value: string): string | null {
  if ((q.type === 'gap' || q.type === 'mcq') && q.prompt.includes('___')) return q.prompt.split('\n')[0].replace('___', value);
  return null;
}

function gradeObjective(sections: PaperSection[], answers: Record<string, AnswerValue>) {
  const results: SectionResult[] = [];
  const responses: ResponseInput[] = [];
  const mistakes: Mistake[] = [];
  const vocabResults: { vocabId: string; correct: boolean }[] = [];
  const itemResults: { skill: string; level: string; score: number }[] = [];
  for (const s of sections) {
    if (!s.questions.length) continue;
    let total = 0;
    let correct = 0;
    for (const pq of s.questions) {
      const value = answers[pq.id] ?? null;
      const r = checkAnswer(pq.question, value);
      total += r.score;
      if (r.correct) correct++;
      itemResults.push({ skill: s.skill, level: pq.level, score: r.score });
      const your = describeAnswer(pq.question, value);
      const right = expectedAnswer(pq.question);
      // Skipped questions count as wrong, but they are not language errors for the mistakes notebook.
      const answered = value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);
      responses.push({
        questionId: pq.vocabId ? null : pq.id,
        skill: s.skill,
        qtype: pq.question.type,
        tag: pq.question.tag ?? null,
        level: pq.level,
        difficulty: pq.question.difficulty ?? null,
        correct: r.correct,
        score: r.score,
        wrong: filled(pq.question, your) ?? (pq.question.type === 'correct' ? pq.question.sentence : your),
        right: answered ? (filled(pq.question, right) ?? right) : null,
        explanation: pq.question.explanation ?? null,
        explanationMn: pq.question.explanationMn ?? null,
      });
      if (pq.vocabId) vocabResults.push({ vocabId: pq.vocabId, correct: r.correct });
      if (!r.correct) mistakes.push({ section: s.title, prompt: promptOf(pq.question), yourAnswer: your, correctAnswer: right, explanation: pq.question.explanation ?? null });
    }
    results.push({ skill: s.skill, title: s.title, weight: s.weight, percent: total / s.questions.length, correct, total: s.questions.length });
  }
  return { results, responses, mistakes, vocabResults, itemResults };
}

function lockAttempt(db: DB, userId: number, attemptId: number): { paper: Paper; kind: string; refId: string } {
  const row = db.prepare('SELECT paper, status, context_type, context_id FROM quiz_attempts WHERE id = ? AND user_id = ?').get(attemptId, userId) as
    | { paper: string; status: string; context_type: string; context_id: string }
    | undefined;
  if (!row) throw notFound('Test attempt not found');
  if (row.status === 'submitted') throw conflict('This test has already been submitted.');
  return { paper: JSON.parse(row.paper) as Paper, kind: row.context_type, refId: row.context_id };
}

async function gradeProductive(db: DB, ai: AIProvider, userId: number, paper: Paper, input: SubmitInput, attemptId: number, now: Date) {
  const settings = getSettings(db, userId);
  const learner = { level: paper.level, explanationLanguage: effectiveExplanationLanguage(settings) };
  let writing: { percent: number | null; feedback: WritingFeedback | null } = { percent: null, feedback: null };
  let speaking: { percent: number | null; feedback: SpeakingFeedback | null } = { percent: null, feedback: null };

  const wSection = paper.sections.find((s) => s.skill === 'writing');
  const wTask = wSection?.task as { id: string; prompt: string; type: string; register: string; minWords: number; maxWords: number; targetWords: string[] } | undefined;
  if (wTask && input.writing?.text?.trim()) {
    const fb = await writingFeedback(ai, input.writing.text, { ...wTask, level: paper.level }, learner);
    writing = { percent: fb.score / 100, feedback: fb };
    db.prepare(`INSERT INTO writing_submissions (user_id, task_id, context, prompt, text, word_count, feedback, score, ai_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      userId,
      wTask.id,
      `${paper.kind}:${attemptId}`,
      wTask.prompt,
      input.writing.text,
      fb.analysis.wordCount,
      JSON.stringify(fb),
      fb.score,
      fb.source === 'ai' ? 1 : 0,
      now.toISOString(),
    );
  } else if (wTask) {
    writing = { percent: 0, feedback: null };
  }

  const sSection = paper.sections.find((s) => s.skill === 'speaking');
  const sTask = sSection?.task as { id: string; prompt: string; type: string; points: string[]; targetWords: string[]; speakSeconds: number } | undefined;
  if (sTask && input.speaking && (input.speaking.transcript || input.speaking.selfRating != null)) {
    const fb = await speakingFeedback(ai, { transcript: input.speaking.transcript ?? null, durationSec: input.speaking.durationSec ?? null, selfRating: input.speaking.selfRating ?? null }, { ...sTask, level: paper.level }, learner);
    speaking = { percent: fb.score !== null ? fb.score / 100 : null, feedback: fb };
    if (input.speaking.attemptId) {
      db.prepare('UPDATE speaking_attempts SET feedback = ?, ai_used = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(fb), fb.source === 'ai' ? 1 : 0, input.speaking.attemptId, userId);
    } else {
      db.prepare(`INSERT INTO speaking_attempts (user_id, task_id, context, prompt, transcript, duration_sec, feedback, ai_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        userId,
        sTask.id,
        `${paper.kind}:${attemptId}`,
        sTask.prompt,
        input.speaking.transcript ?? null,
        input.speaking.durationSec ?? null,
        JSON.stringify(fb),
        fb.source === 'ai' ? 1 : 0,
        now.toISOString(),
      );
    }
  }
  return { writing, speaking };
}

export interface TestResult extends ActivityResult {
  attemptId: number;
  kind: 'module_test' | 'level_exam';
  refId: string;
  title: string;
  percent: number;
  passed: boolean;
  passMark: number;
  sections: SectionResult[];
  strong: string[];
  weak: string[];
  mistakes: Mistake[];
  objectives: { text: string; skills: string[]; achieved: boolean }[];
  recommendations: { type: 'lesson' | 'practice'; id?: string; title: string; reason: string }[];
  writingFeedback: WritingFeedback | null;
  speakingFeedback: SpeakingFeedback | null;
  message: string;
  recommendation?: string;
  unlockedLevel?: string | null;
}

export async function submitTest(db: DB, ai: AIProvider, userId: number, attemptId: number, input: SubmitInput, now: Date): Promise<TestResult> {
  const { paper, kind } = lockAttempt(db, userId, attemptId);
  if (kind !== 'module_test' && kind !== 'level_exam') throw badRequest('Not a test attempt');
  const objective = gradeObjective(paper.sections, input.answers ?? {});
  const productive = await gradeProductive(db, ai, userId, paper, input, attemptId, now);

  const sections: SectionResult[] = paper.sections.map((s) => {
    const found = objective.results.find((r) => r.skill === s.skill);
    if (found) return found;
    if (s.skill === 'writing') return { skill: s.skill, title: s.title, weight: s.weight, percent: s.task ? productive.writing.percent : null, correct: 0, total: 0, note: productive.writing.feedback?.source === 'automatic' ? 'Automatic estimate' : productive.writing.feedback ? 'AI assessment' : 'Not answered' };
    const sp = productive.speaking;
    return {
      skill: s.skill,
      title: s.title,
      weight: s.weight,
      percent: s.task ? sp.percent : null,
      correct: 0,
      total: 0,
      note: sp.feedback?.source === 'self' ? 'Self-assessed' : sp.feedback?.source === 'automatic' ? 'Automatic estimate' : sp.feedback ? 'AI assessment' : 'Skipped',
    };
  });
  const percent = weightedPercent(sections.map((s) => ({ weight: s.weight, percent: s.percent })));

  let passed: boolean;
  let message: string;
  let recommendation: string | undefined;
  let unlockedLevel: string | null | undefined;
  if (kind === 'level_exam') {
    const floorOk = sections.every((s) => s.percent === null || s.percent >= LEVEL_SKILL_FLOOR);
    passed = percent >= LEVEL_PASS && floorOk;
  } else {
    passed = percent >= MODULE_PASS;
  }

  const strong = sections.filter((s) => s.percent !== null && s.percent >= 0.8).map((s) => s.title);
  const weak = sections.filter((s) => s.percent !== null && s.percent < 0.6).map((s) => s.title);
  const bySkill = new Map(sections.map((s) => [s.skill, s.percent]));

  db.transaction(() => {
    db.prepare(`UPDATE quiz_attempts SET status = 'submitted', finished_at = ?, score = ?, max_score = 1, percent = ?, section_scores = ?, details = ? WHERE id = ?`).run(
      now.toISOString(),
      percent,
      percent,
      JSON.stringify(sections),
      JSON.stringify({ answers: input.answers, mistakes: objective.mistakes }),
      attemptId,
    );
    recordResponses(db, userId, { type: kind, id: paper.refId, attemptId }, objective.responses, now);
    for (const v of objective.vocabResults) gradeWord(db, userId, { vocabId: v.vocabId, correct: v.correct, mode: 'test', dimension: 'context', source: kind }, now);
    for (const s of sections) {
      if (s.percent === null) continue;
      applyEvidence(db, userId, s.skill, paper.level, s.percent, kind, now);
      adaptDifficulty(db, userId, s.skill, s.percent, now);
      if (s.percent < 0.6) addFocusExtra(db, userId, s.skill as CoreSkill, now);
    }
  })();

  let objectives: TestResult['objectives'] = [];
  const recommendations: TestResult['recommendations'] = [];
  if (kind === 'module_test') {
    const mod = db.prepare('SELECT objectives FROM modules WHERE id = ?').pluck().get(paper.refId) as string;
    objectives = parseJson<{ text: string; skills: string[] }[]>(mod, []).map((o) => {
      const vals = o.skills.map((s) => bySkill.get(s as SectionSkill)).filter((v): v is number => typeof v === 'number');
      return { ...o, achieved: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length >= 0.6 : false };
    });
    db.prepare('INSERT INTO module_results (user_id, module_id, attempt_id, percent, section_scores, objectives, passed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      userId,
      paper.refId,
      attemptId,
      percent,
      JSON.stringify(sections),
      JSON.stringify(objectives),
      passed ? 1 : 0,
      now.toISOString(),
    );
    const lessons = db.prepare(`SELECT id, title, focus FROM lessons WHERE module_id = ? AND kind = 'core' ORDER BY ord`).all(paper.refId) as { id: string; title: string; focus: string }[];
    for (const w of sections.filter((s) => s.percent !== null && s.percent < 0.6)) {
      const lesson = lessons.find((l) => l.focus === w.skill) ?? (w.skill === 'vocabulary' ? lessons[0] : undefined);
      if (lesson) recommendations.push({ type: 'lesson', id: lesson.id, title: lesson.title, reason: `Review for ${w.title.toLowerCase()} (${Math.round((w.percent ?? 0) * 100)}%).` });
      else recommendations.push({ type: 'practice', title: `Extra ${w.title.toLowerCase()} practice`, reason: `Added to your upcoming sessions (${Math.round((w.percent ?? 0) * 100)}%).` });
    }
    message = passed
      ? `Well done — you passed with ${Math.round(percent * 100)}%. The next module is unlocked.`
      : `Not quite yet — ${Math.round(percent * 100)}% (you need ${Math.round(MODULE_PASS * 100)}%). Review the recommended lessons, then try again. The questions will be different next time.`;
  } else {
    const level = paper.refId as CourseLevel;
    const idx = COURSE_LEVELS.indexOf(level);
    const next = COURSE_LEVELS[idx + 1] ?? null;
    if (passed) {
      unlockedLevel = completeLevel(db, userId, level, now);
      recommendation = next ? `Recommended to continue to ${next}.` : 'You have completed the C1 journey.';
      message = next
        ? `Excellent — ${Math.round(percent * 100)}%. Based on this evidence, you are recommended to continue to ${next}. ${next} is now unlocked.`
        : `Congratulations — ${Math.round(percent * 100)}%. You have completed the final level of the course.`;
    } else {
      const weakSkills = sections.filter((s) => s.percent !== null && s.percent < LEVEL_SKILL_FLOOR).map((s) => s.title.toLowerCase());
      recommendation = `Not quite yet. Focus on ${weakSkills.length ? weakSkills.join(', ') : 'the weaker sections'} before trying again.`;
      message = `${Math.round(percent * 100)}% overall. To move on you need ${Math.round(LEVEL_PASS * 100)}% overall and at least ${Math.round(LEVEL_SKILL_FLOOR * 100)}% in every skill. ${recommendation}`;
      for (const s of sections.filter((x) => x.percent !== null && x.percent < LEVEL_SKILL_FLOOR)) {
        recommendations.push({ type: 'practice', title: `Extra ${s.title.toLowerCase()} practice`, reason: `${Math.round((s.percent ?? 0) * 100)}% — added to your weekly focus.` });
      }
    }
    db.prepare('INSERT INTO level_results (user_id, level_code, attempt_id, percent, skill_scores, recommendation, passed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      userId,
      paper.refId,
      attemptId,
      percent,
      JSON.stringify(sections),
      recommendation ?? '',
      passed ? 1 : 0,
      now.toISOString(),
    );
  }

  const firstPass = passed && (db.prepare(`SELECT COUNT(*) FROM ${kind === 'module_test' ? 'module_results WHERE module_id' : 'level_results WHERE level_code'} = ? AND user_id = ? AND passed = 1`).pluck().get(paper.refId, userId) as number) === 1;
  const act = logActivity(
    db,
    userId,
    {
      type: kind,
      ref: paper.refId,
      skill: null,
      minutes: input.minutes ?? paper.minutes,
      score: percent,
      xp: firstPass ? (kind === 'module_test' ? XP.moduleTestPass : XP.levelExamPass) : Math.round(percent * 40),
      xpReason: paper.title,
    },
    now,
  );

  if (kind === 'module_test') autoCompleteSessionItems(db, userId, 'module_test', (p) => p.moduleId === paper.refId, now);
  return {
    ...act,
    attemptId,
    kind,
    refId: paper.refId,
    title: paper.title,
    percent,
    passed,
    passMark: kind === 'module_test' ? MODULE_PASS : LEVEL_PASS,
    sections,
    strong,
    weak,
    mistakes: objective.mistakes,
    objectives,
    recommendations,
    writingFeedback: productive.writing.feedback,
    speakingFeedback: productive.speaking.feedback,
    message,
    recommendation,
    unlockedLevel,
  };
}

export function testResult(db: DB, userId: number, attemptId: number) {
  const row = db.prepare(`SELECT context_type, context_id, percent, section_scores, details, finished_at, paper FROM quiz_attempts WHERE id = ? AND user_id = ? AND status = 'submitted'`).get(attemptId, userId) as
    | { context_type: string; context_id: string; percent: number; section_scores: string; details: string; finished_at: string; paper: string }
    | undefined;
  if (!row) throw notFound('Result not found');
  const paper = JSON.parse(row.paper) as Paper;
  return {
    attemptId,
    kind: row.context_type,
    refId: row.context_id,
    title: paper.title,
    percent: row.percent,
    sections: parseJson(row.section_scores, []),
    mistakes: parseJson<{ mistakes: Mistake[] }>(row.details, { mistakes: [] }).mistakes,
    finishedAt: row.finished_at,
  };
}

export function testHistory(db: DB, userId: number) {
  return db
    .prepare(`SELECT id, context_type AS kind, context_id AS refId, percent, finished_at AS finishedAt FROM quiz_attempts WHERE user_id = ? AND status = 'submitted' AND context_type IN ('module_test', 'level_exam', 'placement') ORDER BY id DESC LIMIT 50`)
    .all(userId);
}

// ---------------------------------------------------------------------------
// Placement test
// ---------------------------------------------------------------------------

function placementDoc(db: DB): PlacementDoc {
  const data = db.prepare('SELECT data FROM placement_test WHERE id = 1').pluck().get() as string | undefined;
  if (!data) throw notFound('The placement test is not installed. Add content/placement.json and restart.');
  return JSON.parse(data) as PlacementDoc;
}

export function startPlacement(db: DB, userId: number, now: Date) {
  const existing = existingAttempt(db, userId, 'placement', 'placement');
  if (existing) return publicPaper(existing.paper, existing.id);
  const doc = placementDoc(db);
  const grammar = questionsFor(db, 'placement_grammar', 'placement');
  const vocab = questionsFor(db, 'placement_vocabulary', 'placement');
  const sortByLevel = <T extends { level: string }>(xs: T[]) => [...xs].sort((a, b) => levelValue(a.level) - levelValue(b.level));
  const paper: Paper = {
    kind: 'placement',
    refId: 'placement',
    title: 'Placement test',
    level: 'B1',
    minutes: 40,
    sections: [
      { skill: 'grammar', title: 'Grammar', weight: 1, instructions: 'Questions get harder as you go. It is fine not to know them all — just do your best. Skip anything you have no idea about.', questions: sortByLevel(toPaperQuestions(grammar)) },
      { skill: 'vocabulary', title: 'Vocabulary', weight: 1, instructions: 'Choose the best answer. The questions become harder.', questions: sortByLevel(toPaperQuestions(vocab)) },
      {
        skill: 'reading',
        title: 'Reading',
        weight: 1,
        instructions: 'Read each text and answer the questions. Texts get longer and harder.',
        materials: doc.reading.map(({ questions: _q, ...rest }, i) => ({ ...rest, id: `p-read-${i}` })),
        questions: doc.reading.flatMap((r, i) => r.questions.map((q, j) => ({ id: `p-read-${i}:${j}`, skill: 'reading', level: q.level ?? r.level, question: q }))),
      },
      {
        skill: 'listening',
        title: 'Listening',
        weight: 1,
        instructions: 'Press play and listen. You can replay each clip twice.',
        materials: doc.listening.map((l, i) => {
          const { gist: _g, detail: _d, ...rest } = l as ListeningMaterial & { level: string };
          return { ...rest, id: `p-listen-${i}`, rate: { A2: 0.85, 'A2+': 0.88, B1: 0.9, 'B1+': 0.97, B2: 1, 'B2+': 1.05, C1: 1.1, 'C1+': 1.1 }[(l as { level: string }).level] ?? 1 };
        }),
        questions: doc.listening.flatMap((l, i) =>
          [...l.gist, ...l.detail].map((q, j) => ({ id: `p-listen-${i}:${j}`, skill: 'listening', level: q.level ?? (l as { level: string }).level, question: q })),
        ),
      },
      { skill: 'writing', title: 'Writing', weight: 1, instructions: 'Write a short text. This helps estimate your writing level.', questions: [], task: { ...doc.writing, id: 'p-writing' } },
      { skill: 'speaking', title: 'Speaking (optional)', weight: 1, instructions: 'Optional: record a short answer. You can skip this section.', questions: [], task: { ...doc.speaking, id: 'p-speaking' } },
    ],
  };
  return publicPaper(paper, createAttempt(db, userId, paper, now));
}

export async function submitPlacement(db: DB, ai: AIProvider, userId: number, attemptId: number, input: SubmitInput, now: Date) {
  const { paper, kind } = lockAttempt(db, userId, attemptId);
  if (kind !== 'placement') throw badRequest('Not a placement attempt');
  const objective = gradeObjective(paper.sections, input.answers ?? {});
  const bySkill = (skill: string): PlacementItemResult[] => objective.itemResults.filter((r) => r.skill === skill).map((r) => ({ level: r.level, score: r.score }));
  const settings = getSettings(db, userId);
  const learner = { level: 'B1', explanationLanguage: effectiveExplanationLanguage(settings) };

  let writingScore: number | null = null;
  let writingFb: WritingFeedback | null = null;
  const wTask = paper.sections.find((s) => s.skill === 'writing')?.task as { prompt: string; type: string; register: string; minWords: number; maxWords: number; targetWords: string[] } | undefined;
  if (wTask && input.writing?.text?.trim()) {
    writingFb = await writingFeedback(ai, input.writing.text, { ...wTask, level: 'B1' }, learner);
    const auto = estimateWritingLevel(analyzeWriting(input.writing.text, {}), wTask.minWords);
    let aiLevel: number | null = null;
    if (writingFb.source === 'ai' && writingFb.levelEstimate) {
      const first = writingFb.levelEstimate.split('/')[0].trim();
      try {
        aiLevel = levelValue(first);
      } catch {
        aiLevel = null;
      }
    }
    writingScore = aiLevel ?? auto;
  }
  let speakingScore: number | null = null;
  let speakingFb: SpeakingFeedback | null = null;
  const sTask = paper.sections.find((s) => s.skill === 'speaking')?.task as { prompt: string; type: string; points: string[]; targetWords: string[]; speakSeconds: number } | undefined;
  if (sTask && input.speaking?.transcript?.trim()) {
    speakingFb = await speakingFeedback(ai, { transcript: input.speaking.transcript, durationSec: input.speaking.durationSec ?? null }, { ...sTask, level: 'B1' }, learner);
    if (speakingFb.source === 'ai' && speakingFb.levelEstimate) {
      try {
        speakingScore = levelValue(speakingFb.levelEstimate.split('/')[0].trim());
      } catch {
        speakingScore = null;
      }
    }
  }

  const summary = summarizePlacement({
    grammar: estimateFromItems(bySkill('grammar')),
    vocabulary: estimateFromItems(bySkill('vocabulary')),
    reading: estimateFromItems(bySkill('reading')),
    listening: estimateFromItems(bySkill('listening')),
    writing: writingScore,
    speaking: speakingScore,
  });

  db.transaction(() => {
    db.prepare(`UPDATE quiz_attempts SET status = 'submitted', finished_at = ?, percent = ?, section_scores = ?, details = ? WHERE id = ?`).run(
      now.toISOString(),
      summary.overall / 5,
      JSON.stringify(summary.skills),
      JSON.stringify({ mistakes: objective.mistakes }),
      attemptId,
    );
    recordResponses(db, userId, { type: 'placement', id: 'placement', attemptId }, objective.responses.map((r) => ({ ...r, right: null })), now);
    for (const [skill, score] of Object.entries(summary.skills)) {
      setSkillScore(db, userId, skill, score, summary.provisional.includes(skill as never), now);
    }
    setSkillScore(db, userId, 'pronunciation', summary.skills.speaking ?? summary.overall, true, now);
    db.prepare('INSERT INTO placement_results (user_id, taken_at, overall, skills, summary, details) VALUES (?, ?, ?, ?, ?, ?)').run(
      userId,
      now.toISOString(),
      summary.overall,
      JSON.stringify(summary.skills),
      JSON.stringify(summary),
      JSON.stringify({ writing: writingFb, speaking: speakingFb }),
    );
    snapshot(db, userId, now);
  })();
  logActivity(db, userId, { type: 'placement', ref: 'placement', minutes: input.minutes ?? 30, score: summary.overall / 5, xp: XP.placementTest, xpReason: 'Placement test' }, now);

  return {
    ...summary,
    overallLabel: labelFor(summary.overall),
    recommendedStart: summary.startLevel,
    writingFeedback: writingFb,
    speakingFeedback: speakingFb,
    sectionAccuracy: ['grammar', 'vocabulary', 'reading', 'listening'].map((s) => {
      const items = bySkill(s);
      return { skill: s, correct: items.filter((i) => i.score >= 1).length, total: items.length };
    }),
  };
}

/** Apply the starting point the learner chose after placement (or skip placement). */
export function acceptPlacement(db: DB, userId: number, level: CourseLevel, now: Date, skipped = false) {
  placeAtLevel(db, userId, level, now);
  db.prepare('UPDATE user_settings SET placement_status = ?, onboarded = 1 WHERE user_id = ?').run(skipped ? 'skipped' : 'done', userId);
  if (skipped) snapshot(db, userId, now);
  return { courseLevel: level, next: nextStep(db, userId) };
}

export function latestPlacement(db: DB, userId: number) {
  const row = db.prepare('SELECT taken_at, summary FROM placement_results WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) as { taken_at: string; summary: string } | undefined;
  return row ? { takenAt: row.taken_at, ...parseJson<Record<string, unknown>>(row.summary, {}) } : null;
}
