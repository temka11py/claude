// CEFR scale helpers. Levels are mapped onto a continuous numeric scale so that
// skill estimates can move gradually (e.g. 2.3 = "B1, 60% of the way to B1+").

export const COURSE_LEVELS = ['B1', 'B1+', 'B2', 'B2+', 'C1'] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const SKILLS = [
  'grammar',
  'vocabulary',
  'reading',
  'listening',
  'speaking',
  'writing',
  'pronunciation',
  'fluency',
  'comprehension',
] as const;
export type Skill = (typeof SKILLS)[number];

/** Skills that are directly assessed by activities. Fluency and comprehension are derived. */
export const CORE_SKILLS = ['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing'] as const;
export type CoreSkill = (typeof CORE_SKILLS)[number];

const BANDS: { label: string; value: number }[] = [
  { label: 'A1', value: 0 },
  { label: 'A2', value: 1 },
  { label: 'A2+', value: 1.5 },
  { label: 'B1', value: 2 },
  { label: 'B1+', value: 2.5 },
  { label: 'B2', value: 3 },
  { label: 'B2+', value: 3.5 },
  { label: 'C1', value: 4 },
  { label: 'C1+', value: 4.5 },
  { label: 'C2', value: 5 },
];

export const SCALE_MIN = 0;
export const SCALE_MAX = 5;

export function levelValue(label: string): number {
  const band = BANDS.find((b) => b.label === label);
  if (!band) throw new Error(`Unknown CEFR level: ${label}`);
  return band.value;
}

export function isCourseLevel(value: string): value is CourseLevel {
  return (COURSE_LEVELS as readonly string[]).includes(value);
}

export function clampScore(score: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, score));
}

/** The band a score falls in (rounded down). */
export function bandFor(score: number): { label: string; value: number } {
  const s = clampScore(score);
  let current = BANDS[0];
  for (const band of BANDS) {
    if (s + 1e-9 >= band.value) current = band;
  }
  return current;
}

export function nextBand(label: string): { label: string; value: number } | null {
  const idx = BANDS.findIndex((b) => b.label === label);
  return idx >= 0 && idx < BANDS.length - 1 ? BANDS[idx + 1] : null;
}

/**
 * Human label for a score. Scores very close to the next band are shown as
 * borderline, e.g. "A2+/B1".
 */
export function labelFor(score: number): string {
  const band = bandFor(score);
  const next = nextBand(band.label);
  if (next && next.value - clampScore(score) <= 0.1) return `${band.label}/${next.label}`;
  return band.label;
}

/** Progress (0–1) from the current band towards the next band. */
export function progressWithinBand(score: number): number {
  const band = bandFor(score);
  const next = nextBand(band.label);
  if (!next) return 1;
  return Math.min(1, Math.max(0, (clampScore(score) - band.value) / (next.value - band.value)));
}

/** The course level a learner should study given an overall score. */
export function courseLevelFor(score: number): CourseLevel {
  const s = clampScore(score);
  let level: CourseLevel = 'B1';
  for (const l of COURSE_LEVELS) {
    if (s + 1e-9 >= levelValue(l)) level = l;
  }
  return level;
}

export function courseLevelIndex(level: CourseLevel): number {
  return COURSE_LEVELS.indexOf(level);
}

export function nextCourseLevel(level: CourseLevel): CourseLevel | null {
  const i = courseLevelIndex(level);
  return i < COURSE_LEVELS.length - 1 ? COURSE_LEVELS[i + 1] : null;
}

export type EvidenceSource = 'practice' | 'lesson' | 'module_test' | 'level_exam';

const EVIDENCE_WEIGHT: Record<EvidenceSource, number> = {
  practice: 0.03,
  lesson: 0.06,
  module_test: 0.15,
  level_exam: 0.35,
};

/**
 * Update a skill estimate with evidence: the learner scored `percent` (0–1) on
 * material pitched at `materialLevel`.
 *
 * Performance implies an ability around the material's level: 70% ≈ at level,
 * 100% ≈ 0.3 above, 40% ≈ 0.3 below. Easy material answered well never pulls a
 * higher estimate down; only clearly weak performance (< 60%) lowers it.
 */
export function updateSkillEstimate(
  current: number,
  materialLevel: number,
  percent: number,
  source: EvidenceSource,
): number {
  const p = Math.min(1, Math.max(0, percent));
  const implied = clampScore(materialLevel + (p - 0.7));
  const weight = EVIDENCE_WEIGHT[source];
  if (implied > current) {
    return clampScore(current + weight * (implied - current));
  }
  if (p < 0.6) {
    return clampScore(current + weight * (implied - current));
  }
  return current;
}

export function averageScore(scores: number[]): number {
  if (scores.length === 0) return levelValue('B1');
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** Weighted overall estimate. Productive skills weigh as much as receptive ones. */
export function overallEstimate(skillScores: Partial<Record<Skill, number>>): number {
  const weights: Partial<Record<Skill, number>> = {
    grammar: 1,
    vocabulary: 1.2,
    reading: 1,
    listening: 1,
    speaking: 1,
    writing: 1,
  };
  let total = 0;
  let weightSum = 0;
  for (const [skill, weight] of Object.entries(weights) as [Skill, number][]) {
    const score = skillScores[skill];
    if (typeof score === 'number') {
      total += score * weight;
      weightSum += weight;
    }
  }
  return weightSum === 0 ? levelValue('B1') : total / weightSum;
}

/** Derived skills: fluency follows speaking + vocabulary, comprehension follows reading + listening. */
export function withDerivedSkills(skillScores: Partial<Record<Skill, number>>): Record<Skill, number> {
  const base = levelValue('B1');
  const get = (s: Skill) => skillScores[s] ?? base;
  return {
    grammar: get('grammar'),
    vocabulary: get('vocabulary'),
    reading: get('reading'),
    listening: get('listening'),
    speaking: get('speaking'),
    writing: get('writing'),
    pronunciation: skillScores.pronunciation ?? get('speaking'),
    fluency: skillScores.fluency ?? (get('speaking') * 0.6 + get('vocabulary') * 0.4),
    comprehension: skillScores.comprehension ?? (get('reading') + get('listening')) / 2,
  };
}
