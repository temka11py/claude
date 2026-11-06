import { describe, expect, it } from 'vitest';
import {
  applyReview,
  deriveState,
  introduceCard,
  isDue,
  isMastered,
  newCard,
  reviewCutoff,
  weakestDimension,
  type CardState,
} from '@shared/srs';

const DAY = 86400000;
const t0 = new Date('2026-03-02T09:00:00');
const days = (card: CardState) => card.intervalDays;
const later = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

describe('spaced repetition', () => {
  it('introduces a new word with a same-day review', () => {
    const c = introduceCard(newCard(), t0);
    expect(c.state).toBe('LEARNING');
    expect(new Date(c.dueAt!).getTime() - t0.getTime()).toBe(10 * 60 * 1000);
    expect(c.exposureCount).toBe(1);
  });

  it('follows the ladder same-day → 2 → 7 → 14 → 30 days for consistent "good" answers', () => {
    let c = introduceCard(newCard(), t0);
    let now = t0;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      c = applyReview(c, 'good', now, { dimension: 'recall' });
      intervals.push(days(c));
      now = new Date(c.dueAt!);
    }
    expect(intervals.slice(0, 4)).toEqual([2, 7, 14, 30]);
    // After the ladder, intervals grow with ease.
    expect(intervals[4]).toBeGreaterThan(60);
  });

  it('sends a forgotten word back to the start and counts a lapse', () => {
    let c = introduceCard(newCard(), t0);
    c = applyReview(c, 'good', t0);
    c = applyReview(c, 'good', later(t0, 2));
    expect(c.state).toBe('FAMILIAR');
    const easeBefore = c.ease;
    c = applyReview(c, 'again', later(t0, 9));
    expect(c.state).toBe('REVIEW');
    expect(c.lapses).toBe(1);
    expect(c.intervalDays).toBe(0);
    expect(c.ease).toBeLessThan(easeBefore);
  });

  it('reviews repeatedly failed words more often (leech)', () => {
    let healthy = introduceCard(newCard(), t0);
    let leech = introduceCard(newCard(), t0);
    for (let i = 0; i < 3; i++) {
      leech = applyReview(leech, 'good', t0);
      leech = applyReview(leech, 'good', t0);
      leech = applyReview(leech, 'again', t0);
    }
    expect(leech.lapses).toBe(3);
    healthy = applyReview(healthy, 'good', t0);
    leech = applyReview(leech, 'good', t0);
    expect(leech.intervalDays).toBeLessThanOrEqual(healthy.intervalDays);
  });

  it('"easy" skips a rung and "hard" grows the interval slowly', () => {
    const c = introduceCard(newCard(), t0);
    expect(applyReview(c, 'easy', t0).intervalDays).toBeGreaterThanOrEqual(7);
    const g = applyReview(applyReview(c, 'good', t0), 'hard', later(t0, 2));
    expect(g.intervalDays).toBeLessThanOrEqual(3);
  });

  it('does not call a word mastered after a single correct answer', () => {
    let c = introduceCard(newCard(), t0);
    c = applyReview(c, 'easy', t0);
    expect(isMastered(c)).toBe(false);
    expect(c.state).not.toBe('MASTERED');
  });

  it('masters a word only after spaced success in every dimension', () => {
    let c = introduceCard(newCard(), t0);
    let now = t0;
    const dims = ['recognition', 'recall', 'context', 'production', 'recall', 'context', 'production', 'recognition'] as const;
    for (const dim of dims) {
      c = applyReview(c, 'good', now, { dimension: dim, intervalModifier: 1 });
      now = new Date(c.dueAt!);
    }
    expect(c.retentionChecks).toBeGreaterThanOrEqual(1);
    expect(c.state).toBe('MASTERED');
    expect(c.firstLearnedAt).not.toBeNull();
  });

  it('targets the weakest dimension, but not production before recognition', () => {
    const c = { ...newCard(), recognition: 0.2, recall: 0.5, context: 0.4, production: 0 };
    expect(weakestDimension(c)).toBe('recognition');
    const d = { ...newCard(), recognition: 0.9, recall: 0.8, context: 0.7, production: 0.1 };
    expect(weakestDimension(d)).toBe('production');
  });

  it('includes tomorrow\'s cards for every-other-day learners', () => {
    const card = { ...introduceCard(newCard(), t0), dueAt: later(t0, 1).toISOString() };
    expect(isDue(card, reviewCutoff(t0, 'daily'))).toBe(false);
    expect(isDue(card, reviewCutoff(t0, 'alternate'))).toBe(true);
  });

  it('never marks NEW cards as due', () => {
    expect(isDue(newCard(), reviewCutoff(t0, 'daily'))).toBe(false);
    expect(deriveState(newCard())).toBe('NEW');
  });
});
