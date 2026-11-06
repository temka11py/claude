// Vocabulary: per-user spaced-repetition state, review queues and the word bank.

import type { DB } from '../db';
import { nowIso, parseJson } from '../db';
import {
  applyReview,
  introduceCard,
  newCard,
  reviewCutoff,
  reviewPriority,
  weakestDimension,
  type CardState,
  type Dimension,
  type Grade,
  type StudySchedule,
  type VocabState,
} from '@shared/srs';
import { exerciseFor, interleave, MODE_DIMENSION, type VocabExercise, type VocabItem, type VocabMode } from '@shared/vocabExercises';
import { seededRandom, slugify } from '@shared/text';
import { XP } from '@shared/gamification';
import { awardXp } from './activity';

export interface VocabRow {
  id: string;
  word: string;
  pos: string | null;
  ipa: string | null;
  definition: string;
  mongolian: string | null;
  examples: string;
  collocations: string;
  synonyms: string;
  antonyms: string;
  mistake: string | null;
  note: string | null;
  cefr_level: string;
  difficulty: number;
  topic: string | null;
  module_id: string | null;
  lesson_id: string | null;
  owner_user_id: number | null;
  personal_note: string | null;
  tags: string;
}

export function rowToItem(r: VocabRow): VocabItem {
  return {
    id: r.id,
    word: r.word,
    pos: r.pos,
    ipa: r.ipa,
    definition: r.definition,
    mongolian: r.mongolian,
    examples: parseJson(r.examples, []),
    collocations: parseJson(r.collocations, []),
    synonyms: parseJson(r.synonyms, []),
    antonyms: parseJson(r.antonyms, []),
    mistake: r.mistake,
    note: r.note,
    level: r.cefr_level,
    difficulty: r.difficulty,
  };
}

/** Public shape of a word for the browser. */
export function wordView(r: VocabRow, card?: CardState | null) {
  return {
    ...rowToItem(r),
    topic: r.topic,
    moduleId: r.module_id,
    lessonId: r.lesson_id,
    custom: r.owner_user_id !== null,
    personalNote: r.personal_note,
    tags: parseJson<string[]>(r.tags, []),
    progress: card
      ? {
          state: card.state,
          dueAt: card.dueAt,
          intervalDays: card.intervalDays,
          correct: card.correctCount,
          incorrect: card.incorrectCount,
          lapses: card.lapses,
          confidence: card.confidence,
          exposures: card.exposureCount,
          firstLearnedAt: card.firstLearnedAt,
          lastReviewedAt: card.lastReviewedAt,
          dimensions: { recognition: card.recognition, recall: card.recall, context: card.context, production: card.production, retention: card.retention },
        }
      : null,
  };
}

interface CardRow {
  state: VocabState;
  step: number;
  ease: number;
  interval_days: number;
  due_at: string | null;
  lapses: number;
  reviews: number;
  correct_count: number;
  incorrect_count: number;
  exposure_count: number;
  confidence: number;
  recognition: number;
  recall: number;
  context: number;
  production: number;
  retention: number;
  retention_checks: number;
  first_learned_at: string | null;
  last_reviewed_at: string | null;
}

export function rowToCard(r: CardRow): CardState {
  return {
    state: r.state,
    step: r.step,
    ease: r.ease,
    intervalDays: r.interval_days,
    dueAt: r.due_at,
    lapses: r.lapses,
    reviews: r.reviews,
    correctCount: r.correct_count,
    incorrectCount: r.incorrect_count,
    exposureCount: r.exposure_count,
    confidence: r.confidence,
    recognition: r.recognition,
    recall: r.recall,
    context: r.context,
    production: r.production,
    retention: r.retention,
    retentionChecks: r.retention_checks,
    firstLearnedAt: r.first_learned_at,
    lastReviewedAt: r.last_reviewed_at,
  };
}

export function getCard(db: DB, userId: number, vocabId: string): CardState | null {
  const r = db.prepare('SELECT * FROM user_vocab WHERE user_id = ? AND vocab_id = ?').get(userId, vocabId) as CardRow | undefined;
  return r ? rowToCard(r) : null;
}

function saveCard(db: DB, userId: number, vocabId: string, c: CardState, now: Date): void {
  db.prepare(
    `INSERT INTO user_vocab (user_id, vocab_id, state, step, ease, interval_days, due_at, lapses, reviews, correct_count, incorrect_count,
       exposure_count, confidence, recognition, recall, context, production, retention, retention_checks, first_seen_at, first_learned_at, last_reviewed_at)
     VALUES (@user_id, @vocab_id, @state, @step, @ease, @interval_days, @due_at, @lapses, @reviews, @correct_count, @incorrect_count,
       @exposure_count, @confidence, @recognition, @recall, @context, @production, @retention, @retention_checks, @now, @first_learned_at, @last_reviewed_at)
     ON CONFLICT(user_id, vocab_id) DO UPDATE SET state=excluded.state, step=excluded.step, ease=excluded.ease, interval_days=excluded.interval_days,
       due_at=excluded.due_at, lapses=excluded.lapses, reviews=excluded.reviews, correct_count=excluded.correct_count,
       incorrect_count=excluded.incorrect_count, exposure_count=excluded.exposure_count, confidence=excluded.confidence,
       recognition=excluded.recognition, recall=excluded.recall, context=excluded.context, production=excluded.production,
       retention=excluded.retention, retention_checks=excluded.retention_checks, first_learned_at=excluded.first_learned_at,
       last_reviewed_at=excluded.last_reviewed_at`,
  ).run({
    user_id: userId,
    vocab_id: vocabId,
    state: c.state,
    step: c.step,
    ease: c.ease,
    interval_days: c.intervalDays,
    due_at: c.dueAt,
    lapses: c.lapses,
    reviews: c.reviews,
    correct_count: c.correctCount,
    incorrect_count: c.incorrectCount,
    exposure_count: c.exposureCount,
    confidence: c.confidence,
    recognition: c.recognition,
    recall: c.recall,
    context: c.context,
    production: c.production,
    retention: c.retention,
    retention_checks: c.retentionChecks,
    first_learned_at: c.firstLearnedAt,
    last_reviewed_at: c.lastReviewedAt,
    now: now.toISOString(),
  });
}

function difficultyOf(db: DB, vocabId: string): number | null {
  return (db.prepare('SELECT difficulty FROM vocabulary WHERE id = ?').pluck().get(vocabId) as number | undefined) ?? null;
}

/** Words shown in a lesson enter the review cycle (same-day review first). */
export function introduceWords(db: DB, userId: number, vocabIds: string[], now: Date): number {
  let added = 0;
  db.transaction(() => {
    for (const id of vocabIds) {
      const difficulty = difficultyOf(db, id);
      if (difficulty === null) continue;
      const existing = getCard(db, userId, id);
      if (!existing) added++;
      saveCard(db, userId, id, introduceCard(existing ?? newCard(difficulty), now), now);
    }
  })();
  return added;
}

export interface GradeInput {
  vocabId: string;
  grade?: Grade;
  correct?: boolean;
  mode: VocabMode | 'lesson' | 'game' | 'test' | 'writing';
  dimension?: Dimension;
  responseMs?: number;
  source: string;
}

/** Apply one review answer to a word. Creates the card if the word was never introduced. */
export function gradeWord(db: DB, userId: number, input: GradeInput, now: Date): CardState | null {
  const difficulty = difficultyOf(db, input.vocabId);
  if (difficulty === null) return null;
  let card = getCard(db, userId, input.vocabId) ?? introduceCard(newCard(difficulty), now);
  const dimension = input.dimension ?? (input.mode in MODE_DIMENSION ? MODE_DIMENSION[input.mode as VocabMode] : 'recognition');
  const grade: Grade = input.grade ?? (input.correct ? (input.responseMs && input.responseMs > 15000 ? 'hard' : 'good') : 'again');
  const before = card.intervalDays;
  // Games and lesson practice give lighter evidence: they grow intervals less than deliberate review.
  const intervalModifier = input.mode === 'game' ? 0.7 : dimension === 'recognition' ? 0.8 : 1;
  card = applyReview(card, grade, now, { dimension, intervalModifier });
  saveCard(db, userId, input.vocabId, card, now);
  db.prepare(
    `INSERT INTO vocabulary_reviews (user_id, vocab_id, mode, dimension, grade, correct, response_ms, interval_before, interval_after, state_after, source, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, input.vocabId, input.mode, dimension, grade, grade === 'again' ? 0 : 1, input.responseMs ?? null, before, card.intervalDays, card.state, input.source, now.toISOString());
  if (input.source === 'review') awardXp(db, userId, XP.reviewCard + (grade === 'again' ? 0 : 1), 'Vocabulary review', input.vocabId, now);
  return card;
}

const VOCAB_SELECT = `SELECT v.* FROM vocabulary v`;

export function vocabRow(db: DB, id: string): VocabRow | null {
  return (db.prepare(`${VOCAB_SELECT} WHERE v.id = ?`).get(id) as VocabRow | undefined) ?? null;
}

/** Distractor pool: course words from published modules plus the learner's own words. */
export function distractorPool(db: DB, userId: number): VocabItem[] {
  const rows = db
    .prepare(
      `SELECT v.* FROM vocabulary v LEFT JOIN modules m ON m.id = v.module_id
       WHERE (v.owner_user_id IS NULL AND m.status = 'published') OR v.owner_user_id = ?`,
    )
    .all(userId) as VocabRow[];
  return rows.map(rowToItem);
}

export function dueCount(db: DB, userId: number, now: Date, schedule: StudySchedule): number {
  return db
    .prepare(`SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND suspended = 0 AND state != 'NEW' AND due_at <= ?`)
    .pluck()
    .get(userId, reviewCutoff(now, schedule).toISOString()) as number;
}

export interface ReviewItem {
  exercise: VocabExercise;
  word: ReturnType<typeof wordView>;
}

/** Build today's review queue: most urgent words first, exercises aimed at each word's weakest dimension. */
export function reviewQueue(
  db: DB,
  userId: number,
  now: Date,
  schedule: StudySchedule,
  opts: { limit?: number; mode?: 'mixed' | 'flashcards'; ids?: string[] } = {},
): ReviewItem[] {
  const limit = Math.min(100, opts.limit ?? 20);
  const params: unknown[] = [userId];
  let where = `uv.user_id = ? AND uv.suspended = 0 AND uv.state != 'NEW'`;
  if (opts.ids?.length) {
    where += ` AND uv.vocab_id IN (${opts.ids.map(() => '?').join(',')})`;
    params.push(...opts.ids);
  } else {
    where += ' AND uv.due_at <= ?';
    params.push(reviewCutoff(now, schedule).toISOString());
  }
  const rows = db.prepare(`SELECT uv.*, v.* FROM user_vocab uv JOIN vocabulary v ON v.id = uv.vocab_id WHERE ${where}`).all(...params) as (VocabRow & CardRow)[];
  const cards = rows
    .map((r) => ({ row: r as VocabRow, card: rowToCard(r) }))
    .sort((a, b) => reviewPriority(b.card, now) - reviewPriority(a.card, now))
    .slice(0, limit);
  if (!cards.length) return [];
  const pool = distractorPool(db, userId);
  const random = seededRandom(`${userId}:${now.toISOString().slice(0, 13)}`);
  const items = cards.map(({ row, card }) => {
    const item = rowToItem(row);
    let exercise: VocabExercise;
    if (opts.mode === 'flashcards') {
      exercise = exerciseFor(item, 'recall', pool, random, ['word_from_definition']);
    } else {
      // Mostly the weakest dimension, sometimes another one — interleaving keeps reviews varied.
      const dims: Dimension[] = ['recognition', 'recall', 'context', 'production'];
      const dim = random() < 0.7 ? weakestDimension(card) : dims[Math.floor(random() * dims.length)];
      exercise = exerciseFor(item, card.state === 'LEARNING' && card.reviews === 0 ? 'recall' : dim, pool, random);
    }
    return { exercise, word: wordView(row, card), mode: exercise.mode };
  });
  return interleave(items).map(({ exercise, word }) => ({ exercise, word }));
}

/** Exercises for specific words (lesson practice, games, review lessons). */
export function exercisesForWords(db: DB, userId: number, ids: string[], seed: string, dims?: Dimension[]): ReviewItem[] {
  if (!ids.length) return [];
  const rows = db.prepare(`${VOCAB_SELECT} WHERE v.id IN (${ids.map(() => '?').join(',')})`).all(...ids) as VocabRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pool = distractorPool(db, userId);
  const random = seededRandom(seed);
  const out = ids
    .map((id, i) => {
      const row = byId.get(id);
      if (!row) return null;
      const dim = dims ? dims[i % dims.length] : (['recognition', 'context', 'recall', 'production'] as Dimension[])[i % 4];
      const exercise = exerciseFor(rowToItem(row), dim, pool, random);
      return { exercise, word: wordView(row, getCard(db, userId, id)), mode: exercise.mode };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return interleave(out).map(({ exercise, word }) => ({ exercise, word }));
}

export interface WordListFilter {
  q?: string;
  state?: VocabState | 'due' | 'custom' | 'difficult';
  level?: string;
  moduleId?: string;
  scope?: 'mine' | 'course';
  limit?: number;
  offset?: number;
}

export function listWords(db: DB, userId: number, f: WordListFilter, now: Date, schedule: StudySchedule) {
  const where: string[] = [];
  const params: unknown[] = [userId];
  if (f.scope === 'course') {
    where.push(`(v.owner_user_id IS NULL AND EXISTS (SELECT 1 FROM modules m WHERE m.id = v.module_id AND m.status = 'published'))`);
  } else {
    where.push('(uv.vocab_id IS NOT NULL OR v.owner_user_id = ?)');
    params.push(userId);
  }
  where.push('(v.owner_user_id IS NULL OR v.owner_user_id = ?)');
  params.push(userId);
  if (f.q) {
    where.push('(v.word LIKE ? OR v.definition LIKE ? OR v.mongolian LIKE ?)');
    const like = `%${f.q}%`;
    params.push(like, like, like);
  }
  if (f.level) {
    where.push('v.cefr_level = ?');
    params.push(f.level);
  }
  if (f.moduleId) {
    where.push('v.module_id = ?');
    params.push(f.moduleId);
  }
  if (f.state === 'due') {
    where.push(`uv.state != 'NEW' AND uv.due_at <= ?`);
    params.push(reviewCutoff(now, schedule).toISOString());
  } else if (f.state === 'custom') {
    where.push('v.owner_user_id IS NOT NULL');
  } else if (f.state === 'difficult') {
    where.push('(uv.lapses >= 2 OR (uv.incorrect_count > uv.correct_count AND uv.reviews >= 3))');
  } else if (f.state) {
    where.push('uv.state = ?');
    params.push(f.state);
  }
  const sql = `SELECT v.*, uv.state AS uv_state, uv.* FROM vocabulary v LEFT JOIN user_vocab uv ON uv.vocab_id = v.id AND uv.user_id = ?
    WHERE ${where.join(' AND ')} ORDER BY COALESCE(uv.last_reviewed_at, uv.first_seen_at, v.created_at) DESC, v.word LIMIT ? OFFSET ?`;
  const limit = Math.min(200, f.limit ?? 60);
  const rows = db.prepare(sql).all(...params, limit + 1, f.offset ?? 0) as (VocabRow & CardRow & { uv_state: string | null })[];
  const hasMore = rows.length > limit;
  return {
    words: rows.slice(0, limit).map((r) => wordView(r, r.uv_state ? rowToCard(r) : null)),
    hasMore,
  };
}

export function vocabCounts(db: DB, userId: number, now: Date, schedule: StudySchedule) {
  const rows = db.prepare('SELECT state, COUNT(*) AS n FROM user_vocab WHERE user_id = ? GROUP BY state').all(userId) as { state: VocabState; n: number }[];
  const byState: Record<VocabState, number> = { NEW: 0, LEARNING: 0, FAMILIAR: 0, MASTERED: 0, REVIEW: 0 };
  for (const r of rows) byState[r.state] = r.n;
  const learned = db.prepare('SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND first_learned_at IS NOT NULL').pluck().get(userId) as number;
  const difficult = db.prepare('SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND lapses >= 2').pluck().get(userId) as number;
  return {
    byState,
    total: rows.reduce((a, r) => a + r.n, 0),
    learned,
    difficult,
    due: dueCount(db, userId, now, schedule),
    custom: db.prepare('SELECT COUNT(*) FROM vocabulary WHERE owner_user_id = ?').pluck().get(userId) as number,
  };
}

export interface CustomWordInput {
  word: string;
  pos?: string | null;
  ipa?: string | null;
  definition: string;
  mongolian?: string | null;
  example?: string | null;
  note?: string | null;
  tags?: string[];
  level?: string;
}

export function createCustomWord(db: DB, userId: number, input: CustomWordInput, now: Date): string {
  const base = `u${userId}-${slugify(input.word) || 'word'}`;
  let id = base;
  for (let n = 2; db.prepare('SELECT 1 FROM vocabulary WHERE id = ?').get(id); n++) id = `${base}-${n}`;
  db.prepare(
    `INSERT INTO vocabulary (id, word, pos, ipa, definition, mongolian, examples, collocations, synonyms, antonyms, cefr_level, difficulty, topic, owner_user_id, personal_note, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', ?, 3, 'Personal', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.word.trim(),
    input.pos ?? null,
    input.ipa ?? null,
    input.definition.trim(),
    input.mongolian ?? null,
    JSON.stringify(input.example ? [input.example.trim()] : []),
    input.level ?? 'B1',
    userId,
    input.note ?? null,
    JSON.stringify(input.tags ?? []),
    nowIso(),
    nowIso(),
  );
  introduceWords(db, userId, [id], now);
  return id;
}

export function updateCustomWord(db: DB, userId: number, id: string, input: CustomWordInput): boolean {
  const info = db
    .prepare(
      `UPDATE vocabulary SET word = ?, pos = ?, ipa = ?, definition = ?, mongolian = ?, examples = ?, personal_note = ?, tags = ?, cefr_level = ?, updated_at = ?
       WHERE id = ? AND owner_user_id = ?`,
    )
    .run(
      input.word.trim(),
      input.pos ?? null,
      input.ipa ?? null,
      input.definition.trim(),
      input.mongolian ?? null,
      JSON.stringify(input.example ? [input.example.trim()] : []),
      input.note ?? null,
      JSON.stringify(input.tags ?? []),
      input.level ?? 'B1',
      nowIso(),
      id,
      userId,
    );
  return info.changes > 0;
}

export function deleteCustomWord(db: DB, userId: number, id: string): boolean {
  return db.prepare('DELETE FROM vocabulary WHERE id = ? AND owner_user_id = ?').run(id, userId).changes > 0;
}

/** Words the learner has met, most recently practised first (used by games and challenges). */
export function learnedWordIds(db: DB, userId: number, limit = 200): string[] {
  return db
    .prepare(`SELECT vocab_id FROM user_vocab WHERE user_id = ? AND state != 'NEW' ORDER BY last_reviewed_at DESC LIMIT ?`)
    .pluck()
    .all(userId, limit) as string[];
}
