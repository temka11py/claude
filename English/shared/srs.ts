// Spaced repetition for vocabulary.
//
// A hybrid of a fixed review ladder and SM-2 style ease factors:
//   - The first reviews follow the ladder: same day → 2 days → 7 → 14 → 30.
//   - After the ladder, the interval grows by the card's ease factor.
//   - "Again" sends the card back to the start of the ladder and lowers ease,
//     so words that are repeatedly forgotten come back more often.
//   - "Easy" skips a rung and raises ease, so well-known words space out faster.
// Each answer also updates the word's proficiency dimensions (recognition,
// recall, context use, production, retention), which decide when a word is
// genuinely MASTERED rather than merely answered correctly once.

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export type VocabState = 'NEW' | 'LEARNING' | 'FAMILIAR' | 'MASTERED' | 'REVIEW';
export type Dimension = 'recognition' | 'recall' | 'context' | 'production';

export const LADDER_DAYS = [0, 2, 7, 14, 30] as const;
/** "Same-day" step: the word comes back after 10 minutes. */
export const SAME_DAY_MINUTES = 10;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const DEFAULT_EASE = 2.5;
export const MAX_INTERVAL_DAYS = 365;
/** Lapses after which a word counts as a "leech" and is reviewed more often. */
export const LEECH_LAPSES = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CardState {
  state: VocabState;
  step: number;
  ease: number;
  intervalDays: number;
  dueAt: string | null;
  lapses: number;
  reviews: number;
  correctCount: number;
  incorrectCount: number;
  exposureCount: number;
  firstLearnedAt: string | null;
  lastReviewedAt: string | null;
  confidence: number;
  recognition: number;
  recall: number;
  context: number;
  production: number;
  retention: number;
  retentionChecks: number;
}

export function newCard(difficulty = 3): CardState {
  // Harder words (difficulty 4–5) start with a slightly lower ease.
  const ease = difficulty >= 4 ? 2.3 : difficulty <= 2 ? 2.6 : DEFAULT_EASE;
  return {
    state: 'NEW',
    step: 0,
    ease,
    intervalDays: 0,
    dueAt: null,
    lapses: 0,
    reviews: 0,
    correctCount: 0,
    incorrectCount: 0,
    exposureCount: 0,
    firstLearnedAt: null,
    lastReviewedAt: null,
    confidence: 0,
    recognition: 0,
    recall: 0,
    context: 0,
    production: 0,
    retention: 0,
    retentionChecks: 0,
  };
}

/** Called when a word is first taught in a lesson: it enters the same-day review step. */
export function introduceCard(card: CardState, now: Date): CardState {
  if (card.state !== 'NEW') return { ...card, exposureCount: card.exposureCount + 1 };
  return {
    ...card,
    state: 'LEARNING',
    step: 0,
    intervalDays: 0,
    dueAt: addMinutes(now, SAME_DAY_MINUTES).toISOString(),
    exposureCount: card.exposureCount + 1,
  };
}

export interface ReviewOptions {
  /** Which aspect of knowing the word this answer tested. */
  dimension?: Dimension;
  /** Scales the resulting interval; recognition tasks are easier than recall, so they grow slower. */
  intervalModifier?: number;
}

const GRADE_VALUE: Record<Grade, number> = { again: 0, hard: 0.5, good: 0.8, easy: 1 };

function ema(current: number, target: number, alpha: number): number {
  return current + alpha * (target - current);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isLeech(card: CardState): boolean {
  return card.lapses >= LEECH_LAPSES;
}

/** Apply one review answer and return the updated card. Pure function. */
export function applyReview(card: CardState, grade: Grade, now: Date, opts: ReviewOptions = {}): CardState {
  const dimension = opts.dimension ?? 'recall';
  const modifier = opts.intervalModifier ?? (dimension === 'recognition' ? 0.8 : 1);
  const wasGraduated = card.step >= 2 || card.state === 'FAMILIAR' || card.state === 'MASTERED';
  const previousInterval = card.intervalDays;
  const next: CardState = { ...card };

  next.reviews += 1;
  next.lastReviewedAt = now.toISOString();
  next.exposureCount += 1;
  next.confidence = round2(ema(card.confidence, GRADE_VALUE[grade], 0.4));

  // Proficiency dimension for the tested aspect.
  const dimTarget = grade === 'again' ? 0 : grade === 'hard' ? 0.6 : 1;
  next[dimension] = round2(ema(card[dimension], dimTarget, 0.35));
  // Recall and context success also imply recognition.
  if (grade !== 'again' && dimension !== 'recognition') {
    next.recognition = round2(ema(card.recognition, 1, 0.2));
  }

  // Retention: a success after a long gap is real evidence of long-term memory.
  if (previousInterval >= 7) {
    next.retentionChecks += 1;
    next.retention = round2(ema(card.retention, grade === 'again' ? 0 : 1, 0.5));
  }

  if (grade === 'again') {
    next.incorrectCount += 1;
    if (wasGraduated) next.lapses += 1;
    next.ease = Math.max(MIN_EASE, round2(card.ease - 0.2));
    next.step = 0;
    next.intervalDays = 0;
    next.dueAt = addMinutes(now, SAME_DAY_MINUTES).toISOString();
    next.state = wasGraduated ? 'REVIEW' : 'LEARNING';
    return next;
  }

  next.correctCount += 1;
  let interval: number;
  if (grade === 'hard') {
    next.ease = Math.max(MIN_EASE, round2(card.ease - 0.15));
    interval = previousInterval < 1 ? 1 : previousInterval * 1.2;
  } else {
    const jump = grade === 'easy' ? 2 : 1;
    next.step = card.step + jump;
    if (grade === 'easy') next.ease = Math.min(MAX_EASE, round2(card.ease + 0.15));
    if (next.step < LADDER_DAYS.length) {
      // Ladder rung, personalised slightly by ease.
      const easeFactor = Math.min(1.2, Math.max(0.7, next.ease / DEFAULT_EASE));
      interval = LADDER_DAYS[next.step] * easeFactor;
    } else {
      const base = Math.max(previousInterval, LADDER_DAYS[LADDER_DAYS.length - 1]);
      interval = base * next.ease * (grade === 'easy' ? 1.3 : 1);
    }
    if (interval > 1) interval *= modifier;
  }

  if (isLeech(next)) interval *= 0.7;
  interval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(interval)));
  next.intervalDays = interval;
  next.dueAt = new Date(now.getTime() + interval * DAY_MS).toISOString();
  next.state = deriveState(next);
  if (next.state === 'FAMILIAR' || next.state === 'MASTERED') {
    next.firstLearnedAt ??= now.toISOString();
  }
  return next;
}

/**
 * Word state from the evidence collected so far. MASTERED needs repeated,
 * spaced success across recognition, recall, context use and production.
 */
export function deriveState(card: CardState): VocabState {
  if (card.reviews === 0 && card.exposureCount === 0) return 'NEW';
  if (card.state === 'REVIEW' && card.step < 2) return 'REVIEW';
  if (isMastered(card)) return 'MASTERED';
  if (card.step >= 2) return 'FAMILIAR';
  return card.reviews === 0 && card.state === 'NEW' ? 'NEW' : 'LEARNING';
}

export function isMastered(card: CardState): boolean {
  return (
    card.intervalDays >= 21 &&
    card.correctCount >= 5 &&
    // Each threshold needs at least two successful answers of that kind.
    card.recognition >= 0.75 &&
    card.recall >= 0.55 &&
    card.context >= 0.55 &&
    card.production >= 0.5 &&
    card.retentionChecks >= 1 &&
    card.retention >= 0.6
  );
}

/** The dimension with the least evidence — review exercises target it first. */
export function weakestDimension(card: CardState): Dimension {
  const dims: Dimension[] = ['recognition', 'recall', 'context', 'production'];
  // Production is only asked once the word is at least somewhat recognised.
  const candidates = card.recognition < 0.5 ? dims.filter((d) => d !== 'production') : dims;
  return candidates.reduce((weakest, d) => (card[d] < card[weakest] ? d : weakest), candidates[0]);
}

export type StudySchedule = 'daily' | 'alternate';

/**
 * Cards due up to this moment are included in today's review. Learners who
 * study every other day also get tomorrow's cards today, because tomorrow is a
 * rest day — so nothing waits two extra days.
 */
export function reviewCutoff(now: Date, schedule: StudySchedule): Date {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return schedule === 'alternate' ? new Date(endOfToday.getTime() + DAY_MS) : endOfToday;
}

export function isDue(card: Pick<CardState, 'dueAt' | 'state'>, cutoff: Date): boolean {
  if (card.state === 'NEW' || !card.dueAt) return false;
  return new Date(card.dueAt).getTime() <= cutoff.getTime();
}

/** Priority for ordering a review queue: most overdue and most fragile first. */
export function reviewPriority(card: CardState, now: Date): number {
  const due = card.dueAt ? new Date(card.dueAt).getTime() : now.getTime();
  const overdueDays = Math.max(0, (now.getTime() - due) / DAY_MS);
  const fragility = card.state === 'REVIEW' ? 3 : card.state === 'LEARNING' ? 2 : 1;
  return overdueDays / Math.max(1, card.intervalDays) + fragility + (isLeech(card) ? 1 : 0);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/** Map an objective right/wrong answer (non-flashcard modes) to a grade. */
export function gradeFromAnswer(correct: boolean, responseMs?: number): Grade {
  if (!correct) return 'again';
  if (responseMs !== undefined && responseMs > 15000) return 'hard';
  return 'good';
}
