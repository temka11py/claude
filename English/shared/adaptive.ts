// Adaptive learning rules: difficulty adjustment, weak-skill detection and the
// weekly focus plan that adds extra activities for weak skills.

import type { CoreSkill } from './cefr';
import { CORE_SKILLS } from './cefr';

export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

export type DifficultyAction = 'increase' | 'maintain' | 'extra_practice' | 'review_prerequisites';

/**
 * Difficulty rule from a result (percent 0–1):
 *   90%+    → increase difficulty (by one step only — never a sudden jump)
 *   70–89%  → maintain
 *   50–69%  → maintain and add extra practice
 *   < 50%   → step down and review prerequisite concepts
 */
export function difficultyDecision(current: number, percent: number): { next: number; action: DifficultyAction } {
  if (percent >= 0.9) return { next: Math.min(MAX_DIFFICULTY, current + 1), action: 'increase' };
  if (percent >= 0.7) return { next: current, action: 'maintain' };
  if (percent >= 0.5) return { next: current, action: 'extra_practice' };
  return { next: Math.max(MIN_DIFFICULTY, current - 1), action: 'review_prerequisites' };
}

export interface SkillStat {
  skill: CoreSkill;
  /** Rolling accuracy 0–1 (null when there is not enough data). */
  accuracy: number | null;
  /** Number of recent responses behind the accuracy. */
  responses: number;
  /** CEFR estimate on the numeric scale. */
  estimate: number;
}

export const MIN_RESPONSES_FOR_ACCURACY = 8;
export const WEAK_ACCURACY = 0.65;

/** Rolling accuracy update (exponential moving average). */
export function updateAccuracy(current: number | null, correctShare: number, weight = 0.15): number {
  if (current === null) return correctShare;
  return current + weight * (correctShare - current);
}

/**
 * Skills that need attention, weakest first. A skill is weak if its accuracy
 * is below 65% (with enough data) or its CEFR estimate trails the learner's
 * average by half a band or more.
 */
export function weakSkills(stats: SkillStat[]): CoreSkill[] {
  const avg = stats.reduce((a, s) => a + s.estimate, 0) / Math.max(1, stats.length);
  const scored = stats
    .map((s) => {
      const accGap = s.accuracy !== null && s.responses >= MIN_RESPONSES_FOR_ACCURACY ? WEAK_ACCURACY - s.accuracy : -1;
      const levelGap = avg - s.estimate - 0.45;
      return { skill: s.skill, severity: Math.max(accGap * 2, levelGap) };
    })
    .filter((s) => s.severity > 0)
    .sort((a, b) => b.severity - a.severity);
  return scored.map((s) => s.skill);
}

export function strongSkills(stats: SkillStat[]): CoreSkill[] {
  const avg = stats.reduce((a, s) => a + s.estimate, 0) / Math.max(1, stats.length);
  return stats
    .filter((s) => (s.accuracy !== null && s.responses >= MIN_RESPONSES_FOR_ACCURACY && s.accuracy >= 0.85) || s.estimate - avg >= 0.4)
    .map((s) => s.skill);
}

export interface WeeklyFocus {
  /** Extra activities to add over the week, per skill. */
  extra: Partial<Record<CoreSkill, number>>;
  /** Skills that get lighter practice because they are strong. */
  lighter: CoreSkill[];
  messages: string[];
}

const SKILL_NAMES: Record<CoreSkill, string> = {
  grammar: 'grammar',
  vocabulary: 'vocabulary',
  reading: 'reading',
  listening: 'listening',
  speaking: 'speaking',
  writing: 'writing',
};

/** Build next week's focus plan from skill statistics. */
export function buildWeeklyFocus(stats: SkillStat[]): WeeklyFocus {
  const bySkill = Object.fromEntries(stats.map((s) => [s.skill, s])) as Record<CoreSkill, SkillStat>;
  const weak = weakSkills(stats).slice(0, 2);
  const strong = strongSkills(stats).filter((s) => !weak.includes(s));
  const extra: Partial<Record<CoreSkill, number>> = {};
  const messages: string[] = [];

  const acc = (s: CoreSkill) => bySkill[s]?.accuracy ?? null;
  const readingAcc = acc('reading');
  const listeningAcc = acc('listening');
  if (readingAcc !== null && listeningAcc !== null && readingAcc - listeningAcc >= 0.1 && !weak.includes('listening')) {
    weak.unshift('listening');
  }

  for (const skill of weak.slice(0, 2)) {
    const n = 2;
    extra[skill] = n;
    const a = acc(skill);
    if (skill === 'listening' && readingAcc !== null && listeningAcc !== null && readingAcc > listeningAcc) {
      messages.push(
        `You are understanding written English better than spoken English (reading ${Math.round(readingAcc * 100)}%, listening ${Math.round(listeningAcc * 100)}%). This week, ${n} additional listening activities have been added.`,
      );
    } else if (a !== null) {
      messages.push(`Your ${SKILL_NAMES[skill]} accuracy is ${Math.round(a * 100)}%. This week, ${n} extra ${SKILL_NAMES[skill]} activities have been added.`);
    } else {
      messages.push(`Your ${SKILL_NAMES[skill]} is developing more slowly than your other skills. This week, ${n} extra ${SKILL_NAMES[skill]} activities have been added.`);
    }
  }
  if (strong.includes('grammar')) {
    messages.push('Your grammar is strong, so grammar practice will be shorter this week and focus on new structures.');
  }
  return { extra, lighter: strong, messages };
}

export { CORE_SKILLS };
