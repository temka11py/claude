import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound, nowFor, parse, userId } from '../http';
import {
  dictationSet,
  grammarReviewSet,
  practiceLibrary,
  shadowingSet,
  speakingHistory,
  submitSpeaking,
  submitWriting,
  writingHistory,
} from '../services/practice';
import { listeningMaterial, pronunciationTopic, readingMaterial, speakingTask, speechRate, writingTask } from '../services/lessons';
import { gameList, gameRound, recordGameResult } from '../services/games';
import { submitChallenge, todayChallenge } from '../services/challenge';

const AUDIO_TYPES: Record<string, string> = { 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav' };

const speakingFields = z.object({
  taskId: z.string().max(200).nullable().optional(),
  transcript: z.string().max(10000).nullable().optional(),
  durationSec: z.coerce.number().min(0).max(1200).nullable().optional(),
  selfRating: z.coerce.number().min(0).max(1).nullable().optional(),
  context: z.string().max(100).default('practice'),
  prompt: z.string().max(1000).nullable().optional(),
});

export async function practiceRoutes(app: FastifyInstance): Promise<void> {
  const db = app.db;
  const recordingsDir = app.appConfig.recordingsDir;

  app.get('/practice/library', async (req) => practiceLibrary(db, userId(req)));

  app.get('/practice/dictation', async (req) => {
    const q = parse(z.object({ count: z.coerce.number().int().min(1).max(15).default(5) }), req.query);
    return dictationSet(db, userId(req), q.count, `${userId(req)}:${nowFor(req).getTime()}`);
  });

  app.get('/practice/shadowing', async (req) => {
    const q = parse(z.object({ count: z.coerce.number().int().min(1).max(12).default(4) }), req.query);
    return shadowingSet(db, userId(req), q.count, `${userId(req)}:${nowFor(req).getTime()}`);
  });

  app.get('/practice/grammar', async (req) => {
    const q = parse(z.object({ count: z.coerce.number().int().min(1).max(20).default(8) }), req.query);
    return { questions: grammarReviewSet(db, userId(req), q.count, `${userId(req)}:${nowFor(req).getTime()}`) };
  });

  app.get('/practice/listening/:id', async (req) => {
    const m = listeningMaterial(db, (req.params as { id: string }).id);
    if (!m) throw notFound('Listening not found');
    const difficulty = db.prepare(`SELECT difficulty FROM skill_profile WHERE user_id = ? AND skill = 'listening'`).pluck().get(userId(req)) as number | null;
    return { material: m, rate: speechRate(m.level, difficulty) };
  });

  app.get('/practice/reading/:id', async (req) => {
    const m = readingMaterial(db, (req.params as { id: string }).id);
    if (!m) throw notFound('Reading not found');
    return { material: m };
  });

  app.get('/practice/speaking/:id', async (req) => {
    const t = speakingTask(db, (req.params as { id: string }).id);
    if (!t) throw notFound('Speaking task not found');
    return { task: t };
  });

  app.get('/practice/writing/:id', async (req) => {
    const t = writingTask(db, (req.params as { id: string }).id);
    if (!t) throw notFound('Writing task not found');
    return { task: t };
  });

  app.get('/practice/pronunciation/:id', async (req) => {
    const t = pronunciationTopic(db, (req.params as { id: string }).id);
    if (!t) throw notFound('Pronunciation topic not found');
    return { topic: t };
  });

  app.post('/writing/submit', async (req) => {
    const body = parse(
      z.object({
        taskId: z.string().max(200).nullable().optional(),
        text: z.string().max(10000),
        context: z.string().max(100).default('practice'),
        prompt: z.string().max(1000).nullable().optional(),
        minutes: z.number().min(0).max(120).optional(),
      }),
      req.body,
    );
    return submitWriting(db, app.ai, userId(req), body, nowFor(req));
  });

  app.get('/writing/history', async (req) => writingHistory(db, userId(req), (req.query as { taskId?: string }).taskId));

  /** Speaking: multipart (audio + fields) or JSON (transcript only). */
  app.post('/speaking/submit', async (req: FastifyRequest) => {
    const uid = userId(req);
    let fields: Record<string, unknown> = {};
    let audioPath: string | null = null;
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const base = part.mimetype.split(';')[0];
          const ext = AUDIO_TYPES[base];
          if (!ext) {
            part.file.resume();
            throw badRequest('Unsupported audio format.');
          }
          fs.mkdirSync(path.join(recordingsDir, String(uid)), { recursive: true });
          const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
          const full = path.join(recordingsDir, String(uid), name);
          await pipeline(part.file, fs.createWriteStream(full));
          if (part.file.truncated) {
            fs.rmSync(full, { force: true });
            throw badRequest('The recording is too large.');
          }
          audioPath = path.join(String(uid), name);
        } else {
          fields[part.fieldname] = part.value === '' ? null : part.value;
        }
      }
    } else {
      fields = (req.body as Record<string, unknown>) ?? {};
    }
    const body = parse(speakingFields, fields);
    return submitSpeaking(db, app.ai, uid, { ...body, audioPath }, nowFor(req));
  });

  app.get('/speaking/history', async (req) => speakingHistory(db, userId(req), (req.query as { taskId?: string }).taskId));

  app.get('/speaking/audio/:id', async (req, reply) => {
    const row = db.prepare('SELECT audio_path FROM speaking_attempts WHERE id = ? AND user_id = ?').get(Number((req.params as { id: string }).id), userId(req)) as
      | { audio_path: string | null }
      | undefined;
    if (!row?.audio_path) throw notFound('Recording not found');
    const full = path.resolve(recordingsDir, row.audio_path);
    if (!full.startsWith(path.resolve(recordingsDir)) || !fs.existsSync(full)) throw notFound('Recording not found');
    const ext = path.extname(full);
    const type = Object.entries(AUDIO_TYPES).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
    return reply.type(type).send(fs.createReadStream(full));
  });

  // Games.
  app.get('/games', async (req) => gameList(db, userId(req)));
  app.get('/games/:id/round', async (req) => gameRound(db, userId(req), (req.params as { id: string }).id, nowFor(req)));
  app.post('/games/:id/result', async (req) => {
    const body = parse(
      z.object({
        correct: z.number().int().min(0).max(200),
        total: z.number().int().min(1).max(200),
        words: z.array(z.object({ vocabId: z.string().max(200), correct: z.boolean() })).max(100).optional(),
        grammar: z.array(z.object({ questionId: z.string().max(200), correct: z.boolean(), qtype: z.string().max(20) })).max(50).optional(),
        minutes: z.number().min(0).max(60).optional(),
      }),
      req.body,
    );
    return recordGameResult(db, userId(req), (req.params as { id: string }).id, body, nowFor(req));
  });

  // Daily challenge.
  app.get('/challenge/today', async (req) => todayChallenge(db, userId(req), nowFor(req)));
  app.post('/challenge/today', async (req) => {
    const body = parse(
      z.object({ text: z.string().max(5000).optional(), corrections: z.array(z.string().max(600)).max(10).optional(), durationSec: z.number().min(0).max(600).optional() }),
      req.body,
    );
    return submitChallenge(db, userId(req), body, nowFor(req));
  });
}
