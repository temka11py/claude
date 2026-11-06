// "My Mistakes" notebook: repeated errors are collected automatically and
// scheduled for review (2 → 7 → 14 days) until corrected three times in a row.

import type { DB } from '../db';
import { reviewCutoff, type StudySchedule } from '@shared/srs';
import { normalizeAnswer, levenshtein, seededRandom, shuffle } from '@shared/text';

const DAY = 86400000;
export const ERROR_REVIEW_DAYS = [2, 7, 14];
export const REVIEWS_TO_RESOLVE = 3;

export interface ErrorInput {
  category: string;
  key: string;
  wrong: string;
  correct: string;
  explanation?: string | null;
  explanationMn?: string | null;
  source: string;
  sourceRef?: string | null;
}

export function upsertError(db: DB, userId: number, e: ErrorInput, now: Date): void {
  const next = new Date(now.getTime() + ERROR_REVIEW_DAYS[0] * DAY).toISOString();
  db.prepare(
    `INSERT INTO user_errors (user_id, category, pattern_key, wrong, correct, explanation, explanation_mn, source, source_ref, occurrences, next_review_at, first_seen_at, last_seen_at)
     VALUES (@user_id, @category, @key, @wrong, @correct, @explanation, @explanation_mn, @source, @source_ref, 1, @next, @now, @now)
     ON CONFLICT(user_id, pattern_key) DO UPDATE SET
       occurrences = occurrences + 1, wrong = excluded.wrong, correct = excluded.correct,
       explanation = COALESCE(excluded.explanation, explanation), explanation_mn = COALESCE(excluded.explanation_mn, explanation_mn),
       last_seen_at = excluded.last_seen_at, resolved_at = NULL, correct_reviews = 0, review_step = 0,
       next_review_at = excluded.next_review_at`,
  ).run({
    user_id: userId,
    category: e.category,
    key: e.key,
    wrong: e.wrong.slice(0, 500),
    correct: e.correct.slice(0, 500),
    explanation: e.explanation ?? null,
    explanation_mn: e.explanationMn ?? null,
    source: e.source,
    source_ref: e.sourceRef ?? null,
    next,
    now: now.toISOString(),
  });
}

export interface ErrorRow {
  id: number;
  category: string;
  wrong: string;
  correct: string;
  explanation: string | null;
  explanationMn: string | null;
  source: string;
  occurrences: number;
  reviewStep: number;
  correctReviews: number;
  nextReviewAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

const SELECT = `SELECT id, category, wrong, correct, explanation, explanation_mn AS explanationMn, source, occurrences,
  review_step AS reviewStep, correct_reviews AS correctReviews, next_review_at AS nextReviewAt,
  first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt, resolved_at AS resolvedAt FROM user_errors`;

export function listErrors(db: DB, userId: number, opts: { category?: string; status?: 'open' | 'resolved' | 'all' } = {}): ErrorRow[] {
  const where = ['user_id = ?'];
  const params: unknown[] = [userId];
  if (opts.category) {
    where.push('category = ?');
    params.push(opts.category);
  }
  if (opts.status === 'open' || !opts.status) where.push('resolved_at IS NULL');
  if (opts.status === 'resolved') where.push('resolved_at IS NOT NULL');
  return db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY occurrences DESC, last_seen_at DESC LIMIT 500`).all(...params) as ErrorRow[];
}

export function dueErrors(db: DB, userId: number, now: Date, schedule: StudySchedule, limit = 20): ErrorRow[] {
  return db
    .prepare(`${SELECT} WHERE user_id = ? AND resolved_at IS NULL AND next_review_at <= ? ORDER BY occurrences DESC, next_review_at LIMIT ?`)
    .all(userId, reviewCutoff(now, schedule).toISOString(), limit) as ErrorRow[];
}

export function dueErrorCount(db: DB, userId: number, now: Date, schedule: StudySchedule): number {
  return db
    .prepare('SELECT COUNT(*) FROM user_errors WHERE user_id = ? AND resolved_at IS NULL AND next_review_at <= ?')
    .pluck()
    .get(userId, reviewCutoff(now, schedule).toISOString()) as number;
}

/** Exercise for reviewing a mistake: type the correct version, or choose it for longer sentences. */
export function errorExercise(e: ErrorRow) {
  const words = e.correct.split(/\s+/).length;
  if (words <= 14 && e.wrong !== '—') {
    return { id: e.id, kind: 'typed' as const, prompt: 'Correct this sentence.', wrong: e.wrong, answer: e.correct, explanation: e.explanation, explanationMn: e.explanationMn, category: e.category, occurrences: e.occurrences };
  }
  const options = shuffle([e.correct, e.wrong === '—' ? `${e.correct.split(' ').slice(0, -1).join(' ')} …` : e.wrong], seededRandom(e.id));
  return {
    id: e.id,
    kind: 'choice' as const,
    prompt: 'Which version is correct?',
    options,
    answerIndex: options.indexOf(e.correct),
    answer: e.correct,
    explanation: e.explanation,
    explanationMn: e.explanationMn,
    category: e.category,
    occurrences: e.occurrences,
  };
}

/** Check a typed correction leniently (case, punctuation, contractions; one small slip allowed). */
export function checkCorrection(given: string, correct: string): { correct: boolean; almost: boolean } {
  const g = normalizeAnswer(given);
  const c = normalizeAnswer(correct);
  if (g === c) return { correct: true, almost: false };
  const d = levenshtein(g, c);
  return { correct: false, almost: d <= Math.max(1, Math.floor(c.length / 25)) };
}

export function reviewError(db: DB, userId: number, id: number, correct: boolean, now: Date): { resolved: boolean; nextReviewAt: string | null } {
  const row = db.prepare('SELECT review_step, correct_reviews FROM user_errors WHERE id = ? AND user_id = ?').get(id, userId) as
    | { review_step: number; correct_reviews: number }
    | undefined;
  if (!row) return { resolved: false, nextReviewAt: null };
  if (!correct) {
    const next = new Date(now.getTime() + DAY).toISOString();
    db.prepare('UPDATE user_errors SET correct_reviews = 0, review_step = 0, next_review_at = ? WHERE id = ?').run(next, id);
    return { resolved: false, nextReviewAt: next };
  }
  const reviews = row.correct_reviews + 1;
  if (reviews >= REVIEWS_TO_RESOLVE) {
    db.prepare('UPDATE user_errors SET correct_reviews = ?, resolved_at = ? WHERE id = ?').run(reviews, now.toISOString(), id);
    return { resolved: true, nextReviewAt: null };
  }
  const step = Math.min(ERROR_REVIEW_DAYS.length - 1, row.review_step + 1);
  const next = new Date(now.getTime() + ERROR_REVIEW_DAYS[step] * DAY).toISOString();
  db.prepare('UPDATE user_errors SET correct_reviews = ?, review_step = ?, next_review_at = ? WHERE id = ?').run(reviews, step, next, id);
  return { resolved: false, nextReviewAt: next };
}

export function errorStats(db: DB, userId: number) {
  const byCategory = db
    .prepare(`SELECT category, COUNT(*) AS count, SUM(occurrences) AS occurrences FROM user_errors WHERE user_id = ? AND resolved_at IS NULL GROUP BY category ORDER BY occurrences DESC`)
    .all(userId) as { category: string; count: number; occurrences: number }[];
  const resolved = db.prepare('SELECT COUNT(*) FROM user_errors WHERE user_id = ? AND resolved_at IS NOT NULL').pluck().get(userId) as number;
  return { byCategory, resolved };
}
