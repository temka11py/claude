import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../lib/http.js';
import { uid } from '../middleware/auth.js';

export const settingsRouter = Router();

const settingsSchema = z
  .object({
    language: z.enum(['mn', 'en']),
    showRomaji: z.boolean(),
    showFurigana: z.boolean(),
    dailyGoalMinutes: z.number().int().min(5).max(180),
    autoplayAudio: z.boolean(),
    speechRate: z.number().min(0.5).max(1.5),
    theme: z.enum(['light', 'dark']),
  })
  .partial();

settingsRouter.get('/', async (req, res) => {
  const userId = uid(req);
  const settings = await prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
  res.json({ settings });
});

settingsRouter.put('/', async (req, res) => {
  const userId = uid(req);
  const data = validate(settingsSchema, req.body);
  const settings = await prisma.userSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  res.json({ settings });
});
