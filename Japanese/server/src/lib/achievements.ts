import { prisma } from './prisma.js';
import { getStreak, learnedCounts } from './stats.js';

type Checker = (ctx: Context) => boolean;

interface Context {
  lessonsDone: number;
  kanaModuleDone: boolean;
  streak: number;
  kanjiLearned: number;
  vocabLearned: number;
  bestQuiz: number;
  stories: number;
  reviews: number;
  moduleTestPassed: boolean;
  mockExams: number;
  speaking: number;
}

const RULES: Record<string, Checker> = {
  first_lesson: (c) => c.lessonsDone >= 1,
  kana_master: (c) => c.kanaModuleDone,
  streak_3: (c) => c.streak >= 3,
  streak_7: (c) => c.streak >= 7,
  kanji_10: (c) => c.kanjiLearned >= 10,
  vocab_100: (c) => c.vocabLearned >= 100,
  quiz_90: (c) => c.bestQuiz >= 90,
  first_story: (c) => c.stories >= 1,
  review_50: (c) => c.reviews >= 50,
  module_test: (c) => c.moduleTestPassed,
  mock_exam: (c) => c.mockExams >= 1,
  first_speaking: (c) => c.speaking >= 1,
};

async function buildContext(userId: string, today: string): Promise<Context> {
  const [lessonsDone, kanaLessons, streak, learned, bestQuiz, stories, reviews, moduleTestPassed, mockExams, speaking] = await Promise.all([
    prisma.userProgress.count({ where: { userId, status: 'completed' } }),
    prisma.lesson.findMany({ where: { module: { order: 0 } }, select: { id: true, progress: { where: { userId, status: 'completed' }, select: { id: true } } } }),
    getStreak(userId, today),
    learnedCounts(userId),
    prisma.quizAttempt.findFirst({ where: { userId, total: { gte: 5 } }, orderBy: { percent: 'desc' }, select: { percent: true } }),
    prisma.activity.count({ where: { userId, type: 'story' } }),
    prisma.dailyStat.aggregate({ where: { userId }, _sum: { reviews: true } }),
    prisma.quizAttempt.count({ where: { userId, kind: 'module_test', passed: true } }),
    prisma.quizAttempt.count({ where: { userId, kind: 'mock_exam' } }),
    prisma.activity.count({ where: { userId, type: 'speaking' } }),
  ]);
  return {
    lessonsDone,
    kanaModuleDone: kanaLessons.length > 0 && kanaLessons.every((l) => l.progress.length > 0),
    streak: streak.current,
    kanjiLearned: learned.kanji.learned,
    vocabLearned: learned.vocab.learned,
    bestQuiz: bestQuiz?.percent ?? 0,
    stories,
    reviews: reviews._sum.reviews ?? 0,
    moduleTestPassed: moduleTestPassed > 0,
    mockExams,
    speaking,
  };
}

/** Unlock any newly earned achievements and return them (for a toast in the UI). */
export async function checkAchievements(userId: string, today: string) {
  const [all, owned] = await Promise.all([
    prisma.achievement.findMany({ orderBy: { order: 'asc' } }),
    prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
  ]);
  const ownedIds = new Set(owned.map((o) => o.achievementId));
  const pending = all.filter((a) => !ownedIds.has(a.id) && RULES[a.code]);
  if (pending.length === 0) return [];
  const ctx = await buildContext(userId, today);
  const unlocked = pending.filter((a) => RULES[a.code](ctx));
  if (unlocked.length) {
    await prisma.userAchievement.createMany({ data: unlocked.map((a) => ({ userId, achievementId: a.id })) });
  }
  return unlocked.map(({ code, title, titleEn, description, icon }) => ({ code, title, titleEn, description, icon }));
}
