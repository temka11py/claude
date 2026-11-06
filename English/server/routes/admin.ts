import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../http';
import { COURSE_LEVELS } from '@shared/cefr';
import {
  adminModuleDoc,
  adminModules,
  contentStats,
  deleteModule,
  moduleTemplate,
  reimport,
  saveModuleDoc,
  setModuleStatus,
  validateDoc,
} from '../services/admin';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const db = app.db;
  const config = app.appConfig;

  app.get('/stats', async () => ({ ...contentStats(db), writeBack: config.contentWriteBack }));
  app.get('/modules', async () => adminModules(db));
  app.get('/modules/:id', async (req) => adminModuleDoc(db, (req.params as { id: string }).id));

  app.post('/modules', async (req) => {
    const body = parse(
      z.object({
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes'),
        level: z.enum(COURSE_LEVELS),
        order: z.number().int().min(1).max(99),
        title: z.string().trim().min(2).max(120),
        topic: z.string().trim().min(2).max(80),
        description: z.string().trim().max(500).optional(),
      }),
      req.body,
    );
    return saveModuleDoc(db, config, moduleTemplate(body), { create: true });
  });

  app.put('/modules/:id', async (req) => saveModuleDoc(db, config, (req.body as { doc: unknown }).doc));

  app.post('/modules/:id/status', async (req) => {
    const body = parse(z.object({ status: z.enum(['draft', 'published']) }), req.body);
    return setModuleStatus(db, config, (req.params as { id: string }).id, body.status);
  });

  app.delete('/modules/:id', async (req) => {
    deleteModule(db, config, (req.params as { id: string }).id);
    return { ok: true };
  });

  app.post('/validate', async (req) => {
    const r = validateDoc((req.body as { doc: unknown }).doc);
    return { valid: !!r.doc, error: r.error ?? null, lint: r.lint };
  });

  app.post('/reimport', async () => reimport(db, config));
}
