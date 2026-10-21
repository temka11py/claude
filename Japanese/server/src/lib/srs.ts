// Spaced repetition scheduler (SM-2 variant with short learning steps).

export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type ReviewState = 'new' | 'learning' | 'review' | 'mastered';

export interface SrsCard {
  state: string;
  step: number;
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
}

export interface SrsResult extends SrsCard {
  state: ReviewState;
  dueAt: Date;
}

const MINUTE = 60_000;
const DAY = 86_400_000;
/** Learning steps in minutes: a card graduates after passing the last step. */
export const LEARNING_STEPS = [1, 10];
export const GRADUATING_INTERVAL = 1;
export const EASY_INTERVAL = 4;
export const MASTERED_INTERVAL = 21;
const MIN_EASE = 1.3;

function reviewState(intervalDays: number): ReviewState {
  return intervalDays >= MASTERED_INTERVAL ? 'mastered' : 'review';
}

export function schedule(card: SrsCard, rating: Rating, now = new Date()): SrsResult {
  const reps = card.reps + 1;
  let { ease, lapses, step } = card;
  const inLearning = card.state === 'new' || card.state === 'learning';

  if (inLearning) {
    switch (rating) {
      case 'again':
        return { ...card, reps, state: 'learning', step: 0, dueAt: new Date(now.getTime() + LEARNING_STEPS[0] * MINUTE) };
      case 'hard':
        return { ...card, reps, state: 'learning', step, dueAt: new Date(now.getTime() + 5 * MINUTE) };
      case 'good': {
        const nextStep = step + 1;
        if (nextStep < LEARNING_STEPS.length) {
          return { ...card, reps, state: 'learning', step: nextStep, dueAt: new Date(now.getTime() + LEARNING_STEPS[nextStep] * MINUTE) };
        }
        const interval = card.lapses > 0 ? Math.max(1, card.intervalDays) : GRADUATING_INTERVAL;
        return { ...card, reps, state: reviewState(interval), step: 0, intervalDays: interval, dueAt: new Date(now.getTime() + interval * DAY) };
      }
      case 'easy':
        return { ...card, reps, state: reviewState(EASY_INTERVAL), step: 0, intervalDays: EASY_INTERVAL, dueAt: new Date(now.getTime() + EASY_INTERVAL * DAY) };
    }
  }

  // Review / mastered cards
  let interval = Math.max(1, card.intervalDays);
  switch (rating) {
    case 'again':
      lapses += 1;
      ease = Math.max(MIN_EASE, ease - 0.2);
      interval = Math.max(1, Math.round(interval * 0.5));
      return { ...card, reps, lapses, ease, step: 0, intervalDays: interval, state: 'learning', dueAt: new Date(now.getTime() + LEARNING_STEPS[1] * MINUTE) };
    case 'hard':
      ease = Math.max(MIN_EASE, ease - 0.15);
      interval = Math.max(interval + 1, Math.round(interval * 1.2));
      break;
    case 'good':
      interval = Math.max(interval + 1, Math.round(interval * ease));
      break;
    case 'easy':
      ease = ease + 0.15;
      interval = Math.max(interval + 2, Math.round(interval * ease * 1.3));
      break;
  }
  return { ...card, reps, lapses, ease, step: 0, intervalDays: interval, state: reviewState(interval), dueAt: new Date(now.getTime() + interval * DAY) };
}

/** Human-readable preview of the next interval for each rating (shown on buttons). */
export function previewIntervals(card: SrsCard, now = new Date()): Record<Rating, number> {
  const ratings: Rating[] = ['again', 'hard', 'good', 'easy'];
  return Object.fromEntries(
    ratings.map((r) => [r, schedule(card, r, now).dueAt.getTime() - now.getTime()]),
  ) as Record<Rating, number>;
}
