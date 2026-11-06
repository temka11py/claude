import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { COURSE_LEVELS, type CourseLevel } from '@shared/cefr';
import { badRequest, nowFor, parse, userId } from '../http';
import {
  acceptPlacement,
  latestPlacement,
  startLevelExam,
  startModuleTest,
  startPlacement,
  submitPlacement,
  submitTest,
  testHistory,
  testResult,
} from '../services/assessments';

const answerValue = z.union([z.number(), z.string().max(2000), z.array(z.string().max(2000)).max(20), z.null()]);
const submitBody = z.object({
  answers: z.record(answerValue).default({}),
  writing: z.object({ text: z.string().max(10000) }).nullable().optional(),
  speaking: z
    .object({
      transcript: z.string().max(10000).nullable().optional(),
      durationSec: z.number().min(0).max(1200).nullable().optional(),
      selfRating: z.number().min(0).max(1).nullable().optional(),
      attemptId: z.number().int().nullable().optional(),
    })
    .nullable()
    .optional(),
  minutes: z.number().min(0).max(240).optional(),
});

export async function assessmentRoutes(app: FastifyInstance): Promise<void> {
  const db = app.db;

  app.post('/modules/:id/test', async (req) => {
    const body = parse(z.object({ fresh: z.boolean().optional() }).default({}), req.body ?? {});
    return startModuleTest(db, userId(req), (req.params as { id: string }).id, nowFor(req), body);
  });

  app.post('/levels/:code/exam', async (req) => {
    const code = decodeURIComponent((req.params as { code: string }).code) as CourseLevel;
    if (!COURSE_LEVELS.includes(code)) throw badRequest('Unknown level');
    const body = parse(z.object({ fresh: z.boolean().optional() }).default({}), req.body ?? {});
    return startLevelExam(db, userId(req), code, nowFor(req), body);
  });

  app.post('/tests/:attemptId/submit', async (req) => submitTest(db, app.ai, userId(req), Number((req.params as { attemptId: string }).attemptId), parse(submitBody, req.body), nowFor(req)));

  app.get('/tests/:attemptId/result', async (req) => testResult(db, userId(req), Number((req.params as { attemptId: string }).attemptId)));

  app.get('/tests/history', async (req) => testHistory(db, userId(req)));

  app.get('/placement', async (req) => startPlacement(db, userId(req), nowFor(req)));

  app.get('/placement/latest', async (req) => ({ result: latestPlacement(db, userId(req)) }));

  app.post('/placement/:attemptId/submit', async (req) =>
    submitPlacement(db, app.ai, userId(req), Number((req.params as { attemptId: string }).attemptId), parse(submitBody, req.body), nowFor(req)),
  );

  app.post('/placement/accept', async (req) => {
    const body = parse(z.object({ level: z.enum(COURSE_LEVELS) }), req.body);
    return acceptPlacement(db, userId(req), body.level, nowFor(req));
  });

  app.post('/placement/skip', async (req) => acceptPlacement(db, userId(req), 'B1', nowFor(req), true));
}
