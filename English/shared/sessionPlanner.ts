// The daily session generator. Given the learner's state it decides what to
// study today so the learner never has to ask "what should I do now?".

import type { CoreSkill } from './cefr';
import type { SkillStat } from './adaptive';
import { weakSkills } from './adaptive';
import type { StudySchedule } from './srs';
import { seededRandom, shuffle } from './text';

export type SessionItemType =
  | 'review'
  | 'lesson'
  | 'mistakes'
  | 'listening'
  | 'dictation'
  | 'shadowing'
  | 'speaking'
  | 'reading'
  | 'writing'
  | 'grammar_review'
  | 'game'
  | 'challenge'
  | 'module_test';

export interface PlannedItem {
  type: SessionItemType;
  title: string;
  minutes: number;
  skill: CoreSkill | 'mixed';
  reason: string;
  payload: Record<string, unknown>;
}

export interface LessonStepInfo {
  index: number;
  kind: string;
  minutes: number;
  skill: string;
}

export interface PlannerInput {
  /** YYYY-MM-DD; also seeds the variety choices so a day's plan is stable. */
  date: string;
  minutes: number;
  schedule: StudySchedule;
  /** Days since the learner last studied (null = never). */
  daysAway: number | null;
  dueReviews: number;
  dueMistakes: number;
  learnedWords: number;
  skillStats: SkillStat[];
  /** Remaining extra activities this week from the adaptive focus plan. */
  weeklyExtra: Partial<Record<CoreSkill, number>>;
  lighterSkills: CoreSkill[];
  nextLesson: { id: string; title: string; moduleTitle: string; currentStep: number; steps: LessonStepInfo[] } | null;
  moduleTestReady: { moduleId: string; title: string } | null;
  /** Item types used in the last two sessions (for variety). */
  recentTypes: SessionItemType[];
  recentGames: string[];
  available: {
    listening: string[];
    reading: string[];
    speaking: string[];
    writing: string[];
    dictation: boolean;
    shadowing: boolean;
    grammarReview: boolean;
  };
  challengeDone: boolean;
}

export interface SessionPlan {
  mode: 'first' | 'normal' | 'recovery';
  message: string;
  items: PlannedItem[];
  totalMinutes: number;
}

export const GAMES = [
  { id: 'word-match', title: 'Word Match', skill: 'vocabulary' as const },
  { id: 'memory', title: 'Word Memory Cards', skill: 'vocabulary' as const },
  { id: 'speed', title: '60-second Challenge', skill: 'vocabulary' as const },
  { id: 'collocation', title: 'Collocation Puzzle', skill: 'vocabulary' as const },
  { id: 'synonym-battle', title: 'Synonym Battle', skill: 'vocabulary' as const },
  { id: 'missing-word', title: 'Missing Word', skill: 'vocabulary' as const },
  { id: 'word-builder', title: 'Word Builder', skill: 'vocabulary' as const },
  { id: 'sentence-builder', title: 'Sentence Builder', skill: 'grammar' as const },
  { id: 'grammar-duel', title: 'Grammar Duel', skill: 'grammar' as const },
  { id: 'listening-detective', title: 'Listening Detective', skill: 'listening' as const },
  { id: 'vocab-race', title: 'Vocabulary Race', skill: 'vocabulary' as const },
  { id: 'boss', title: 'Daily Boss Battle', skill: 'mixed' as const },
];

const MIN_ITEM_MINUTES = 3;

function reviewItem(count: number, reason: string): PlannedItem {
  return {
    type: 'review',
    title: `Vocabulary review — ${count} words`,
    minutes: Math.max(2, Math.round(count * 0.35)),
    skill: 'vocabulary',
    reason,
    payload: { count },
  };
}

function lessonItem(lesson: NonNullable<PlannerInput['nextLesson']>, budget: number): PlannedItem | null {
  const remaining = lesson.steps.filter((s) => s.index >= lesson.currentStep);
  if (remaining.length === 0) return null;
  let minutes = 0;
  let toStep = lesson.currentStep;
  for (const step of remaining) {
    if (minutes > 0 && minutes + step.minutes > budget) break;
    minutes += step.minutes;
    toStep = step.index;
  }
  const finishes = toStep === remaining[remaining.length - 1].index;
  const started = lesson.currentStep > 0;
  return {
    type: 'lesson',
    title: `${started ? 'Continue' : 'Start'}: ${lesson.title}`,
    minutes: Math.max(MIN_ITEM_MINUTES, Math.round(minutes)),
    skill: 'mixed',
    reason: finishes ? `${lesson.moduleTitle} — you will finish this lesson.` : `${lesson.moduleTitle} — next part of the lesson.`,
    payload: { lessonId: lesson.id, fromStep: lesson.currentStep, toStep },
  };
}

function skillActivity(skill: CoreSkill, input: PlannerInput, random: () => number, reason: string): PlannedItem | null {
  const pick = (ids: string[]) => (ids.length ? ids[Math.floor(random() * ids.length)] : null);
  switch (skill) {
    case 'listening': {
      const id = pick(input.available.listening);
      if (id && !input.recentTypes.includes('listening')) {
        return { type: 'listening', title: 'Extra listening', minutes: 6, skill, reason, payload: { materialId: id } };
      }
      if (input.available.dictation) return { type: 'dictation', title: 'Dictation — 5 sentences', minutes: 5, skill, reason, payload: { count: 5 } };
      return id ? { type: 'listening', title: 'Extra listening', minutes: 6, skill, reason, payload: { materialId: id } } : null;
    }
    case 'speaking': {
      const id = pick(input.available.speaking);
      if (id && !input.recentTypes.includes('speaking')) {
        return { type: 'speaking', title: 'Speaking practice', minutes: 5, skill, reason, payload: { taskId: id } };
      }
      if (input.available.shadowing) return { type: 'shadowing', title: 'Shadowing — 4 sentences', minutes: 4, skill, reason, payload: { count: 4 } };
      return id ? { type: 'speaking', title: 'Speaking practice', minutes: 5, skill, reason, payload: { taskId: id } } : null;
    }
    case 'reading': {
      const id = pick(input.available.reading);
      return id ? { type: 'reading', title: 'Extra reading', minutes: 7, skill, reason, payload: { materialId: id } } : null;
    }
    case 'writing': {
      const id = pick(input.available.writing);
      return id ? { type: 'writing', title: 'Writing practice', minutes: 8, skill, reason, payload: { taskId: id } } : null;
    }
    case 'grammar':
      return input.available.grammarReview
        ? { type: 'grammar_review', title: 'Grammar review — 8 questions', minutes: 4, skill, reason, payload: { count: 8 } }
        : null;
    case 'vocabulary':
      return input.learnedWords >= 8 ? gameItem(input, random, reason, 'vocabulary') : null;
  }
}

function gameItem(input: PlannerInput, random: () => number, reason: string, skill?: 'vocabulary' | 'grammar'): PlannedItem | null {
  if (input.learnedWords < 8) return null;
  const candidates = GAMES.filter((g) => g.id !== 'boss' && (!skill || g.skill === skill) && !input.recentGames.includes(g.id));
  const pool = candidates.length ? candidates : GAMES.filter((g) => g.id !== 'boss');
  const game = shuffle(pool, random)[0];
  return { type: 'game', title: game.title, minutes: 4, skill: game.skill === 'mixed' ? 'mixed' : game.skill, reason, payload: { game: game.id } };
}

export function planSession(input: PlannerInput): SessionPlan {
  const random = seededRandom(input.date);
  const items: PlannedItem[] = [];
  let budget = input.minutes;
  const add = (item: PlannedItem | null) => {
    if (!item) return false;
    items.push(item);
    budget -= item.minutes;
    return true;
  };

  const recoveryThreshold = input.schedule === 'alternate' ? 4 : 3;
  const weak = weakSkills(input.skillStats);

  // ---- Recovery session after a break: short, confidence-building, then back on track.
  if (input.daysAway !== null && input.daysAway >= recoveryThreshold) {
    if (input.dueReviews > 0) add(reviewItem(Math.min(10, input.dueReviews), 'A short catch-up — only the most important words.'));
    if (input.available.grammarReview) {
      add({ type: 'grammar_review', title: 'Quick grammar refresh', minutes: 3, skill: 'grammar', reason: 'Wake up the grammar you already know.', payload: { count: 5 } });
    }
    add(skillActivity('listening', input, random, 'One listening activity to get your ear back.'));
    add(skillActivity('speaking', input, random, 'A little speaking so the words come back.'));
    if (input.nextLesson && budget >= 5) add(lessonItem(input.nextLesson, budget));
    return {
      mode: 'recovery',
      message: `Welcome back. Let's continue where you left off. Today is a lighter catch-up session — no extra homework for the days you missed.`,
      items,
      totalMinutes: items.reduce((a, i) => a + i.minutes, 0),
    };
  }

  // ---- Normal session.
  const vocabWeak = weak.includes('vocabulary');
  if (input.dueReviews > 0) {
    const cap = Math.max(8, Math.round((input.minutes * (vocabWeak ? 0.35 : 0.28)) / 0.35));
    add(reviewItem(Math.min(input.dueReviews, cap), vocabWeak ? 'Vocabulary is your focus right now, so reviews get more time.' : 'Words due today — reviewing them now keeps them in long-term memory.'));
  }

  if (input.moduleTestReady) {
    add({
      type: 'module_test',
      title: `Module test: ${input.moduleTestReady.title}`,
      minutes: Math.min(30, Math.max(15, budget)),
      skill: 'mixed',
      reason: 'You have finished all lessons in this module. The test checks what you have achieved.',
      payload: { moduleId: input.moduleTestReady.moduleId },
    });
  } else if (input.nextLesson) {
    const share = input.lighterSkills.length >= 2 ? 0.65 : 0.55;
    add(lessonItem(input.nextLesson, Math.max(6, Math.round(budget * share))));
  }

  if (input.dueMistakes >= 2 && budget >= MIN_ITEM_MINUTES) {
    const count = Math.min(6, input.dueMistakes);
    add({ type: 'mistakes', title: `Fix ${count} past mistakes`, minutes: 3, skill: 'mixed', reason: 'These mistakes came up before. Correcting them again makes the right form automatic.', payload: { count } });
  }

  // Weekly focus quota first, then currently weak skills.
  const focusSkills = (Object.entries(input.weeklyExtra) as [CoreSkill, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
  const extraOrder = [...new Set([...focusSkills, ...weak])].filter((s) => !input.lighterSkills.includes(s));
  for (const skill of extraOrder.slice(0, 2)) {
    if (budget < 4) break;
    add(skillActivity(skill, input, random, focusSkills.includes(skill) ? `Part of this week's ${skill} focus.` : `Extra ${skill} practice — this skill needs a little more attention.`));
  }

  if (budget >= 3) add(gameItem(input, random, 'A quick game with words you have already learned.'));
  if (!input.challengeDone && budget >= 2) {
    add({ type: 'challenge', title: "Today's challenge", minutes: 3, skill: 'mixed', reason: 'One special task to use your English creatively.', payload: {} });
  }

  // Fill leftover time with something different from recent sessions.
  const fillers: SessionItemType[] = shuffle(['dictation', 'shadowing', 'grammar_review', 'reading', 'speaking'] as SessionItemType[], random).filter(
    (t) => !input.recentTypes.includes(t) && !items.some((i) => i.type === t),
  );
  for (const type of fillers) {
    if (budget < 4) break;
    const skill: CoreSkill = type === 'dictation' ? 'listening' : type === 'shadowing' || type === 'speaking' ? 'speaking' : type === 'reading' ? 'reading' : 'grammar';
    if (input.lighterSkills.includes(skill) && type === 'grammar_review') continue;
    const item = skillActivity(skill, { ...input, recentTypes: [...input.recentTypes, ...items.map((i) => i.type)] }, random, 'Mixing skills keeps learning varied and effective.');
    if (item && !items.some((i) => i.type === item.type)) add(item);
  }

  // Leftover time goes to the curriculum: extend the lesson segment rather than end the session early.
  const lessonIdx = items.findIndex((i) => i.type === 'lesson');
  if (lessonIdx >= 0 && budget >= 4 && input.nextLesson) {
    const current = items[lessonIdx];
    const extended = lessonItem(input.nextLesson, current.minutes + budget);
    if (extended && extended.minutes > current.minutes) {
      budget -= extended.minutes - current.minutes;
      items[lessonIdx] = extended;
    }
  }

  const first = input.daysAway === null && input.dueReviews === 0 && (input.nextLesson?.currentStep ?? 0) === 0;
  const message = first
    ? "Let's begin! Today you start your first lesson. Everything you learn will come back for review at the right time."
    : input.daysAway !== null && input.daysAway >= 2 && input.schedule === 'daily'
      ? "Welcome back. Let's continue where you left off."
      : weak.length
        ? `Today's plan includes extra ${weak[0]} practice, because that skill needs the most attention right now.`
        : 'Your plan for today mixes review, new material and practice.';

  // Keep the recommended order: review → core lesson/test → skills → mistakes → game → challenge.
  const order: SessionItemType[] = ['review', 'lesson', 'module_test', 'listening', 'dictation', 'reading', 'grammar_review', 'speaking', 'shadowing', 'writing', 'mistakes', 'game', 'challenge'];
  items.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

  return { mode: first ? 'first' : 'normal', message, items, totalMinutes: items.reduce((a, i) => a + i.minutes, 0) };
}
