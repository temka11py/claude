import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError, idParam, notFound, validate } from '../lib/http.js';
import { parseJson } from '../lib/json.js';
import { gradeAnswer } from '../lib/grading.js';
import { gradeQuestions, publicQuestion, shuffle, summarize } from '../lib/quiz.js';
import { lessonStates } from '../lib/lessons.js';
import { localDate } from '../lib/dates.js';
import { bumpDaily } from '../lib/stats.js';
import { checkAchievements } from '../lib/achievements.js';
import { uid } from '../middleware/auth.js';

export const quizRouter = Router();

const QUIZ_KINDS = ['lesson', 'module_test', 'mock_exam', 'story', 'listening'] as const;

quizRouter.get('/quizzes', async (req, res) => {
  const userId = uid(req);
  const { kind } = validate(z.object({ kind: z.enum(QUIZ_KINDS).optional() }), req.query);
  const quizzes = await prisma.quiz.findMany({
    where: { kind },
    orderBy: { id: 'asc' },
    select: {
      id: true, slug: true, title: true, description: true, kind: true, passingScore: true, timeLimitSec: true, moduleId: true, lessonId: true,
      _count: { select: { questions: true } },
      attempts: { where: { userId }, orderBy: { createdAt: 'desc' }, select: { id: true, percent: true, passed: true, createdAt: true } },
    },
  });
  res.json({
    quizzes: quizzes.map(({ attempts, _count, ...q }) => ({
      ...q,
      questionCount: _count.questions,
      attempts: attempts.length,
      best: attempts.length ? Math.max(...attempts.map((a) => a.percent)) : null,
      passed: attempts.some((a) => a.passed),
      lastAttemptId: attempts[0]?.id ?? null,
    })),
  });
});

/** Module tests unlock once every lesson in the module is completed. */
async function moduleTestLocked(userId: string, moduleId: number) {
  const [lessons, states] = await Promise.all([
    prisma.lesson.findMany({ where: { moduleId }, select: { id: true } }),
    lessonStates(userId),
  ]);
  return lessons.some((l) => states.get(l.id)?.status !== 'completed');
}

quizRouter.get('/quizzes/:id', async (req, res) => {
  const userId = uid(req);
  const id = validate(idParam, req.params.id);
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: 'asc' }, include: { question: true } },
      module: { select: { id: true, order: true, title: true } },
      lesson: { select: { id: true, title: true } },
    },
  });
  if (!quiz) throw notFound('Quiz');
  if (quiz.kind === 'module_test' && quiz.moduleId && (await moduleTestLocked(userId, quiz.moduleId))) {
    throw new HttpError(403, 'Complete every lesson in this module to unlock the test.');
  }
  if (quiz.kind === 'lesson' && quiz.lessonId) {
    const state = (await lessonStates(userId)).get(quiz.lessonId);
    if (!state || state.status === 'locked') throw new HttpError(403, 'Lesson is locked');
  }
  const { questions, ...rest } = quiz;
  res.json({ quiz: { ...rest, questions: questions.map((q) => publicQuestion(q.question)) } });
});

const practiceQuery = z.object({
  categories: z.string().regex(/^[a-z0-9,_-]*$/).optional(),
  prefix: z.string().regex(/^[a-z0-9,-]+$/).optional(),
  grammarId: z.coerce.number().int().positive().optional(),
  types: z.string().regex(/^[a-z0-9,_]*$/).optional(),
  lessonId: z.coerce.number().int().positive().optional(),
  count: z.coerce.number().int().min(1).max(40).default(10),
});

/** Ad-hoc practice sets drawn from the question bank (weak areas, kana drills, translation…). */
quizRouter.get('/quiz/practice', async (req, res) => {
  const query = validate(practiceQuery, req.query);
  const where: Prisma.QuestionWhereInput = { section: '' };
  const categories = query.categories?.split(',').filter(Boolean);
  const types = query.types?.split(',').filter(Boolean);
  if (categories?.length) where.category = { in: categories };
  if (types?.length) where.type = { in: types };
  const prefixes = query.prefix?.split(',').filter(Boolean) ?? [];
  if (prefixes.length) where.OR = prefixes.map((p) => ({ key: { startsWith: p } }));
  if (query.lessonId) where.lessonId = query.lessonId;
  if (query.grammarId) where.grammarId = query.grammarId;
  const pool = await prisma.question.findMany({ where });
  const questions = shuffle(pool).slice(0, query.count);
  res.json({ questions: questions.map(publicQuestion), available: pool.length });
});

const checkSchema = z.object({ questionId: z.number().int().positive(), answer: z.string().max(2000) });

/** Grade a single answer immediately (translation practice). Nothing is stored. */
quizRouter.post('/quiz/check', async (req, res) => {
  const { questionId, answer } = validate(checkSchema, req.body);
  const q = await prisma.question.findUnique({ where: { id: questionId } });
  if (!q) throw notFound('Question');
  const result = gradeAnswer(q, answer);
  res.json({ ...result, explanation: q.explanation });
});

const submitSchema = z.object({
  quizId: z.number().int().positive().optional(),
  kind: z.enum(['practice', 'translation', 'kana', 'weak_areas']).optional(),
  title: z.string().max(120).optional(),
  questionIds: z.array(z.number().int().positive()).max(80).optional(),
  answers: z.record(z.string(), z.string().max(2000)),
  durationSec: z.number().int().min(0).max(6 * 3600).default(0),
});

quizRouter.post('/quiz/submit', async (req, res) => {
  const userId = uid(req);
  const body = validate(submitSchema, req.body);
  const today = localDate(req);

  let questions;
  const quiz = body.quizId
    ? await prisma.quiz.findUnique({ where: { id: body.quizId }, include: { story: true, listening: true } })
    : null;
  if (body.quizId && !quiz) throw notFound('Quiz');
  if (quiz) {
    const links = await prisma.quizQuestion.findMany({ where: { quizId: quiz.id }, orderBy: { order: 'asc' }, include: { question: true } });
    questions = links.map((l) => l.question);
  } else {
    if (!body.questionIds?.length) throw new HttpError(400, 'questionIds are required for practice sets');
    const found = await prisma.question.findMany({ where: { id: { in: body.questionIds } } });
    const byId = new Map(found.map((q) => [q.id, q]));
    questions = body.questionIds.map((id) => byId.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
  }
  if (questions.length === 0) throw new HttpError(400, 'No questions to grade');

  const results = gradeQuestions(questions, body.answers);
  const summary = summarize(results);
  const kind = quiz?.kind ?? body.kind ?? 'practice';
  const passingScore = quiz?.passingScore ?? 80;
  const passed = summary.percent >= passingScore;

  const attempt = await prisma.quizAttempt.create({
    data: {
      userId,
      quizId: quiz?.id,
      kind,
      title: quiz?.title ?? body.title ?? 'Practice',
      correct: summary.correct,
      total: summary.total,
      percent: summary.percent,
      passed,
      durationSec: body.durationSec,
      sectionScores: JSON.stringify(summary.sections),
      answers: {
        create: results.map((r) => ({ questionId: r.questionId, userId, category: r.category, answer: r.answer.slice(0, 500), correct: r.correct })),
      },
    },
  });

  const grammarAnswered = results.filter((r) => r.category === 'grammar' || r.category === 'particles').length;
  await bumpDaily(userId, today, { questions: summary.total, correct: summary.correct, grammar: grammarAnswered });

  if (quiz?.kind === 'lesson' && quiz.lessonId) {
    const lessonId = quiz.lessonId;
    const existing = await prisma.userProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
    const done = [...new Set([...parseJson<string[]>(existing?.sectionsDone, []), 'quiz'])];
    await prisma.userProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, quizScore: summary.percent, sectionsDone: JSON.stringify(done) },
      update: { quizScore: Math.max(existing?.quizScore ?? 0, summary.percent), sectionsDone: JSON.stringify(done) },
    });
  }
  if (quiz?.story) {
    const first = !(await prisma.activity.findFirst({ where: { userId, type: 'story', refId: quiz.story.slug } }));
    await prisma.activity.create({ data: { userId, type: 'story', refId: quiz.story.slug, score: summary.percent } });
    if (first) await bumpDaily(userId, today, { stories: 1 });
  }
  if (quiz?.listening) {
    await prisma.activity.create({ data: { userId, type: 'listening', refId: quiz.listening.slug, score: summary.percent } });
  }
  if (kind === 'module_test' || kind === 'mock_exam' || kind === 'translation') {
    await prisma.activity.create({ data: { userId, type: kind, refId: String(quiz?.id ?? attempt.id), score: summary.percent } });
  }

  const achievements = await checkAchievements(userId, today);
  res.json({ attempt: await attemptDetails(attempt.id, userId), achievements });
});

async function attemptDetails(attemptId: string, userId: string) {
  const attempt = await prisma.quizAttempt.findFirst({
    where: { id: attemptId, userId },
    include: {
      quiz: { select: { id: true, slug: true, kind: true, passingScore: true, moduleId: true, lessonId: true } },
      answers: { orderBy: { id: 'asc' }, include: { question: true } },
    },
  });
  if (!attempt) return null;
  const results = attempt.answers.map((a) => {
    const graded = gradeAnswer(a.question, a.answer);
    return {
      question: publicQuestion(a.question),
      answer: a.answer,
      correct: a.correct,
      expected: graded.expected,
      feedback: graded.feedback,
      explanation: a.question.explanation,
    };
  });
  const categories: Record<string, { correct: number; total: number }> = {};
  for (const r of results) {
    const c = (categories[r.question.category] ??= { correct: 0, total: 0 });
    c.total++;
    if (r.correct) c.correct++;
  }
  const weak = Object.entries(categories)
    .map(([category, s]) => ({ category, ...s, accuracy: Math.round((s.correct / s.total) * 100) }))
    .filter((c) => c.accuracy < 80)
    .sort((a, b) => a.accuracy - b.accuracy);
  const wrongLessonIds = [...new Set(results.filter((r) => !r.correct && r.question.lessonId).map((r) => r.question.lessonId as number))];
  const recommendedLessons = wrongLessonIds.length
    ? await prisma.lesson.findMany({ where: { id: { in: wrongLessonIds } }, select: { id: true, slug: true, title: true, globalOrder: true }, orderBy: { globalOrder: 'asc' }, take: 5 })
    : [];
  const { answers: _answers, ...rest } = attempt;
  return {
    ...rest,
    sectionScores: parseJson<Record<string, { correct: number; total: number }>>(attempt.sectionScores, {}),
    passingScore: attempt.quiz?.passingScore ?? 80,
    results,
    weakCategories: weak,
    recommendedLessons,
  };
}

quizRouter.get('/quiz/attempts', async (req, res) => {
  const userId = uid(req);
  const { kind, limit } = validate(z.object({ kind: z.string().max(30).optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }), req.query);
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, kind },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, title: true, kind: true, correct: true, total: true, percent: true, passed: true, durationSec: true, createdAt: true, quizId: true },
  });
  res.json({ attempts });
});

quizRouter.get('/quiz/attempts/:id', async (req, res) => {
  const attempt = await attemptDetails(String(req.params.id), uid(req));
  if (!attempt) throw notFound('Attempt');
  res.json({ attempt });
});
