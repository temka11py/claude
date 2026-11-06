// Placement test scoring: turns per-level accuracy into a CEFR estimate per skill.

import { courseLevelFor, labelFor, levelValue, overallEstimate, type CourseLevel, type Skill } from './cefr';
import type { WritingAnalysis } from './writingChecker';

export interface PlacementItemResult {
  level: string;
  /** 0–1 credit. */
  score: number;
}

const PASS = 0.6;

/**
 * Estimate ability from items tagged with CEFR levels. The learner "handles" a
 * level when they get at least 60% of its items (and lower levels on average).
 * Between the last handled level and the next one, the estimate is
 * interpolated by how close the next level's accuracy is to the pass mark.
 */
export function estimateFromItems(items: PlacementItemResult[]): number | null {
  if (items.length === 0) return null;
  const byLevel = new Map<number, number[]>();
  for (const it of items) {
    const v = levelValue(it.level);
    byLevel.set(v, [...(byLevel.get(v) ?? []), it.score]);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const acc = levels.map((v) => {
    const s = byLevel.get(v)!;
    return s.reduce((a, b) => a + b, 0) / s.length;
  });

  let k = -1;
  for (let i = 0; i < levels.length; i++) {
    const cumulative = acc.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
    if (acc[i] >= PASS && cumulative >= PASS) k = i;
  }

  if (k === -1) {
    // Below the easiest level tested.
    return Math.max(0.5, levels[0] - 0.5 * (1 - Math.min(1, acc[0] / PASS)));
  }
  if (k === levels.length - 1) {
    return levels[k] + 0.25 * Math.min(1, (acc[k] - PASS) / (1 - PASS) + 0.5);
  }
  const next = k + 1;
  const span = levels[next] - levels[k];
  const toward = acc[k] - acc[next] <= 0 ? 0.9 : Math.min(1, Math.max(0, (acc[k] - PASS) / (acc[k] - acc[next])));
  // If the next level is almost passed too, move most of the way.
  const boost = acc[next] >= PASS * 0.8 ? 0.2 : 0;
  return levels[k] + span * Math.min(0.95, toward * 0.8 + boost);
}

/**
 * Rough writing level from text statistics (used without AI). It rewards
 * accurate, varied, well-linked writing of adequate length. Always presented as
 * a rough estimate.
 */
export function estimateWritingLevel(a: WritingAnalysis, minWords = 80): number {
  let score = 1.5;
  const linkerLevels = a.linkersUsed.map((l) => l.level);
  if (linkerLevels.includes('C1')) score += 0.8;
  else if (linkerLevels.includes('B2')) score += 0.55;
  else if (linkerLevels.includes('B1+')) score += 0.35;
  else if (linkerLevels.length) score += 0.15;
  if (a.linkersUsed.length >= 4) score += 0.15;
  if (a.lexicalVariety >= 0.72) score += 0.45;
  else if (a.lexicalVariety >= 0.62) score += 0.25;
  if (a.averageSentenceLength >= 15) score += 0.35;
  else if (a.averageSentenceLength >= 11) score += 0.2;
  const errorsPer100 = a.wordCount ? (a.issues.filter((i) => i.category !== 'register').length / a.wordCount) * 100 : 10;
  if (errorsPer100 > 6) score -= 0.5;
  else if (errorsPer100 > 3) score -= 0.25;
  else if (a.wordCount >= 60) score += 0.2;
  if (a.wordCount < minWords * 0.6) score -= 0.5;
  return Math.min(4.5, Math.max(1, score));
}

export interface PlacementSummary {
  skills: Partial<Record<Skill, number>>;
  labels: Partial<Record<Skill, string>>;
  /** Skills that were not tested and are provisional estimates. */
  provisional: Skill[];
  overall: number;
  overallLabel: string;
  startLevel: CourseLevel;
  notes: string[];
}

export function summarizePlacement(scores: Partial<Record<Skill, number | null>>): PlacementSummary {
  const skills: Partial<Record<Skill, number>> = {};
  const provisional: Skill[] = [];
  for (const [s, v] of Object.entries(scores) as [Skill, number | null][]) {
    if (typeof v === 'number') skills[s] = Math.round(v * 100) / 100;
  }
  const tested = Object.values(skills);
  const avg = tested.length ? tested.reduce((a, b) => a + b, 0) / tested.length : levelValue('B1');
  for (const s of ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'] as Skill[]) {
    if (skills[s] === undefined) {
      // Untested productive skills are usually a little behind receptive ones.
      skills[s] = Math.round((avg - 0.25) * 100) / 100;
      provisional.push(s);
    }
  }
  const overall = overallEstimate(skills);
  const labels: Partial<Record<Skill, string>> = {};
  for (const [s, v] of Object.entries(skills) as [Skill, number][]) labels[s] = labelFor(v);

  const notes: string[] = [];
  const g = skills.grammar ?? overall;
  const v = skills.vocabulary ?? overall;
  if (g - v >= 0.4) notes.push('Your grammar is ahead of your vocabulary. The course will give vocabulary extra review time.');
  if (v - g >= 0.4) notes.push('Your vocabulary is ahead of your grammar. Grammar lessons will get a little extra practice.');
  const r = skills.reading ?? overall;
  const l = skills.listening ?? overall;
  if (r - l >= 0.4) notes.push('You understand written English better than spoken English. Extra listening will be added.');
  if (overall < levelValue('B1')) {
    notes.push('Some B1 material may feel challenging at first. Lessons include Mongolian support and extra review to help.');
  }
  if (provisional.length) notes.push(`Not tested yet: ${provisional.join(', ')}. These estimates will update as you complete activities.`);

  return {
    skills,
    labels,
    provisional,
    overall: Math.round(overall * 100) / 100,
    overallLabel: labelFor(overall),
    startLevel: courseLevelFor(overall),
    notes,
  };
}
