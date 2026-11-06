import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createSession, destroySession, hashPassword, LoginLimiter, SESSION_COOKIE, verifyPassword } from '../auth';
import { badRequest, forbidden, HttpError, parse } from '../http';
import { createUser, userCount } from '../services/users';

const credentials = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(40).regex(/^[a-zA-Z0-9_.-]+$/, 'Use letters, numbers, dot, dash or underscore'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});
const signup = credentials.extend({ displayName: z.string().trim().min(1).max(60) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const limiter = new LoginLimiter();
  const cookieOpts = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: false, maxAge: app.appConfig.sessionDays * 86400 };

  function startSession(reply: FastifyReply, userId: number) {
    const token = createSession(app.db, userId, app.appConfig.sessionDays);
    reply.setCookie(SESSION_COOKIE, token, cookieOpts);
  }

  app.get('/auth/status', async (req) => ({
    needsSetup: userCount(app.db) === 0,
    allowRegistration: app.appConfig.allowRegistration,
    user: req.user,
    ai: { available: app.ai.available, model: app.ai.model },
  }));

  // First launch: the first account becomes the administrator.
  app.post('/auth/setup', async (req, reply) => {
    if (userCount(app.db) > 0) throw forbidden('Setup is already complete. Please sign in.');
    const body = parse(signup, req.body);
    const id = createUser(app.db, { ...body, role: 'admin' });
    startSession(reply, id);
    return { ok: true };
  });

  app.post('/auth/register', async (req, reply) => {
    if (!app.appConfig.allowRegistration) throw forbidden('Registration is disabled.');
    const body = parse(signup, req.body);
    if (app.db.prepare('SELECT 1 FROM users WHERE username = ?').get(body.username)) throw badRequest('That username is taken.');
    const id = createUser(app.db, { ...body, role: 'learner' });
    startSession(reply, id);
    return { ok: true };
  });

  app.post('/auth/login', async (req, reply) => {
    const body = parse(z.object({ username: z.string().trim().min(1), password: z.string().min(1) }), req.body);
    const key = `${req.ip}:${body.username.toLowerCase()}`;
    if (limiter.blocked(key)) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.');
    const user = app.db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(body.username) as { id: number; password_hash: string } | undefined;
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      limiter.fail(key);
      throw new HttpError(401, 'Wrong username or password.');
    }
    limiter.reset(key);
    startSession(reply, user.id);
    return { ok: true };
  });

  app.post('/auth/logout', async (req, reply) => {
    destroySession(app.db, req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/auth/password', async (req) => {
    if (!req.user) throw new HttpError(401, 'Not signed in');
    const body = parse(z.object({ current: z.string().min(1), next: credentials.shape.password }), req.body);
    const row = app.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id) as { password_hash: string };
    if (!verifyPassword(body.current, row.password_hash)) throw badRequest('Your current password is not correct.');
    app.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.next), req.user.id);
    return { ok: true };
  });
}
