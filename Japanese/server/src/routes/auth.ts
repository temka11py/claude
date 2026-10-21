import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AUTH_COOKIE, cookieOptions, signToken } from '../lib/auth.js';
import { HttpError, validate } from '../lib/http.js';
import { localDate } from '../lib/dates.js';
import { getStreak } from '../lib/stats.js';
import { requireAuth, uid } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const authRouter = Router();

const AVATARS = ['花', '桜', '山', '海', '月', '星', '猫', '犬', '竹', '空'];

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  avatar: z.enum(AVATARS as [string, ...string[]]).optional(),
});

const limiter = rateLimit({ windowMs: 15 * 60_000, max: 20 });

async function publicUser(userId: string, today: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, avatar: true, createdAt: true, settings: true },
  });
  if (!user) return null;
  const streak = await getStreak(userId, today);
  return { ...user, streak: streak.current };
}

authRouter.post('/register', limiter, async (req, res) => {
  const body = validate(registerSchema, req.body);
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) throw new HttpError(409, 'Email is already registered');
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash,
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      settings: { create: {} },
    },
  });
  res.cookie(AUTH_COOKIE, signToken(user.id), cookieOptions);
  res.status(201).json({ user: await publicUser(user.id, localDate(req)) });
});

authRouter.post('/login', limiter, async (req, res) => {
  const body = validate(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  const ok = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
  res.cookie(AUTH_COOKIE, signToken(user.id), cookieOptions);
  res.json({ user: await publicUser(user.id, localDate(req)) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await publicUser(uid(req), localDate(req));
  if (!user) throw new HttpError(401, 'Authentication required');
  res.json({ user });
});

authRouter.patch('/profile', requireAuth, async (req, res) => {
  const body = validate(profileSchema, req.body);
  await prisma.user.update({ where: { id: uid(req) }, data: body });
  res.json({ user: await publicUser(uid(req), localDate(req)), avatars: AVATARS });
});

authRouter.get('/avatars', (_req, res) => {
  res.json({ avatars: AVATARS });
});
