// Study streaks that respect the learner's schedule and never feel punishing.
//
// - Daily learners keep the streak if they study on consecutive days.
// - Every-other-day learners keep it as long as the gap is at most 2 days.
// - Streak freezes (earned every 7 study days, max 2 held) cover short gaps
//   automatically.
// - Missing days only resets the *streak counter*. Progress, XP, words and
//   lessons are never touched.

import type { StudySchedule } from './srs';

export interface StreakState {
  current: number;
  longest: number;
  /** YYYY-MM-DD of the last study day. */
  lastStudyDate: string | null;
  freezes: number;
  freezesUsed: number;
}

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;

export function emptyStreak(): StreakState {
  return { current: 0, longest: 0, lastStudyDate: null, freezes: 0, freezesUsed: 0 };
}

/** Local calendar date YYYY-MM-DD. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysBetween(fromKey: string, toKey: string): number {
  const [y1, m1, d1] = fromKey.split('-').map(Number);
  const [y2, m2, d2] = toKey.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

export function allowedGap(schedule: StudySchedule): number {
  return schedule === 'alternate' ? 2 : 1;
}

/** Number of scheduled study days that were missed in a gap. */
export function missedStudyDays(gapDays: number, schedule: StudySchedule): number {
  const allowed = allowedGap(schedule);
  if (gapDays <= allowed) return 0;
  return Math.ceil((gapDays - allowed) / allowed);
}

export interface StreakUpdate {
  state: StreakState;
  /** Freezes consumed to bridge a gap. */
  freezesConsumed: number;
  /** True if a freeze was earned today. */
  freezeEarned: boolean;
  /** True if the streak counter restarted. */
  restarted: boolean;
}

/** Record that the learner studied on `dateKey`. Idempotent for the same day. */
export function recordStudyDay(state: StreakState, dateKey: string, schedule: StudySchedule): StreakUpdate {
  if (state.lastStudyDate === dateKey) {
    return { state, freezesConsumed: 0, freezeEarned: false, restarted: false };
  }
  const next: StreakState = { ...state };
  let freezesConsumed = 0;
  let restarted = false;

  if (!state.lastStudyDate) {
    next.current = 1;
  } else {
    const gap = daysBetween(state.lastStudyDate, dateKey);
    if (gap <= 0) {
      // Clock moved backwards; treat as same day.
      return { state, freezesConsumed: 0, freezeEarned: false, restarted: false };
    }
    const missed = missedStudyDays(gap, schedule);
    if (missed === 0) {
      next.current = state.current + 1;
    } else if (missed <= state.freezes) {
      freezesConsumed = missed;
      next.freezes = state.freezes - missed;
      next.freezesUsed = state.freezesUsed + missed;
      next.current = state.current + 1;
    } else {
      next.current = 1;
      restarted = true;
    }
  }

  next.lastStudyDate = dateKey;
  next.longest = Math.max(next.longest, next.current);
  let freezeEarned = false;
  if (next.current > 0 && next.current % FREEZE_EVERY === 0 && next.freezes < MAX_FREEZES) {
    next.freezes += 1;
    freezeEarned = true;
  }
  return { state: next, freezesConsumed, freezeEarned, restarted };
}

export type StreakStatus = 'active' | 'at_risk' | 'protected' | 'broken' | 'none';

/**
 * Status as seen today, before studying: "at_risk" means today (or the next
 * scheduled day) is the last day to keep it; "protected" means a freeze will
 * cover the gap.
 */
export function streakStatus(state: StreakState, todayKey: string, schedule: StudySchedule): StreakStatus {
  if (!state.lastStudyDate || state.current === 0) return 'none';
  const gap = daysBetween(state.lastStudyDate, todayKey);
  if (gap <= 0) return 'active';
  const allowed = allowedGap(schedule);
  if (gap < allowed) return 'active';
  if (gap === allowed) return 'at_risk';
  const missed = missedStudyDays(gap, schedule);
  return missed <= state.freezes ? 'protected' : 'broken';
}

/** Days since the learner last studied (0 = studied today). */
export function daysAway(state: StreakState, todayKey: string): number | null {
  return state.lastStudyDate ? daysBetween(state.lastStudyDate, todayKey) : null;
}
