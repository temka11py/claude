import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError, idParam, notFound, validate } from '../lib/http.js';
import { parseJson } from '../lib/json.js';
import { lessonStates } from '../lib/lessons.js';
import { ensureReviewItems, type ItemType } from '../lib/review.js';
import { bumpDaily } from '../lib/stats.js';
import { checkAchievements } from '../lib/achievements.js';
import { localDate } from '../lib/dates.js';
import { uid } from '../middleware/auth.js';

export const lessonsRouter = Router();

export const LESSON_SECTIONS = ['kana', 'vocabulary', 'grammar', 'kanji', 'examples', 'practice', 'quiz', 'review'] as const;

lessonsRouter.get('/modules', async (req, res) => {
  const userId = uid(req);
  const [modules, states, tests] = await Promise.all([
    prisma.module.findMany({
      orderBy: { order: 'asc' },
      include: { lessons: { orderBy: { order: 'asc' }, select: { id: true, slug: true, order: true, globalOrder: true, title: true, titleJa: true, summary: true, minutes: true } } },
    }),
    lessonStates(userId),
    prisma.quiz.findMany({
      where: { kind: 'module_test' },
      select: { id: true, moduleId: true, title: true, attempts: { where: { userId }, orderBy: { percent: 'desc' }, take: 1, select: { percent: true, passed: true } } },
    }),
  ]);
  res.json({
    modules: modules.map((m) => {
      const lessons = m.lessons.map((l) => ({ ...l, ...states.get(l.id), id: l.id }));
      const completed = lessons.filter((l) => l.status === 'completed').length;
      const test = tests.find((t) => t.moduleId === m.id);
      return {
        ...m,
        lessons,
        completed,
        total: lessons.length,
        test: test
          ? { id: test.id, title: test.title, available: completed === lessons.length && lessons.length > 0, best: test.attempts[0]?.percent ?? null, passed: test.attempts[0]?.passed ?? false }
          : null,
      };
    }),
  });
});

lessonsRouter.get('/lessons', async (req, res) => {
  const states = await lessonStates(uid(req));
  const lessons = await prisma.lesson.findMany({
    orderBy: { globalOrder: 'asc' },
    select: { id: true, slug: true, title: true, titleJa: true, order: true, globalOrder: true, moduleId: true, minutes: true },
  });
  res.json({ lessons: lessons.map((l) => ({ ...l, ...states.get(l.id), id: l.id })) });
});

async function findLesson(idOrSlug: string) {
  const asId = Number(idOrSlug);
  return prisma.lesson.findFirst({
    where: Number.isInteger(asId) && asId > 0 ? { id: asId } : { slug: idOrSlug },
    include: {
      module: { select: { id: true, order: true, title: true, titleJa: true } },
      kana: { orderBy: { order: 'asc' } },
      vocabulary: { orderBy: { id: 'asc' } },
      kanji: { orderBy: { order: 'asc' } },
      grammar: { orderBy: { order: 'asc' } },
      stories: { select: { id: true, slug: true, title: true, titleJa: true } },
      quizzes: { where: { kind: 'lesson' }, select: { id: true, title: true, _count: { select: { questions: true } } } },
    },
  });
}

lessonsRouter.get('/lessons/:id', async (req, res) => {
  const userId = uid(req);
  const lesson = await findLesson(String(req.params.id));
  if (!lesson) throw notFound('Lesson');
  const states = await lessonStates(userId);
  const state = states.get(lesson.id);
  if (!state || state.status === 'locked') throw new HttpError(403, 'Lesson is locked. Complete the previous lesson first.');

  const [prev, next] = await Promise.all([
    prisma.lesson.findUnique({ where: { globalOrder: lesson.globalOrder - 1 }, select: { id: true, slug: true, title: true } }),
    prisma.lesson.findUnique({ where: { globalOrder: lesson.globalOrder + 1 }, select: { id: true, slug: true, title: true } }),
  ]);

  const content = parseJson<Record<string, unknown>>(lesson.content, {});
  const examples = (content.examples as unknown[] | undefined) ?? [];
  const quiz = lesson.quizzes[0] ?? null;
  const sections = LESSON_SECTIONS.filter((s) => {
    switch (s) {
      case 'kana': return lesson.kana.length > 0;
      case 'vocabulary': return lesson.vocabulary.length > 0;
      case 'grammar': return lesson.grammar.length > 0;
      case 'kanji': return lesson.kanji.length > 0;
      case 'examples': return examples.length > 0 || lesson.grammar.length > 0 || Boolean(content.dialogue);
      case 'practice': return lesson.vocabulary.length + lesson.kana.length + lesson.kanji.length >= 4;
      case 'quiz': return Boolean(quiz);
      default: return true;
    }
  });

  res.json({
    lesson: {
      ...lesson,
      objectives: parseJson<string[]>(lesson.objectives, []),
      content,
      kanji: lesson.kanji.map((k) => ({ ...k, examples: parseJson(k.examples, []), sentences: parseJson(k.sentences, []) })),
      grammar: lesson.grammar.map((g) => ({ ...g, examples: parseJson(g.examples, []), mistakes: parseJson(g.mistakes, []) })),
      quiz: quiz ? { id: quiz.id, title: quiz.title, questionCount: quiz._count.questions } : null,
      quizzes: undefined,
    },
    sections,
    status: state.status,
    sectionsDone: state.sectionsDone,
    quizScore: state.quizScore,
    prev: prev ? { ...prev, status: states.get(prev.id)?.status } : null,
    next: next ? { ...next, status: states.get(next.id)?.status } : null,
  });
});

const sectionSchema = z.object({ section: z.enum(LESSON_SECTIONS) });

async function assertUnlocked(userId: string, lessonId: number) {
  const states = await lessonStates(userId);
  const state = states.get(lessonId);
  if (!state) throw notFound('Lesson');
  if (state.status === 'locked') throw new HttpError(403, 'Lesson is locked');
  return state;
}

lessonsRouter.post('/lessons/:id/section', async (req, res) => {
  const userId = uid(req);
  const lessonId = validate(idParam, req.params.id);
  const { section } = validate(sectionSchema, req.body);
  const state = await assertUnlocked(userId, lessonId);
  const done = [...new Set([...state.sectionsDone, section])];
  await prisma.userProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, sectionsDone: JSON.stringify(done) },
    update: { sectionsDone: JSON.stringify(done) },
  });
  res.json({ sectionsDone: done, status: state.status === 'completed' ? 'completed' : 'in_progress' });
});

lessonsRouter.post('/lessons/:id/complete', async (req, res) => {
  const userId = uid(req);
  const lessonId = validate(idParam, req.params.id);
  const state = await assertUnlocked(userId, lessonId);
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      kana: { select: { id: true } },
      vocabulary: { select: { id: true } },
      kanji: { select: { id: true } },
      grammar: { select: { id: true } },
      quizzes: { where: { kind: 'lesson' }, select: { id: true } },
    },
  });
  if (!lesson) throw notFound('Lesson');
  if (lesson.quizzes.length > 0 && state.quizScore === null) {
    throw new HttpError(400, 'Finish the mini quiz before completing the lesson.');
  }

  const alreadyCompleted = state.status === 'completed';
  const done = [...new Set([...state.sectionsDone, 'review'])];
  await prisma.userProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, status: 'completed', sectionsDone: JSON.stringify(done), completedAt: new Date() },
    update: { status: 'completed', sectionsDone: JSON.stringify(done), completedAt: alreadyCompleted ? undefined : new Date() },
  });

  const items: { type: ItemType; id: number }[] = [
    ...lesson.kana.map((k) => ({ type: 'kana' as const, id: k.id })),
    ...lesson.vocabulary.map((v) => ({ type: 'vocab' as const, id: v.id })),
    ...lesson.kanji.map((k) => ({ type: 'kanji' as const, id: k.id })),
    ...lesson.grammar.map((g) => ({ type: 'grammar' as const, id: g.id })),
  ];
  const added = await ensureReviewItems(userId, items);
  const today = localDate(req);
  if (!alreadyCompleted) {
    await bumpDaily(userId, today, { lessons: 1, vocab: lesson.vocabulary.length, kanji: lesson.kanji.length, grammar: lesson.grammar.length });
    await prisma.activity.create({ data: { userId, type: 'lesson', refId: String(lessonId) } });
  }
  const achievements = await checkAchievements(userId, today);
  const next = await prisma.lesson.findUnique({ where: { globalOrder: lesson.globalOrder + 1 }, select: { id: true, slug: true, title: true } });
  res.json({ status: 'completed', reviewItemsAdded: added, achievements, next });
});
