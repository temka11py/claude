import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound, validate } from '../lib/http.js';
import { schedule, previewIntervals, type Rating } from '../lib/srs.js';
import { assertItemExists, ensureReviewItems, itemKey, ITEM_TYPES, reviewInclude, toCard, type ItemType } from '../lib/review.js';
import { localDate } from '../lib/dates.js';
import { bumpDaily } from '../lib/stats.js';
import { checkAchievements } from '../lib/achievements.js';
import { uid } from '../middleware/auth.js';

export const reviewRouter = Router();

const typesParam = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter((t): t is ItemType => (ITEM_TYPES as string[]).includes(t)) : []));

reviewRouter.get('/summary', async (req, res) => {
  const userId = uid(req);
  const now = new Date();
  const [grouped, due, nextDue] = await Promise.all([
    prisma.reviewItem.groupBy({ by: ['state', 'itemType'], where: { userId }, _count: { _all: true } }),
    prisma.reviewItem.groupBy({ by: ['itemType'], where: { userId, dueAt: { lte: now } }, _count: { _all: true } }),
    prisma.reviewItem.findFirst({ where: { userId, dueAt: { gt: now } }, orderBy: { dueAt: 'asc' }, select: { dueAt: true } }),
  ]);
  const byState: Record<string, number> = { new: 0, learning: 0, review: 0, mastered: 0 };
  const byType: Record<string, number> = { vocab: 0, kanji: 0, grammar: 0, kana: 0 };
  for (const g of grouped) {
    byState[g.state] = (byState[g.state] ?? 0) + g._count._all;
    byType[g.itemType] = (byType[g.itemType] ?? 0) + g._count._all;
  }
  const dueByType = Object.fromEntries(due.map((d) => [d.itemType, d._count._all]));
  res.json({
    dueNow: due.reduce((s, d) => s + d._count._all, 0),
    dueByType,
    byState,
    byType,
    total: Object.values(byType).reduce((a, b) => a + b, 0),
    nextDueAt: nextDue?.dueAt ?? null,
  });
});

reviewRouter.get('/due', async (req, res) => {
  const userId = uid(req);
  const { limit, types } = validate(z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), types: typesParam }), req.query);
  const where: Prisma.ReviewItemWhereInput = { userId, dueAt: { lte: new Date() } };
  if (types.length) where.itemType = { in: types };
  const pool = await prisma.reviewItem.findMany({ where, orderBy: { dueAt: 'asc' }, take: 300, include: reviewInclude });
  // learning cards first (time-sensitive), then reviews, then brand-new cards
  const rank: Record<string, number> = { learning: 0, review: 1, mastered: 1, new: 2 };
  const items = pool.sort((a, b) => rank[a.state] - rank[b.state] || a.dueAt.getTime() - b.dueAt.getTime()).slice(0, limit);
  const now = new Date();
  res.json({ items: items.map((i) => ({ ...toCard(i), preview: previewIntervals(i, now) })) });
});

reviewRouter.get('/items', async (req, res) => {
  const userId = uid(req);
  const { state, types, limit } = validate(
    z.object({ state: z.enum(['new', 'learning', 'review', 'mastered']).optional(), types: typesParam, limit: z.coerce.number().int().min(1).max(500).default(200) }),
    req.query,
  );
  const where: Prisma.ReviewItemWhereInput = { userId, state };
  if (types.length) where.itemType = { in: types };
  const items = await prisma.reviewItem.findMany({ where, orderBy: { dueAt: 'asc' }, take: limit, include: reviewInclude });
  res.json({ items: items.map(toCard) });
});

const rateSchema = z.object({ reviewItemId: z.number().int().positive(), rating: z.enum(['again', 'hard', 'good', 'easy']) });

reviewRouter.post('/', async (req, res) => {
  const userId = uid(req);
  const { reviewItemId, rating } = validate(rateSchema, req.body);
  const item = await prisma.reviewItem.findFirst({ where: { id: reviewItemId, userId } });
  if (!item) throw notFound('Review item');
  const next = schedule(item, rating as Rating);
  const correct = rating !== 'again';
  const updated = await prisma.reviewItem.update({
    where: { id: item.id },
    data: {
      state: next.state,
      step: next.step,
      ease: next.ease,
      intervalDays: next.intervalDays,
      reps: next.reps,
      lapses: next.lapses,
      dueAt: next.dueAt,
      lastReviewedAt: new Date(),
      totalCount: { increment: 1 },
      correctCount: { increment: correct ? 1 : 0 },
    },
  });
  const today = localDate(req);
  await bumpDaily(userId, today, {
    reviews: 1,
    vocab: item.itemType === 'vocab' ? 1 : 0,
    kanji: item.itemType === 'kanji' ? 1 : 0,
  });
  const achievements = await checkAchievements(userId, today);
  res.json({ item: { id: updated.id, state: updated.state, dueAt: updated.dueAt, intervalDays: updated.intervalDays }, achievements });
});

const itemSchema = z.object({ itemType: z.enum(['vocab', 'kanji', 'grammar', 'kana']), itemId: z.number().int().positive() });

/** "Review" button — put an item into the deck, due now. */
reviewRouter.post('/add', async (req, res) => {
  const userId = uid(req);
  const { itemType, itemId } = validate(itemSchema, req.body);
  if (!(await assertItemExists(itemType, itemId))) throw notFound('Item');
  const key = itemKey(itemType, itemId);
  const existing = await prisma.reviewItem.findUnique({ where: { userId_key: { userId, key } } });
  if (existing) {
    const item = await prisma.reviewItem.update({ where: { id: existing.id }, data: { dueAt: new Date() } });
    res.json({ state: item.state, added: false });
    return;
  }
  await ensureReviewItems(userId, [{ type: itemType, id: itemId }]);
  res.status(201).json({ state: 'new', added: true });
});

/** "Known" button — the learner already knows this item; schedule it for a later check. */
reviewRouter.post('/known', async (req, res) => {
  const userId = uid(req);
  const { itemType, itemId } = validate(itemSchema, req.body);
  if (!(await assertItemExists(itemType, itemId))) throw notFound('Item');
  const key = itemKey(itemType, itemId);
  await ensureReviewItems(userId, [{ type: itemType, id: itemId }]);
  const interval = 7;
  const item = await prisma.reviewItem.update({
    where: { userId_key: { userId, key } },
    data: { state: 'review', step: 0, intervalDays: interval, dueAt: new Date(Date.now() + interval * 86_400_000), reps: { increment: 1 }, lastReviewedAt: new Date() },
  });
  const today = localDate(req);
  await bumpDaily(userId, today, { vocab: itemType === 'vocab' ? 1 : 0, kanji: itemType === 'kanji' ? 1 : 0 });
  const achievements = await checkAchievements(userId, today);
  res.json({ state: item.state, achievements });
});
