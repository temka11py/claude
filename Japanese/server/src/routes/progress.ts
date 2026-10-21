import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../lib/http.js';
import { addDays, localDate } from '../lib/dates.js';
import { bumpDaily, getStreak, learnedCounts, overallProgress, weakAreas } from '../lib/stats.js';
import { nextLesson } from '../lib/lessons.js';
import { checkAchievements } from '../lib/achievements.js';
import { uid } from '../middleware/auth.js';

export const progressRouter = Router();

const DAILY_TARGETS = { lessons: 1, vocab: 10, kanji: 5, grammar: 5, stories: 1 } as const;

async function lastDays(userId: string, today: string, days: number) {
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  const stats = await prisma.dailyStat.findMany({ where: { userId, date: { in: dates } } });
  const byDate = new Map(stats.map((s) => [s.date, s]));
  return dates.map((date) => {
    const s = byDate.get(date);
    return {
      date,
      minutes: Math.round((s?.seconds ?? 0) / 60),
      questions: s?.questions ?? 0,
      correct: s?.correct ?? 0,
      reviews: s?.reviews ?? 0,
      active: !!s && (s.seconds >= 60 || s.lessons > 0 || s.reviews > 0 || s.questions > 0 || s.stories > 0),
    };
  });
}

progressRouter.get('/dashboard', async (req, res) => {
  const userId = uid(req);
  const today = localDate(req);
  const [settings, todayStat, next, overall, streak, weak, dueNow, week, recent] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: today } } }),
    nextLesson(userId),
    overallProgress(userId),
    getStreak(userId, today),
    weakAreas(userId),
    prisma.reviewItem.count({ where: { userId, dueAt: { lte: new Date() } } }),
    lastDays(userId, today, 7),
    prisma.userAchievement.findMany({ where: { userId }, orderBy: { unlockedAt: 'desc' }, take: 3, include: { achievement: true } }),
  ]);
  const goalMinutes = settings?.dailyGoalMinutes ?? 25;
  const minutes = Math.round((todayStat?.seconds ?? 0) / 60);
  const targets = [
    { key: 'minutes', done: minutes, target: goalMinutes },
    ...Object.entries(DAILY_TARGETS).map(([key, target]) => ({ key, done: todayStat?.[key as keyof typeof DAILY_TARGETS] ?? 0, target })),
  ];
  const percent = Math.round((targets.reduce((sum, t) => sum + Math.min(1, t.done / t.target), 0) / targets.length) * 100);
  res.json({
    today: { date: today, targets, percent, minutes, goalMinutes },
    continueLesson: next,
    overall,
    streak: { ...streak, week },
    weakAreas: weak.weak,
    review: { dueNow },
    recentAchievements: recent.map((r) => ({ ...r.achievement, unlockedAt: r.unlockedAt })),
  });
});

progressRouter.get('/progress', async (req, res) => {
  const userId = uid(req);
  const today = localDate(req);
  const [overall, learned, streak, weekly, attempts, avg, timeSum, speaking, tests, reviewTotals, categories, achievements, unlocked] = await Promise.all([
    overallProgress(userId),
    learnedCounts(userId),
    getStreak(userId, today),
    lastDays(userId, today, 7),
    prisma.quizAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, title: true, kind: true, percent: true, createdAt: true } }),
    prisma.quizAttempt.aggregate({ where: { userId }, _avg: { percent: true }, _count: { _all: true } }),
    prisma.dailyStat.aggregate({ where: { userId }, _sum: { seconds: true } }),
    prisma.activity.count({ where: { userId, type: 'speaking' } }),
    prisma.quizAttempt.count({ where: { userId, kind: { in: ['module_test', 'mock_exam'] } } }),
    prisma.reviewItem.aggregate({ where: { userId }, _sum: { correctCount: true, totalCount: true } }),
    weakAreas(userId, 10),
    prisma.achievement.findMany({ orderBy: { order: 'asc' } }),
    prisma.userAchievement.findMany({ where: { userId } }),
  ]);
  const unlockedAt = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));
  const reviewCorrect = reviewTotals._sum.correctCount ?? 0;
  const reviewTotal = reviewTotals._sum.totalCount ?? 0;
  res.json({
    totals: {
      lessonsCompleted: overall.lessons.done,
      lessonsTotal: overall.lessons.total,
      vocabLearned: learned.vocab.learned,
      kanjiLearned: learned.kanji.learned,
      grammarCompleted: overall.grammar.done,
      storiesCompleted: overall.reading.done,
      listeningCompleted: overall.listening.done,
      speakingPractice: speaking,
      testsCompleted: tests,
      quizzesTaken: avg._count._all,
      averageQuizScore: avg._avg.percent === null ? null : Math.round(avg._avg.percent),
      studyMinutes: Math.round((timeSum._sum.seconds ?? 0) / 60),
      streak: streak.current,
      longestStreak: streak.longest,
      reviewAccuracy: reviewTotal ? Math.round((reviewCorrect / reviewTotal) * 100) : null,
      reviewsDone: reviewTotal,
    },
    overall,
    learned,
    weekly,
    quizHistory: attempts.reverse(),
    categories: categories.all,
    achievements: achievements.map((a) => ({ ...a, unlockedAt: unlockedAt.get(a.id) ?? null })),
  });
});

progressRouter.post('/progress/time', async (req, res) => {
  const userId = uid(req);
  const { seconds } = validate(z.object({ seconds: z.number().int().min(1).max(300) }), req.body);
  const today = localDate(req);
  await bumpDaily(userId, today, { seconds });
  const achievements = await checkAchievements(userId, today);
  res.json({ ok: true, achievements });
});

progressRouter.get('/achievements', async (req, res) => {
  const userId = uid(req);
  const [all, unlocked] = await Promise.all([
    prisma.achievement.findMany({ orderBy: { order: 'asc' } }),
    prisma.userAchievement.findMany({ where: { userId } }),
  ]);
  const at = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));
  res.json({ achievements: all.map((a) => ({ ...a, unlockedAt: at.get(a.id) ?? null })) });
});
