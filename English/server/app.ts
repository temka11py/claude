import fs from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { DB } from './db';
import type { AppConfig } from './config';
import type { AIProvider } from './ai/provider';
import { AIRequestError, AIUnavailableError } from './ai/provider';
import { SESSION_COOKIE, userForToken, type SessionUser } from './auth';
import { HttpError } from './http';
import { authRoutes } from './routes/auth';
import { learnerRoutes } from './routes/learner';
import { vocabRoutes } from './routes/vocab';
import { assessmentRoutes } from './routes/assessments';
import { practiceRoutes } from './routes/practice';
import { reportRoutes } from './routes/reports';
import { aiRoutes } from './routes/ai';
import { adminRoutes } from './routes/admin';
import { speechRoutes } from './routes/speech';
import type { SpeechService } from './services/speech';

declare module 'fastify' {
  interface FastifyInstance {
    db: DB;
    ai: AIProvider;
    appConfig: AppConfig;
    /** Natural voices; absent in tests and when turned off. */
    speech: SpeechService | null;
  }
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    await reply.code(401).send({ error: 'Not signed in' });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    await reply.code(401).send({ error: 'Not signed in' });
    return;
  }
  if (req.user.role !== 'admin') await reply.code(403).send({ error: 'Admin access required' });
}

export async function buildApp(opts: { db: DB; config: AppConfig; ai: AIProvider; speech?: SpeechService; logger?: boolean }): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 2 * 1024 * 1024, trustProxy: false });
  app.decorate('db', opts.db);
  app.decorate('ai', opts.ai);
  app.decorate('appConfig', opts.config);
  app.decorate('speech', opts.speech ?? null);
  app.decorateRequest('user', null);

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: opts.config.maxRecordingBytes, files: 1, fields: 20 } });

  app.addHook('onRequest', async (req) => {
    req.user = userForToken(opts.db, req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message, details: err.details });
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Invalid request', details: err.issues });
    if (err instanceof AIUnavailableError) return reply.code(503).send({ error: err.message, code: 'ai_unavailable' });
    if (err instanceof AIRequestError) return reply.code(502).send({ error: err.message, code: 'ai_error' });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on the server. Please try again.' });
  });

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ ok: true }));
      await api.register(authRoutes);
      await api.register(async (secured) => {
        secured.addHook('preHandler', requireUser);
        await secured.register(learnerRoutes);
        await secured.register(vocabRoutes);
        await secured.register(assessmentRoutes);
        await secured.register(practiceRoutes);
        await secured.register(reportRoutes);
        await secured.register(aiRoutes);
        await secured.register(speechRoutes);
      });
      await api.register(async (admin) => {
        admin.addHook('preHandler', requireAdmin);
        await admin.register(adminRoutes, { prefix: '/admin' });
      });
      api.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Not found' }));
    },
    { prefix: '/api' },
  );

  // Serve the built front-end (npm run build) with SPA fallback.
  if (fs.existsSync(opts.config.distDir)) {
    await app.register(fastifyStatic, { root: opts.config.distDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
