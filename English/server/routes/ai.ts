import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nowFor, parse, userId } from '../http';
import {
  conversationMessage,
  deleteThread,
  finishConversation,
  getThread,
  listThreads,
  scenarios,
  startConversation,
  tutorMessage,
} from '../ai/tutor';
import { AIRequestError, AIUnavailableError } from '../ai/provider';
import { HttpError } from '../http';

/** Stream a reply as server-sent events: `delta` chunks, then `done` (or `error`). */
async function sse(reply: FastifyReply, run: (send: (event: string, data: unknown) => void) => Promise<unknown>) {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const result = await run(send);
    send('done', result);
  } catch (err) {
    const message =
      err instanceof HttpError || err instanceof AIRequestError || err instanceof AIUnavailableError ? err.message : 'Something went wrong. Please try again.';
    send('error', { message });
  } finally {
    reply.raw.end();
  }
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const db = app.db;

  app.get('/ai/status', async () => ({ available: app.ai.available, model: app.ai.model }));

  app.get('/tutor/threads', async (req) => listThreads(db, userId(req), 'tutor'));
  app.get('/tutor/threads/:id', async (req) => getThread(db, userId(req), Number((req.params as { id: string }).id)));
  app.delete('/tutor/threads/:id', async (req) => {
    deleteThread(db, userId(req), Number((req.params as { id: string }).id));
    return { ok: true };
  });

  app.post('/tutor/message', async (req, reply) => {
    const body = parse(z.object({ threadId: z.number().int().nullable().optional(), message: z.string().min(1).max(4000) }), req.body);
    const uid = userId(req);
    await sse(reply, (send) => tutorMessage(db, app.ai, uid, body, nowFor(req), (text) => send('delta', { text })));
  });

  app.get('/conversation/scenarios', async () => ({ scenarios: scenarios(db), ai: app.ai.available }));
  app.get('/conversation/threads', async (req) => listThreads(db, userId(req), 'conversation'));
  app.get('/conversation/threads/:id', async (req) => getThread(db, userId(req), Number((req.params as { id: string }).id)));

  app.post('/conversation/start', async (req) => {
    const body = parse(z.object({ scenarioId: z.string().max(80) }), req.body);
    return startConversation(db, app.ai, userId(req), body.scenarioId, nowFor(req));
  });

  app.post('/conversation/:id/message', async (req, reply) => {
    const body = parse(z.object({ message: z.string().min(1).max(2000) }), req.body);
    const uid = userId(req);
    const id = Number((req.params as { id: string }).id);
    await sse(reply, (send) => conversationMessage(db, app.ai, uid, id, body.message, nowFor(req), (text) => send('delta', { text })));
  });

  app.post('/conversation/:id/finish', async (req) => finishConversation(db, app.ai, userId(req), Number((req.params as { id: string }).id), nowFor(req)));
}
