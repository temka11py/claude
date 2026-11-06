import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound, nowFor, parse, userId } from '../http';
import { XP } from '@shared/gamification';
import { getSettings } from '../services/users';
import {
  createCustomWord,
  deleteCustomWord,
  getCard,
  gradeWord,
  introduceWords,
  listWords,
  reviewQueue,
  updateCustomWord,
  vocabCounts,
  vocabRow,
  wordView,
} from '../services/vocab';
import { checkCorrection, dueErrors, errorExercise, errorStats, listErrors, reviewError } from '../services/errors';
import { awardXp, logActivity } from '../services/activity';

const customWord = z.object({
  word: z.string().trim().min(1).max(80),
  pos: z.string().trim().max(40).nullable().optional(),
  ipa: z.string().trim().max(80).nullable().optional(),
  definition: z.string().trim().min(1).max(400),
  mongolian: z.string().trim().max(200).nullable().optional(),
  example: z.string().trim().max(400).nullable().optional(),
  note: z.string().trim().max(600).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  level: z.enum(['A2', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C1+']).optional(),
});

export async function vocabRoutes(app: FastifyInstance): Promise<void> {
  const db = app.db;

  app.get('/vocab', async (req) => {
    const q = parse(
      z.object({
        q: z.string().max(80).optional(),
        state: z.enum(['NEW', 'LEARNING', 'FAMILIAR', 'MASTERED', 'REVIEW', 'due', 'custom', 'difficult']).optional(),
        level: z.string().max(10).optional(),
        moduleId: z.string().max(40).optional(),
        scope: z.enum(['mine', 'course']).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      }),
      req.query,
    );
    const uid = userId(req);
    const now = nowFor(req);
    return listWords(db, uid, q, now, getSettings(db, uid).schedule);
  });

  app.get('/vocab/stats', async (req) => {
    const uid = userId(req);
    return vocabCounts(db, uid, nowFor(req), getSettings(db, uid).schedule);
  });

  app.get('/vocab/:id', async (req) => {
    const uid = userId(req);
    const row = vocabRow(db, (req.params as { id: string }).id);
    if (!row || (row.owner_user_id !== null && row.owner_user_id !== uid)) throw notFound('Word not found');
    return wordView(row, getCard(db, uid, row.id));
  });

  app.post('/vocab/custom', async (req) => {
    const uid = userId(req);
    const id = createCustomWord(db, uid, parse(customWord, req.body), nowFor(req));
    const act = logActivity(db, uid, { type: 'vocabulary', ref: id, skill: 'vocabulary', minutes: 1 }, nowFor(req));
    return { id, word: wordView(vocabRow(db, id)!, getCard(db, uid, id)), ...act };
  });

  app.put('/vocab/custom/:id', async (req) => {
    const ok = updateCustomWord(db, userId(req), (req.params as { id: string }).id, parse(customWord, req.body));
    if (!ok) throw notFound('Word not found');
    return { ok };
  });

  app.delete('/vocab/custom/:id', async (req) => {
    const ok = deleteCustomWord(db, userId(req), (req.params as { id: string }).id);
    if (!ok) throw notFound('Word not found');
    return { ok };
  });

  app.post('/vocab/introduce', async (req) => {
    const body = parse(z.object({ ids: z.array(z.string().max(200)).max(40) }), req.body);
    return { added: introduceWords(db, userId(req), body.ids, nowFor(req)) };
  });

  app.get('/review/queue', async (req) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), mode: z.enum(['mixed', 'flashcards']).optional(), ids: z.string().max(4000).optional() }), req.query);
    const uid = userId(req);
    const now = nowFor(req);
    const schedule = getSettings(db, uid).schedule;
    return {
      items: reviewQueue(db, uid, now, schedule, { limit: q.limit, mode: q.mode, ids: q.ids ? q.ids.split(',').filter(Boolean) : undefined }),
      stats: vocabCounts(db, uid, now, schedule),
    };
  });

  app.post('/review/grade', async (req) => {
    const body = parse(
      z.object({
        vocabId: z.string().max(200),
        grade: z.enum(['again', 'hard', 'good', 'easy']).optional(),
        correct: z.boolean().optional(),
        mode: z.enum(['flashcard', 'meaning', 'word_from_definition', 'translation', 'cloze', 'cloze_typed', 'collocation', 'synonym', 'antonym', 'spelling', 'builder', 'lesson', 'game', 'test', 'writing']),
        responseMs: z.number().int().min(0).max(600000).optional(),
        source: z.enum(['review', 'lesson', 'session', 'game', 'challenge']).default('review'),
      }),
      req.body,
    );
    const card = gradeWord(db, userId(req), body, nowFor(req));
    if (!card) throw notFound('Word not found');
    return { state: card.state, intervalDays: card.intervalDays, dueAt: card.dueAt, lapses: card.lapses };
  });

  // Mistakes notebook.
  app.get('/mistakes', async (req) => {
    const q = parse(z.object({ category: z.string().max(40).optional(), status: z.enum(['open', 'resolved', 'all']).optional() }), req.query);
    const uid = userId(req);
    return { errors: listErrors(db, uid, q), stats: errorStats(db, uid) };
  });

  app.get('/mistakes/review', async (req) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(30).optional() }), req.query);
    const uid = userId(req);
    return { items: dueErrors(db, uid, nowFor(req), getSettings(db, uid).schedule, q.limit ?? 10).map(errorExercise) };
  });

  app.post('/mistakes/:id/review', async (req) => {
    const body = parse(z.object({ answer: z.string().max(600).optional(), choiceCorrect: z.boolean().optional() }), req.body);
    const uid = userId(req);
    const now = nowFor(req);
    const id = Number((req.params as { id: string }).id);
    const row = db.prepare('SELECT correct FROM user_errors WHERE id = ? AND user_id = ?').get(id, uid) as { correct: string } | undefined;
    if (!row) throw notFound('Mistake not found');
    const check = body.answer !== undefined ? checkCorrection(body.answer, row.correct) : { correct: !!body.choiceCorrect, almost: false };
    const r = reviewError(db, uid, id, check.correct, now);
    const xp = r.resolved ? awardXp(db, uid, XP.mistakeFixed, 'Mistake fixed', String(id), now) : 0;
    return { ...check, expected: row.correct, ...r, xp };
  });

  app.post('/mistakes/:id/dismiss', async (req) => {
    const uid = userId(req);
    db.prepare('UPDATE user_errors SET resolved_at = ? WHERE id = ? AND user_id = ?').run(nowFor(req).toISOString(), Number((req.params as { id: string }).id), uid);
    return { ok: true };
  });
}
