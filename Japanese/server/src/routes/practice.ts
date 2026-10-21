import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { notFound, validate } from '../lib/http.js';
import { parseJson } from '../lib/json.js';
import { localDate } from '../lib/dates.js';
import { bumpDaily } from '../lib/stats.js';
import { checkAchievements } from '../lib/achievements.js';
import { normalizeJapanese } from '../lib/grading.js';
import { publicQuestion } from '../lib/quiz.js';
import { uid } from '../middleware/auth.js';

export const practiceRouter = Router();

interface Token { s: string; r?: string; ro?: string; vocabId?: number; gloss?: string }
interface Sentence { tokens: Token[]; mn: string }

// ───────────── Stories ─────────────

practiceRouter.get('/stories', async (req, res) => {
  const userId = uid(req);
  const [stories, done] = await Promise.all([
    prisma.story.findMany({ orderBy: { order: 'asc' }, select: { id: true, slug: true, title: true, titleJa: true, topic: true, level: true, summary: true, sentences: true } }),
    prisma.activity.findMany({ where: { userId, type: 'story' }, select: { refId: true, score: true } }),
  ]);
  const best = new Map<string, number>();
  for (const d of done) best.set(d.refId, Math.max(best.get(d.refId) ?? 0, d.score ?? 0));
  res.json({
    stories: stories.map(({ sentences, ...s }) => ({
      ...s,
      sentenceCount: parseJson<Sentence[]>(sentences, []).length,
      completed: best.has(s.slug),
      bestScore: best.get(s.slug) ?? null,
    })),
  });
});

practiceRouter.get('/stories/:slug', async (req, res) => {
  const userId = uid(req);
  const story = await prisma.story.findUnique({
    where: { slug: String(req.params.slug) },
    include: { quiz: { select: { id: true } }, lesson: { select: { id: true, title: true } } },
  });
  if (!story) throw notFound('Story');
  const sentences = parseJson<Sentence[]>(story.sentences, []);
  const vocabIds = [...new Set(sentences.flatMap((s) => s.tokens.map((t) => t.vocabId).filter((v): v is number => !!v)))];
  const text = sentences.flatMap((s) => s.tokens.map((t) => t.s)).join('');
  const kanjiChars = [...new Set(text.match(/[一-龯]/g) ?? [])];
  const [vocabulary, kanji, completed] = await Promise.all([
    prisma.vocabulary.findMany({ where: { id: { in: vocabIds } }, select: { id: true, word: true, kana: true, romaji: true, meaning: true, meaningEn: true, partOfSpeech: true } }),
    prisma.kanji.findMany({ where: { char: { in: kanjiChars } }, select: { id: true, char: true, meaning: true, onyomi: true, kunyomi: true }, orderBy: { order: 'asc' } }),
    prisma.activity.findFirst({ where: { userId, type: 'story', refId: story.slug } }),
  ]);
  res.json({
    story: {
      ...story,
      sentences,
      grammarNotes: parseJson(story.grammarNotes, []),
      vocabulary,
      kanji,
      quizId: story.quiz?.id ?? null,
      completed: !!completed,
      quiz: undefined,
    },
  });
});

// ───────────── Listening ─────────────

practiceRouter.get('/listening', async (req, res) => {
  const userId = uid(req);
  const [items, attempts] = await Promise.all([
    prisma.listeningExercise.findMany({ orderBy: { order: 'asc' }, select: { id: true, slug: true, title: true, type: true, context: true, quiz: { select: { id: true, _count: { select: { questions: true } } } } } }),
    prisma.quizAttempt.findMany({ where: { userId, kind: 'listening' }, select: { quizId: true, percent: true } }),
  ]);
  const best = new Map<number, number>();
  for (const a of attempts) if (a.quizId) best.set(a.quizId, Math.max(best.get(a.quizId) ?? 0, a.percent));
  res.json({
    exercises: items.map(({ quiz, ...e }) => ({
      ...e,
      quizId: quiz?.id ?? null,
      questionCount: quiz?._count.questions ?? 0,
      bestScore: quiz ? best.get(quiz.id) ?? null : null,
    })),
  });
});

practiceRouter.get('/listening/:slug', async (req, res) => {
  const item = await prisma.listeningExercise.findUnique({
    where: { slug: String(req.params.slug) },
    include: { quiz: { include: { questions: { orderBy: { order: 'asc' }, include: { question: true } } } } },
  });
  if (!item) throw notFound('Listening exercise');
  const { quiz, ...rest } = item;
  res.json({
    exercise: {
      ...rest,
      // The script is the transcript: the client only reveals it after submission.
      script: parseJson(item.script, []),
      vocabulary: parseJson(item.vocabulary, []),
      quiz: quiz ? { id: quiz.id, title: quiz.title, questions: quiz.questions.map((q) => publicQuestion(q.question)) } : null,
    },
  });
});

// ───────────── Speaking ─────────────

interface Keyword { ja: string; alts?: string[]; mn: string }

practiceRouter.get('/speaking', async (req, res) => {
  const userId = uid(req);
  const [prompts, activity] = await Promise.all([
    prisma.speakingPrompt.findMany({ orderBy: { order: 'asc' } }),
    prisma.activity.findMany({ where: { userId, type: 'speaking' }, select: { refId: true, score: true } }),
  ]);
  const best = new Map<string, number>();
  for (const a of activity) best.set(a.refId, Math.max(best.get(a.refId) ?? 0, a.score ?? 0));
  res.json({
    prompts: prompts.map((p) => ({
      ...p,
      expected: parseJson<string[]>(p.expected, []),
      keywords: parseJson<Keyword[]>(p.keywords, []),
      bestScore: best.get(p.slug) ?? null,
    })),
  });
});

const speakSchema = z.object({ transcript: z.string().max(1000) });

practiceRouter.post('/speaking/:slug/attempt', async (req, res) => {
  const userId = uid(req);
  const { transcript } = validate(speakSchema, req.body);
  const prompt = await prisma.speakingPrompt.findUnique({ where: { slug: String(req.params.slug) } });
  if (!prompt) throw notFound('Speaking prompt');
  const keywords = parseJson<Keyword[]>(prompt.keywords, []);
  const heard = normalizeJapanese(transcript);
  const matched: Keyword[] = [];
  const missing: Keyword[] = [];
  for (const k of keywords) {
    const forms = [k.ja, ...(k.alts ?? [])].map(normalizeJapanese);
    (forms.some((f) => f && heard.includes(f)) ? matched : missing).push(k);
  }
  const score = keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0;
  const today = localDate(req);
  await prisma.activity.create({ data: { userId, type: 'speaking', refId: prompt.slug, score } });
  await bumpDaily(userId, today, { questions: 1, correct: score >= 60 ? 1 : 0 });
  const achievements = await checkAchievements(userId, today);
  res.json({ score, matched, missing, achievements });
});

// ───────────── Story completion ─────────────

practiceRouter.post('/stories/:slug/complete', async (req, res) => {
  const userId = uid(req);
  const { score } = validate(z.object({ score: z.number().int().min(0).max(100).optional() }), req.body ?? {});
  const story = await prisma.story.findUnique({ where: { slug: String(req.params.slug) }, select: { slug: true } });
  if (!story) throw notFound('Story');
  const today = localDate(req);
  const first = !(await prisma.activity.findFirst({ where: { userId, type: 'story', refId: story.slug } }));
  await prisma.activity.create({ data: { userId, type: 'story', refId: story.slug, score: score ?? null } });
  if (first) await bumpDaily(userId, today, { stories: 1 });
  const achievements = await checkAchievements(userId, today);
  res.json({ completed: true, achievements });
});
