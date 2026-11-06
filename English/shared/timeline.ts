// Course completion estimate. Deliberately a range, never a promised date.

import type { StudySchedule } from './srs';

export type Intensity = 'casual' | 'standard' | 'intensive';

export const INTENSITY_MINUTES: Record<Intensity, { min: number; max: number; default: number }> = {
  casual: { min: 15, max: 20, default: 20 },
  standard: { min: 25, max: 35, default: 30 },
  intensive: { min: 45, max: 60, default: 50 },
};

/**
 * Share of a session spent on *new* course material. The rest goes to spaced
 * review, mistakes, extra skills practice and games — which is what makes the
 * learning stick, but does not move the curriculum forward.
 */
export const NEW_MATERIAL_SHARE = 0.55;

export function studyDaysPerWeek(schedule: StudySchedule): number {
  return schedule === 'daily' ? 6 : 3.5; // daily learners realistically skip ~1 day a week
}

export interface TimelineInput {
  /** Estimated minutes of course content still to do (lessons + reviews + tests). */
  remainingContentMinutes: number;
  minutesPerStudyDay: number;
  schedule: StudySchedule;
  /** Actual average minutes per week over recent weeks, if known. */
  recentMinutesPerWeek?: number | null;
}

export interface TimelineEstimate {
  weeksLow: number;
  weeksHigh: number;
  monthsLow: number;
  monthsHigh: number;
  basis: 'plan' | 'recent_pace';
  label: string;
}

export function estimateTimeline(input: TimelineInput): TimelineEstimate {
  const planned = input.minutesPerStudyDay * studyDaysPerWeek(input.schedule);
  const recent = input.recentMinutesPerWeek ?? null;
  const useRecent = recent !== null && recent >= 30;
  const perWeek = Math.max(20, useRecent ? recent : planned);
  const weeks = input.remainingContentMinutes / (perWeek * NEW_MATERIAL_SHARE);
  const weeksLow = weeks * 0.85;
  const weeksHigh = weeks * 1.25;
  const monthsLow = Math.max(0, Math.round((weeksLow / 4.345) * 2) / 2);
  const monthsHigh = Math.max(monthsLow, Math.round((weeksHigh / 4.345) * 2) / 2);
  const label =
    input.remainingContentMinutes <= 0
      ? 'Course content completed'
      : monthsHigh < 1
        ? `approximately ${Math.max(1, Math.round(weeksLow))}–${Math.max(2, Math.round(weeksHigh))} weeks`
        : `approximately ${monthsLow === monthsHigh ? monthsLow : `${monthsLow}–${monthsHigh}`} months`;
  return {
    weeksLow: Math.round(weeksLow),
    weeksHigh: Math.round(weeksHigh),
    monthsLow,
    monthsHigh,
    basis: useRecent ? 'recent_pace' : 'plan',
    label,
  };
}
