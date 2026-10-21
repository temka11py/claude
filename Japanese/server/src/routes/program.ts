import { Router } from 'express';
import { z } from 'zod';
import type { ProgramDay } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError, notFound, validate } from '../lib/http.js';
import { parseJson } from '../lib/json.js';
import { addDays, localDate } from '../lib/dates.js';
import { ensureReviewItems, type ItemType } from '../lib/review.js';
import { bumpDaily, getStreak } from '../lib/stats.js';
import { checkAchievements } from '../lib/achievements.js';
import { publicQuestion } from '../lib/quiz.js';
import { uid } from '../middleware/auth.js';

export const programRouter = Router();

export const XP_GOAL = 50;
const XP_STEP = 10;
const XP_PERFECT = 5;
const XP_DAY = 20;
const XP_REPEAT = 2;

export interface DayStep {
  key: string;
  kind: string;
  title: string;
  minutes: number;
  optional?: boolean;
  kanaIds?: number[];
  vocabIds?: number[];
  kanjiIds?: number[];
  grammarIds?: number[];
  storyId?: number;
  passages?: string[];
  sentences?: { ja: string; mn: string; speaker?: string }[];
  listeningIds?: number[];
  speakingId?: number;
  questionIds?: number[];
  game?: 'sudoku' | 'match';
  sudoku?: { size: number; symbols: string[]; hints: string[] };
}

const stepsOf = (day: Pick<ProgramDay, 'steps'>) => parseJson<DayStep[]>(day.steps, []);
const required = (steps: DayStep[]) => steps.filter((s) => !s.optional);

type DayRow = ProgramDay & { progress: { stepsDone: string; scores: string; completedAt: Date | null; completedOn: string | null; xp: number }[] };

function summarize(day: DayRow) {
  const steps = stepsOf(day);
  const p = day.progress[0];
  const done = parseJson<string[]>(p?.stepsDone, []);
  return {
    id: day.id,
    number: day.number,
    slug: day.slug,
    level: day.level,
    unit: day.unit,
    unitTitle: day.unitTitle,
    unitTitleJa: day.unitTitleJa,
    title: day.title,
    titleJa: day.titleJa,
    goal: day.goal,
    kind: day.kind,
    ready: day.ready,
    outline: parseJson<string[]>(day.outline, []),
    minutes: steps.reduce((n, s) => n + s.minutes, 0),
    stepsTotal: required(steps).length,
    stepsDone: required(steps).filter((s) => done.includes(s.key)).length,
    completed: !!p?.completedAt,
    completedOn: p?.completedOn ?? null,
    started: !!p,
    xp: p?.xp ?? 0,
    steps: steps.map((s) => ({ key: s.key, kind: s.kind, title: s.title, minutes: s.minutes, optional: !!s.optional, done: done.includes(s.key), score: parseJson<Record<string, number>>(p?.scores, {})[s.key] ?? null })),
  };
}

async function loadDays(userId: string) {
  return prisma.programDay.findMany({
    orderBy: { number: 'asc' },
    include: { progress: { where: { userId }, select: { stepsDone: true, scores: true, completedAt: true, completedOn: true, xp: true } } },
  });
}

/** The day to study now: the first ready day that is not finished. */
function currentDay(days: DayRow[]) {
  return days.find((d) => d.ready && !d.progress[0]?.completedAt) ?? null;
}

const QUESTS = [
  { key: 'reviews', target: 10, mn: '10 карт давтах', en: 'Review 10 cards' },
  { key: 'games', target: 1, mn: 'Нэг тоглоом тоглох', en: 'Play one game' },
  { key: 'correct', target: 15, mn: '15 асуултад зөв хариулах', en: 'Answer 15 questions correctly' },
] as const;

programRouter.get('/program', async (req, res) => {
  const userId = uid(req);
  const days = await loadDays(userId);
  const current = currentDay(days);
  const levels = ['N5', 'N4', 'N3', 'N2'].map((level) => {
    const inLevel = days.filter((d) => d.level === level);
    const units = [...new Set(inLevel.map((d) => d.unit))].map((unit) => {
      const unitDays = inLevel.filter((d) => d.unit === unit);
      return {
        unit,
        title: unitDays[0].unitTitle,
        titleJa: unitDays[0].unitTitleJa,
        days: unitDays.map((d) => {
          const s = summarize(d);
          return { ...s, steps: undefined, current: d.id === current?.id, ahead: !!current && d.number > current.number };
        }),
      };
    });
    return { level, total: inLevel.length, ready: inLevel.filter((d) => d.ready).length, completed: inLevel.filter((d) => d.progress[0]?.completedAt).length, units };
  });
  res.json({ levels, current: current?.number ?? null });
});

programRouter.get('/program/today', async (req, res) => {
  const userId = uid(req);
  const today = localDate(req);
  const [days, stat, settings, streak, dueNow, week] = await Promise.all([
    loadDays(userId),
    prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: today } } }),
    prisma.userSettings.findUnique({ where: { userId } }),
    getStreak(userId, today),
    prisma.reviewItem.count({ where: { userId, dueAt: { lte: new Date() } } }),
    prisma.dailyStat.findMany({ where: { userId, date: { gte: addDays(today, -6) } }, select: { date: true, seconds: true, xp: true } }),
  ]);
  const current = currentDay(days);
  const finishedToday = days.filter((d) => d.progress[0]?.completedOn === today);
  const goalMinutes = settings?.dailyGoalMinutes ?? 25;
  const quest = QUESTS[new Date(`${today}T12:00:00Z`).getUTCDay() % QUESTS.length];
  const byDate = new Map(week.map((w) => [w.date, w]));
  const level = current?.level ?? 'N5';
  const levelDays = days.filter((d) => d.level === level);
  res.json({
    today,
    day: current ? summarize(current) : null,
    state: !current ? 'all_done' : finishedToday.length && !current.progress[0] ? 'done_today' : current.progress[0] ? 'in_progress' : 'not_started',
    finishedToday: finishedToday.map((d) => ({ number: d.number, title: d.title })),
    time: { seconds: stat?.seconds ?? 0, goalMinutes },
    xp: { today: stat?.xp ?? 0, goal: XP_GOAL, total: days.reduce((n, d) => n + (d.progress[0]?.xp ?? 0), 0) },
    quests: [
      { key: 'steps', mn: '5 алхам дуусгах', en: 'Finish 5 steps', done: stat?.steps ?? 0, target: 5 },
      { key: 'minutes', mn: `${goalMinutes} минут суралцах`, en: `Study ${goalMinutes} minutes`, done: Math.floor((stat?.seconds ?? 0) / 60), target: goalMinutes },
      { key: quest.key, mn: quest.mn, en: quest.en, done: stat?.[quest.key] ?? 0, target: quest.target },
    ],
    streak: {
      ...streak,
      week: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(today, i - 6);
        const w = byDate.get(date);
        return { date, minutes: Math.round((w?.seconds ?? 0) / 60), xp: w?.xp ?? 0 };
      }),
    },
    review: { dueNow },
    level: { level, completed: levelDays.filter((d) => d.progress[0]?.completedAt).length, total: levelDays.length },
  });
});

async function findDay(userId: string, number: number) {
  const day = await prisma.programDay.findUnique({
    where: { number },
    include: { progress: { where: { userId }, select: { stepsDone: true, scores: true, completedAt: true, completedOn: true, xp: true } } },
  });
  if (!day) throw notFound('Day');
  return day;
}

programRouter.get('/program/days/:number', async (req, res) => {
  const userId = uid(req);
  const number = validate(z.coerce.number().int().positive(), req.params.number);
  const day = await findDay(userId, number);
  const steps = stepsOf(day);
  const ids = (k: keyof DayStep) => [...new Set(steps.flatMap((s) => (s[k] as number[] | undefined) ?? []))];
  const [kana, vocab, kanji, grammar, stories, listening, speaking, questions, reviewStates, favorites, prev, next] = await Promise.all([
    prisma.kana.findMany({ where: { id: { in: ids('kanaIds') } } }),
    prisma.vocabulary.findMany({ where: { id: { in: ids('vocabIds') } }, include: { kanji: { select: { id: true, char: true, meaning: true } } } }),
    prisma.kanji.findMany({ where: { id: { in: ids('kanjiIds') } } }),
    prisma.grammar.findMany({ where: { id: { in: ids('grammarIds') } } }),
    prisma.story.findMany({ where: { id: { in: steps.flatMap((s) => (s.storyId ? [s.storyId] : [])) } }, select: { id: true, slug: true, title: true, titleJa: true, summary: true } }),
    prisma.listeningExercise.findMany({ where: { id: { in: ids('listeningIds') } } }),
    prisma.speakingPrompt.findMany({ where: { id: { in: steps.flatMap((s) => (s.speakingId ? [s.speakingId] : [])) } } }),
    prisma.question.findMany({ where: { id: { in: ids('questionIds') } } }),
    prisma.reviewItem.findMany({ where: { userId, OR: [{ vocabularyId: { in: ids('vocabIds') } }, { kanjiId: { in: ids('kanjiIds') } }] }, select: { vocabularyId: true, kanjiId: true, state: true } }),
    prisma.favorite.findMany({ where: { userId, vocabularyId: { in: ids('vocabIds') } }, select: { vocabularyId: true } }),
    prisma.programDay.findUnique({ where: { number: number - 1 }, select: { number: true, title: true, ready: true } }),
    prisma.programDay.findUnique({ where: { number: number + 1 }, select: { number: true, title: true, ready: true } }),
  ]);
  const vocabState = new Map(reviewStates.filter((r) => r.vocabularyId).map((r) => [r.vocabularyId!, r.state]));
  const kanjiState = new Map(reviewStates.filter((r) => r.kanjiId).map((r) => [r.kanjiId!, r.state]));
  const fav = new Set(favorites.map((f) => f.vocabularyId));
  const qById = new Map(questions.map((q) => [q.id, publicQuestion(q)]));
  res.json({
    day: summarize(day),
    content: {
      steps: steps.map((s) => ({ ...s, questions: s.questionIds?.map((id) => qById.get(id)).filter(Boolean) })),
      kana,
      vocab: vocab.map((v) => ({ ...v, state: vocabState.get(v.id) ?? null, favorite: fav.has(v.id) })),
      kanji: kanji.map((k) => ({ ...k, examples: parseJson(k.examples, []), sentences: parseJson(k.sentences, []), state: kanjiState.get(k.id) ?? null })),
      grammar: grammar.map((g) => ({ ...g, examples: parseJson(g.examples, []), mistakes: parseJson(g.mistakes, []) })),
      stories,
      listening: listening.map((l) => ({ ...l, script: parseJson(l.script, []), vocabulary: parseJson(l.vocabulary, []) })),
      speaking: speaking.map((p) => ({ ...p, expected: parseJson(p.expected, []), keywords: parseJson(p.keywords, []) })),
    },
    prev,
    next,
  });
});

const completeSchema = z.object({ score: z.number().int().min(0).max(100).optional() });

programRouter.post('/program/days/:number/steps/:key/complete', async (req, res) => {
  const userId = uid(req);
  const number = validate(z.coerce.number().int().positive(), req.params.number);
  const key = validate(z.string().min(1).max(40), req.params.key);
  const { score } = validate(completeSchema, req.body ?? {});
  const today = localDate(req);
  const day = await findDay(userId, number);
  if (!day.ready) throw new HttpError(400, 'This day is not available yet');
  const steps = stepsOf(day);
  const step = steps.find((s) => s.key === key);
  if (!step) throw notFound('Step');

  const p = day.progress[0];
  const done = parseJson<string[]>(p?.stepsDone, []);
  const scores = parseJson<Record<string, number>>(p?.scores, {});
  const first = !done.includes(key);
  let xp = first ? XP_STEP : XP_REPEAT;
  if (score !== undefined) {
    if (score >= 90 && (scores[key] ?? 0) < 90) xp += XP_PERFECT;
    scores[key] = Math.max(scores[key] ?? 0, score);
  }
  const stepsDone = first ? [...done, key] : done;
  const finished = required(steps).every((s) => stepsDone.includes(s.key));
  const dayCompleted = finished && !p?.completedAt;
  if (dayCompleted) xp += XP_DAY;

  await prisma.dayProgress.upsert({
    where: { userId_dayId: { userId, dayId: day.id } },
    create: { userId, dayId: day.id, stepsDone: JSON.stringify(stepsDone), scores: JSON.stringify(scores), xp, completedAt: dayCompleted ? new Date() : null, completedOn: dayCompleted ? today : null },
    update: { stepsDone: JSON.stringify(stepsDone), scores: JSON.stringify(scores), xp: { increment: xp }, ...(dayCompleted ? { completedAt: new Date(), completedOn: today } : {}) },
  });

  // New items join the spaced-repetition deck once their step is done.
  const items: { type: ItemType; id: number }[] = [
    ...(step.kanaIds ?? []).map((id) => ({ type: 'kana' as const, id })),
    ...(step.kind === 'words' ? (step.vocabIds ?? []) : []).map((id) => ({ type: 'vocab' as const, id })),
    ...(step.kanjiIds ?? []).map((id) => ({ type: 'kanji' as const, id })),
    ...(step.grammarIds ?? []).map((id) => ({ type: 'grammar' as const, id })),
  ];
  const added = await ensureReviewItems(userId, items);
  await bumpDaily(userId, today, {
    xp,
    steps: first ? 1 : 0,
    vocab: first && step.kind === 'words' ? step.vocabIds?.length ?? 0 : 0,
    kanji: first ? step.kanjiIds?.length ?? 0 : 0,
    games: step.kind === 'game' ? 1 : 0,
  });
  if (first && step.storyId) {
    const story = await prisma.story.findUnique({ where: { id: step.storyId }, select: { slug: true } });
    if (story) {
      await prisma.activity.create({ data: { userId, type: 'story', refId: story.slug, score: score ?? null } });
      await bumpDaily(userId, today, { stories: 1 });
    }
  }
  if (first && step.listeningIds?.length) {
    const ex = await prisma.listeningExercise.findMany({ where: { id: { in: step.listeningIds } }, select: { slug: true } });
    await prisma.activity.createMany({ data: ex.map((l) => ({ userId, type: 'listening', refId: l.slug, score: score ?? null })) });
  }
  if (dayCompleted) {
    await prisma.activity.create({ data: { userId, type: 'day', refId: day.slug } });
    if (day.lessonId) {
      // Keep the lesson library in step with the program.
      await prisma.userProgress.upsert({
        where: { userId_lessonId: { userId, lessonId: day.lessonId } },
        create: { userId, lessonId: day.lessonId, status: 'completed', completedAt: new Date() },
        update: { status: 'completed', completedAt: new Date() },
      });
    }
  }

  const achievements = await checkAchievements(userId, today);
  const nextStep = steps.find((s) => !stepsDone.includes(s.key) && s.key !== key && !s.optional) ?? steps.find((s) => !stepsDone.includes(s.key) && s.key !== key) ?? null;
  const stat = await prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: today } }, select: { xp: true } });
  res.json({ xp, xpToday: stat?.xp ?? xp, dayCompleted, stepsDone, nextStep: nextStep?.key ?? null, reviewItemsAdded: added, achievements });
});

const xpSchema = z.object({ source: z.enum(['game', 'flashcards']), amount: z.number().int().min(1).max(20) });

/** XP for free practice outside the program (games page, flashcard decks). */
programRouter.post('/xp', async (req, res) => {
  const userId = uid(req);
  const { source, amount } = validate(xpSchema, req.body);
  const today = localDate(req);
  await bumpDaily(userId, today, { xp: amount, games: source === 'game' ? 1 : 0 });
  const achievements = await checkAchievements(userId, today);
  const stat = await prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: today } }, select: { xp: true } });
  res.json({ xpToday: stat?.xp ?? amount, achievements });
});

// ───────────── flashcard decks ─────────────

programRouter.get('/flashcards/decks', async (req, res) => {
  const userId = uid(req);
  const [days, topics, favorites, weak] = await Promise.all([
    loadDays(userId),
    prisma.vocabulary.groupBy({ by: ['topic'], _count: { _all: true }, orderBy: { topic: 'asc' } }),
    prisma.favorite.count({ where: { userId, vocabularyId: { not: null } } }),
    prisma.reviewItem.count({ where: { userId, itemType: 'vocab', lapses: { gt: 0 } } }),
  ]);
  const current = currentDay(days);
  const dayDeck = (d: DayRow) => {
    const vocabIds = stepsOf(d).filter((s) => s.kind === 'words').flatMap((s) => s.vocabIds ?? []);
    return { id: `day:${d.number}`, title: `Өдөр ${d.number}: ${d.title}`, titleJa: d.titleJa, count: vocabIds.length, done: !!d.progress[0]?.completedAt };
  };
  const studied = days.filter((d) => d.ready && (d.progress[0] || d.id === current?.id)).map(dayDeck).filter((d) => d.count > 0);
  res.json({
    today: current ? dayDeck(current) : null,
    studied: studied.reverse(),
    topics: topics.filter((t) => t.topic).map((t) => ({ id: `topic:${t.topic}`, title: t.topic, count: t._count._all })),
    special: [
      { id: 'learned', title: 'Сурсан бүх үг', count: await prisma.reviewItem.count({ where: { userId, itemType: 'vocab' } }) },
      { id: 'weak', title: 'Андуурдаг үгс', count: weak },
      { id: 'favorites', title: 'Дуртай үгс', count: favorites },
    ],
  });
});

programRouter.get('/flashcards', async (req, res) => {
  const userId = uid(req);
  const { deck } = validate(z.object({ deck: z.string().min(1).max(120) }), req.query);
  let where: { id?: { in: number[] }; topic?: string } = {};
  if (deck.startsWith('day:')) {
    const day = await prisma.programDay.findUnique({ where: { number: Number(deck.slice(4)) || 0 } });
    if (!day) throw notFound('Deck');
    where = { id: { in: stepsOf(day).filter((s) => s.kind === 'words').flatMap((s) => s.vocabIds ?? []) } };
  } else if (deck.startsWith('topic:')) {
    where = { topic: deck.slice(6) };
  } else if (deck === 'favorites') {
    const favs = await prisma.favorite.findMany({ where: { userId, vocabularyId: { not: null } }, select: { vocabularyId: true } });
    where = { id: { in: favs.map((f) => f.vocabularyId!) } };
  } else if (deck === 'weak' || deck === 'learned') {
    const items = await prisma.reviewItem.findMany({
      where: { userId, itemType: 'vocab', ...(deck === 'weak' ? { lapses: { gt: 0 } } : {}) },
      orderBy: deck === 'weak' ? { lapses: 'desc' } : { createdAt: 'desc' },
      take: 200,
      select: { vocabularyId: true },
    });
    where = { id: { in: items.map((i) => i.vocabularyId!).filter(Boolean) } };
  } else {
    throw new HttpError(400, 'Unknown deck');
  }
  const cards = await prisma.vocabulary.findMany({ where, orderBy: { id: 'asc' }, take: 300 });
  res.json({ cards });
});
