import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound, validate } from '../lib/http.js';
import { parseJson } from '../lib/json.js';
import { uid } from '../middleware/auth.js';

export const libraryRouter = Router();

/** Map of review-item key → state, used to decorate library lists. */
async function reviewStates(userId: string, type: string) {
  const rows = await prisma.reviewItem.findMany({ where: { userId, itemType: type }, select: { key: true, state: true } });
  return new Map(rows.map((r) => [r.key, r.state]));
}

async function favoriteKeys(userId: string) {
  const rows = await prisma.favorite.findMany({ where: { userId }, select: { key: true } });
  return new Set(rows.map((r) => r.key));
}

// ───────────── Kana ─────────────

libraryRouter.get('/kana', async (req, res) => {
  const { script } = validate(z.object({ script: z.enum(['hiragana', 'katakana']) }), req.query);
  const [kana, states] = await Promise.all([
    prisma.kana.findMany({ where: { script }, orderBy: { order: 'asc' } }),
    reviewStates(uid(req), 'kana'),
  ]);
  res.json({ kana: kana.map((k) => ({ ...k, state: states.get(`kana:${k.id}`) ?? null })) });
});

// ───────────── Vocabulary ─────────────

const vocabQuery = z.object({
  q: z.string().trim().max(50).optional(),
  lessonId: z.coerce.number().int().positive().optional(),
  topic: z.string().max(40).optional(),
  pos: z.string().max(40).optional(),
  filter: z.enum(['all', 'favorites', 'learned', 'new']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(60),
});

libraryRouter.get('/vocabulary', async (req, res) => {
  const userId = uid(req);
  const query = validate(vocabQuery, req.query);
  const [states, favorites] = await Promise.all([reviewStates(userId, 'vocab'), favoriteKeys(userId)]);
  const where: Prisma.VocabularyWhereInput = {
    lessonId: query.lessonId,
    topic: query.topic || undefined,
    partOfSpeech: query.pos || undefined,
  };
  if (query.q) {
    where.OR = [
      { word: { contains: query.q } },
      { kana: { contains: query.q } },
      { romaji: { contains: query.q.toLowerCase() } },
      { meaning: { contains: query.q } },
      { meaningEn: { contains: query.q } },
    ];
  }
  if (query.filter === 'favorites') where.favorites = { some: { userId } };
  if (query.filter === 'learned') where.reviewItems = { some: { userId, state: { in: ['review', 'mastered'] } } };
  if (query.filter === 'new') where.reviewItems = { none: { userId, state: { in: ['review', 'mastered'] } } };

  const [total, items, topics] = await Promise.all([
    prisma.vocabulary.count({ where }),
    prisma.vocabulary.findMany({
      where,
      orderBy: [{ lessonId: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { kanji: { select: { id: true, char: true, meaning: true } }, lesson: { select: { id: true, title: true } } },
    }),
    prisma.vocabulary.findMany({ distinct: ['topic'], select: { topic: true }, orderBy: { topic: 'asc' } }),
  ]);
  res.json({
    total,
    page: query.page,
    pageSize: query.pageSize,
    topics: topics.map((t) => t.topic).filter(Boolean),
    items: items.map((v) => ({ ...v, state: states.get(`vocab:${v.id}`) ?? null, favorite: favorites.has(`vocab:${v.id}`) })),
  });
});

libraryRouter.get('/vocabulary/:id', async (req, res) => {
  const userId = uid(req);
  const id = validate(z.coerce.number().int().positive(), req.params.id);
  const v = await prisma.vocabulary.findUnique({
    where: { id },
    include: { kanji: { select: { id: true, char: true, meaning: true, onyomi: true, kunyomi: true } }, lesson: { select: { id: true, title: true } } },
  });
  if (!v) throw notFound('Vocabulary');
  const [review, fav] = await Promise.all([
    prisma.reviewItem.findUnique({ where: { userId_key: { userId, key: `vocab:${id}` } }, select: { state: true } }),
    prisma.favorite.findUnique({ where: { userId_key: { userId, key: `vocab:${id}` } } }),
  ]);
  res.json({ item: { ...v, state: review?.state ?? null, favorite: !!fav } });
});

// ───────────── Kanji ─────────────

libraryRouter.get('/kanji', async (req, res) => {
  const userId = uid(req);
  const [kanji, states, favorites] = await Promise.all([
    prisma.kanji.findMany({ orderBy: { order: 'asc' }, include: { lesson: { select: { id: true, title: true } } } }),
    reviewStates(userId, 'kanji'),
    favoriteKeys(userId),
  ]);
  res.json({
    kanji: kanji.map((k) => ({
      ...k,
      examples: parseJson(k.examples, []),
      sentences: parseJson(k.sentences, []),
      state: states.get(`kanji:${k.id}`) ?? null,
      favorite: favorites.has(`kanji:${k.id}`),
    })),
  });
});

libraryRouter.get('/kanji/:key', async (req, res) => {
  const userId = uid(req);
  const key = String(req.params.key);
  const id = Number(key);
  const k = await prisma.kanji.findFirst({
    where: Number.isInteger(id) && id > 0 ? { id } : { char: key },
    include: {
      lesson: { select: { id: true, title: true } },
      vocabulary: { select: { id: true, word: true, kana: true, meaning: true }, take: 12 },
    },
  });
  if (!k) throw notFound('Kanji');
  const [review, fav] = await Promise.all([
    prisma.reviewItem.findUnique({ where: { userId_key: { userId, key: `kanji:${k.id}` } }, select: { state: true } }),
    prisma.favorite.findUnique({ where: { userId_key: { userId, key: `kanji:${k.id}` } } }),
  ]);
  res.json({ item: { ...k, examples: parseJson(k.examples, []), sentences: parseJson(k.sentences, []), state: review?.state ?? null, favorite: !!fav } });
});

// ───────────── Grammar ─────────────

libraryRouter.get('/grammar', async (req, res) => {
  const userId = uid(req);
  const [grammar, states] = await Promise.all([
    prisma.grammar.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, slug: true, title: true, meaning: true, structure: true, category: true, order: true, lesson: { select: { id: true, title: true, module: { select: { order: true } } } }, _count: { select: { questions: true } } },
    }),
    reviewStates(userId, 'grammar'),
  ]);
  res.json({ grammar: grammar.map((g) => ({ ...g, state: states.get(`grammar:${g.id}`) ?? null })) });
});

libraryRouter.get('/grammar/:slug', async (req, res) => {
  const userId = uid(req);
  const g = await prisma.grammar.findUnique({
    where: { slug: String(req.params.slug) },
    include: { lesson: { select: { id: true, title: true } }, _count: { select: { questions: true } } },
  });
  if (!g) throw notFound('Grammar point');
  const [related, review] = await Promise.all([
    prisma.grammar.findMany({ where: { category: g.category, id: { not: g.id } }, select: { slug: true, title: true, meaning: true }, orderBy: { order: 'asc' }, take: 6 }),
    prisma.reviewItem.findUnique({ where: { userId_key: { userId, key: `grammar:${g.id}` } }, select: { state: true } }),
  ]);
  res.json({ item: { ...g, examples: parseJson(g.examples, []), mistakes: parseJson(g.mistakes, []), state: review?.state ?? null }, related });
});

// ───────────── Favorites ─────────────

const favSchema = z.object({ itemType: z.enum(['vocab', 'kanji']), itemId: z.number().int().positive() });

libraryRouter.post('/favorites/toggle', async (req, res) => {
  const userId = uid(req);
  const { itemType, itemId } = validate(favSchema, req.body);
  const exists = itemType === 'vocab'
    ? await prisma.vocabulary.findUnique({ where: { id: itemId }, select: { id: true } })
    : await prisma.kanji.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!exists) throw notFound(itemType === 'vocab' ? 'Vocabulary' : 'Kanji');
  const key = `${itemType}:${itemId}`;
  const current = await prisma.favorite.findUnique({ where: { userId_key: { userId, key } } });
  if (current) {
    await prisma.favorite.delete({ where: { id: current.id } });
    res.json({ favorite: false });
    return;
  }
  await prisma.favorite.create({ data: { userId, key, ...(itemType === 'vocab' ? { vocabularyId: itemId } : { kanjiId: itemId }) } });
  res.json({ favorite: true });
});
