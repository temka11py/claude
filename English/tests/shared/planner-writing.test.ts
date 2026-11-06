import { describe, expect, it } from 'vitest';
import { planSession, type PlannerInput } from '@shared/sessionPlanner';
import { analyzeWriting, estimateWritingScore, ingForm } from '@shared/writingChecker';
import { buildExercise, exerciseFor, interleave, type VocabItem } from '@shared/vocabExercises';
import { seededRandom } from '@shared/text';

const baseInput = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  date: '2026-03-10',
  minutes: 30,
  schedule: 'daily',
  daysAway: 1,
  dueReviews: 20,
  dueMistakes: 3,
  learnedWords: 40,
  skillStats: (['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing'] as const).map((skill) => ({ skill, accuracy: 0.8, responses: 20, estimate: 2.3 })),
  weeklyExtra: {},
  lighterSkills: [],
  nextLesson: {
    id: 'b1-01-l2',
    title: 'Daily routines',
    moduleTitle: 'Everyday Life',
    currentStep: 0,
    steps: [
      { index: 0, kind: 'warmup', minutes: 2, skill: 'vocabulary' },
      { index: 1, kind: 'vocabulary', minutes: 6, skill: 'vocabulary' },
      { index: 2, kind: 'grammar', minutes: 8, skill: 'grammar' },
      { index: 3, kind: 'quiz', minutes: 4, skill: 'grammar' },
    ],
  },
  moduleTestReady: null,
  recentTypes: [],
  recentGames: [],
  available: { listening: ['l1'], reading: ['r1'], speaking: ['s1'], writing: ['w1'], dictation: true, shadowing: true, grammarReview: true },
  challengeDone: false,
  ...over,
});

describe('session planner', () => {
  it('builds a varied session that fits the time budget', () => {
    const plan = planSession(baseInput());
    const types = plan.items.map((i) => i.type);
    expect(types[0]).toBe('review');
    expect(types).toContain('lesson');
    expect(types).toContain('mistakes');
    expect(new Set(types).size).toBe(types.length);
    expect(plan.totalMinutes).toBeLessThanOrEqual(36);
    expect(plan.mode).toBe('normal');
  });

  it('creates a light recovery session after several missed days', () => {
    const plan = planSession(baseInput({ daysAway: 5, dueReviews: 120 }));
    expect(plan.mode).toBe('recovery');
    expect(plan.message).toMatch(/Welcome back/);
    const review = plan.items.find((i) => i.type === 'review')!;
    expect(review.payload.count).toBe(10);
    expect(plan.items.some((i) => i.type === 'listening' || i.type === 'dictation')).toBe(true);
    expect(plan.items.some((i) => i.type === 'speaking' || i.type === 'shadowing')).toBe(true);
  });

  it('does not treat a normal rest day as a break for every-other-day learners', () => {
    expect(planSession(baseInput({ schedule: 'alternate', daysAway: 2 })).mode).toBe('normal');
    expect(planSession(baseInput({ schedule: 'daily', daysAway: 3 })).mode).toBe('recovery');
  });

  it('adds weekly-focus activities for weak skills', () => {
    const plan = planSession(baseInput({ weeklyExtra: { listening: 2 } }));
    expect(plan.items.some((i) => i.skill === 'listening')).toBe(true);
  });

  it('avoids repeating the activity types of recent sessions', () => {
    const a = planSession(baseInput({ minutes: 45, recentTypes: ['dictation', 'shadowing'] }));
    expect(a.items.some((i) => i.type === 'dictation')).toBe(false);
  });

  it('schedules the module test when all lessons are finished', () => {
    const plan = planSession(baseInput({ nextLesson: null, moduleTestReady: { moduleId: 'b1-01', title: 'Everyday Life' } }));
    expect(plan.items.some((i) => i.type === 'module_test')).toBe(true);
  });

  it('is deterministic for the same day', () => {
    expect(planSession(baseInput())).toEqual(planSession(baseInput()));
  });
});

describe('writing checker', () => {
  it('catches common learner errors with explanations', () => {
    const a = analyzeWriting('I am agree with this idea. She have two childs. We discussed about the problem in monday. I didn\'t went there since three years.');
    const ids = a.issues.map((i) => i.ruleId);
    expect(ids).toEqual(expect.arrayContaining(['be-agree', 'third-person-s', 'discuss-about', 'day-preposition', 'did-past', 'since-period']));
    const agree = a.issues.find((i) => i.ruleId === 'be-agree')!;
    expect(agree.improvedSentence).toBe('I agree with this idea.');
    expect(agree.explanationMn).toBeTruthy();
  });

  it('does not flag correct sentences', () => {
    const a = analyzeWriting('Does she have a car? I have lived here since 2019. It depends on the weather. An hour later, a university student arrived in London.');
    expect(a.issues).toEqual([]);
  });

  it('checks register only for formal writing', () => {
    const text = "I'm gonna tell you about my job.";
    expect(analyzeWriting(text).issues.filter((i) => i.category === 'register')).toHaveLength(0);
    expect(analyzeWriting(text, { register: 'formal' }).issues.filter((i) => i.category === 'register').length).toBeGreaterThan(0);
  });

  it('reports statistics and target words', () => {
    const a = analyzeWriting('However, deadlines matter. Moreover, I met the deadline.', { targetWords: ['deadline', 'workload'], minWords: 5 });
    expect(a.targetWordsUsed).toEqual(['deadline']);
    expect(a.targetWordsMissing).toEqual(['workload']);
    expect(a.linkersUsed.map((l) => l.phrase)).toEqual(expect.arrayContaining(['however', 'moreover']));
    expect(estimateWritingScore(a)).toBeGreaterThan(0);
  });

  it('spells -ing forms', () => {
    expect(['make', 'see', 'stop', 'lie', 'visit'].map(ingForm)).toEqual(['making', 'seeing', 'stopping', 'lying', 'visiting']);
  });
});

describe('vocabulary exercises', () => {
  const item = (word: string, extra: Partial<VocabItem> = {}): VocabItem => ({
    id: `v-${word}`,
    word,
    pos: 'noun',
    ipa: null,
    definition: `definition of ${word}`,
    mongolian: `mn-${word}`,
    examples: [`We talked about the ${word} yesterday.`],
    collocations: [`meet a ${word}`],
    synonyms: [],
    antonyms: [],
    mistake: null,
    note: null,
    level: 'B1',
    difficulty: 3,
    ...extra,
  });
  const pool = ['deadline', 'career', 'salary', 'promotion', 'workload'].map((w) => item(w));

  it('builds context and choice exercises with one correct option', () => {
    const r = seededRandom(1);
    const ex = buildExercise(pool[0], 'cloze', pool, r)!;
    expect(ex.kind).toBe('choice');
    if (ex.kind === 'choice') {
      expect(ex.options[ex.answerIndex]).toBe('deadline');
      expect(ex.sentence).toContain('_____');
      expect(new Set(ex.options).size).toBe(ex.options.length);
    }
    const col = buildExercise(pool[0], 'collocation', pool, r)!;
    expect(col.kind === 'choice' && col.options[col.answerIndex]).toBe('meet');
  });

  it('falls back to a flashcard when a dimension cannot be exercised', () => {
    const bare = item('thing', { examples: ['No match here.'], collocations: [], mongolian: null });
    const ex = exerciseFor(bare, 'context', [bare], seededRandom(2));
    expect(ex.kind).toBe('flashcard');
  });

  it('interleaves modes', () => {
    const out = interleave([{ mode: 'a' }, { mode: 'a' }, { mode: 'b' }, { mode: 'a' }, { mode: 'b' }]);
    for (let i = 1; i < out.length - 1; i++) expect(out[i].mode === out[i - 1].mode && out[i].mode === out[i + 1].mode).toBe(false);
  });
});
