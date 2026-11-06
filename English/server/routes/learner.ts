import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nowFor, parse, userId } from '../http';
import { XP } from '@shared/gamification';
import { toDateKey } from '@shared/streak';
import { estimateTimeline } from '@shared/timeline';
import { getSettings, updateSettings, effectiveExplanationLanguage } from '../services/users';
import { dashboard } from '../services/dashboard';
import { awardXp, listAchievements, logActivity, streakView, xpSummary } from '../services/activity';
import { applyEvidence, recordResponses, skillProfile } from '../services/skills';
import { moduleView, nextStep, remainingCourseMinutes, roadmap } from '../services/course';
import { completeLesson, lessonPayload, saveLessonStep } from '../services/lessons';
import { autoCompleteSessionItems, completeSessionItem, previewSession, startSession, todaySession } from '../services/session';

const settingsPatch = z
  .object({
    schedule: z.enum(['daily', 'alternate']),
    intensity: z.enum(['casual', 'standard', 'intensive']),
    dailyMinutes: z.number().int().min(10).max(120),
    explanationLanguage: z.enum(['auto', 'en', 'mn', 'mixed']),
    theme: z.enum(['system', 'light', 'dark']),
    reduceMotion: z.boolean(),
    largeText: z.boolean(),
    ttsVoice: z.string().max(200).nullable(),
    ttsRate: z.number().min(0.5).max(1.6),
    onboarded: z.boolean(),
  })
  .partial();

export const responseSchema = z.object({
  questionId: z.string().max(200).nullable().optional(),
  skill: z.enum(['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing', 'pronunciation']),
  qtype: z.string().max(40),
  tag: z.string().max(60).nullable().optional(),
  level: z.string().max(10).nullable().optional(),
  difficulty: z.number().int().min(1).max(10).nullable().optional(),
  correct: z.boolean(),
  score: z.number().min(0).max(1),
  wrong: z.string().max(600).nullable().optional(),
  right: z.string().max(600).nullable().optional(),
  explanation: z.string().max(1000).nullable().optional(),
  explanationMn: z.string().max(1000).nullable().optional(),
  errorCategory: z.enum(['grammar', 'vocabulary', 'spelling', 'pronunciation', 'word_choice', 'collocation', 'sentence_structure', 'register', 'punctuation']).nullable().optional(),
});

/** Activities logged from the browser, with XP decided here (never by the client). */
const ACTIVITY_XP: Record<string, (score: number | null, count: number) => number> = {
  review: () => 0,
  dictation: (_s, n) => n * XP.dictationSentence,
  shadowing: (_s, n) => n * 2,
  listening: (s) => 10 + Math.round((s ?? 0) * 10),
  reading: (s) => 10 + Math.round((s ?? 0) * 10),
  pronunciation: () => 8,
  grammar_review: (s, n) => Math.round((s ?? 0) * n * XP.correctAnswer),
  mistakes: () => 0,
  vocabulary: () => 0,
};

export async function learnerRoutes(app: FastifyInstance): Promise<void> {
  const db = app.db;

  app.get('/settings', async (req) => {
    const s = getSettings(db, userId(req));
    return { ...s, effectiveExplanationLanguage: effectiveExplanationLanguage(s) };
  });

  app.put('/settings', async (req) => {
    const s = updateSettings(db, userId(req), parse(settingsPatch, req.body));
    return { ...s, effectiveExplanationLanguage: effectiveExplanationLanguage(s) };
  });

  app.get('/dashboard', async (req) => dashboard(db, userId(req), nowFor(req)));

  app.get('/profile', async (req) => {
    const uid = userId(req);
    return { user: req.user, profile: skillProfile(db, uid), xp: xpSummary(db, uid), streak: streakView(db, uid, nowFor(req)), settings: getSettings(db, uid) };
  });

  app.get('/achievements', async (req) => listAchievements(db, userId(req)));

  app.get('/course', async (req) => {
    const uid = userId(req);
    const settings = getSettings(db, uid);
    const levels = roadmap(db, uid);
    return {
      levels,
      next: nextStep(db, uid, levels),
      courseLevel: settings.courseLevel,
      timeline: estimateTimeline({ remainingContentMinutes: remainingCourseMinutes(levels, settings.courseLevel), minutesPerStudyDay: settings.dailyMinutes, schedule: settings.schedule }),
    };
  });

  app.get('/modules/:id', async (req, reply) => {
    const uid = userId(req);
    const { id } = req.params as { id: string };
    const m = moduleView(db, uid, id);
    if (!m) return reply.code(404).send({ error: 'Module not found' });
    const results = db
      .prepare('SELECT id, percent, passed, objectives, section_scores AS sections, created_at AS createdAt FROM module_results WHERE user_id = ? AND module_id = ? ORDER BY id DESC LIMIT 10')
      .all(uid, id);
    return { module: m, results };
  });

  app.get('/lessons/:id', async (req) => {
    const payload = lessonPayload(db, userId(req), (req.params as { id: string }).id);
    // Its listening comes a few steps later: start preparing the voices now.
    for (const step of payload.steps) if (step.kind === 'listening') app.speech?.prefetchScript(step.material, 'soon');
    return payload;
  });

  app.post('/lessons/:id/progress', async (req) => {
    const body = parse(z.object({ step: z.number().int().min(0).max(100), stepData: z.unknown().optional() }), req.body);
    saveLessonStep(db, userId(req), (req.params as { id: string }).id, body.step, body.stepData ?? {}, nowFor(req));
    return { ok: true };
  });

  app.post('/lessons/:id/complete', async (req) => {
    const body = parse(
      z.object({ score: z.number().min(0).max(1), skillScores: z.record(z.number().min(0).max(1)).optional(), minutes: z.number().min(0).max(120).optional() }),
      req.body,
    );
    return completeLesson(db, userId(req), (req.params as { id: string }).id, body, nowFor(req));
  });

  // Answers given during practice (lessons, reviews, sessions) — stored for analytics,
  // skill accuracy and the mistakes notebook.
  app.post('/practice/answers', async (req) => {
    const body = parse(
      z.object({
        context: z.object({ type: z.string().max(40), id: z.string().max(200).nullable().optional() }),
        answers: z.array(responseSchema).max(100),
      }),
      req.body,
    );
    const uid = userId(req);
    const now = nowFor(req);
    recordResponses(db, uid, { type: body.context.type, id: body.context.id ?? null }, body.answers, now);
    const correct = body.answers.filter((a) => a.correct).length;
    const xp = awardXp(db, uid, Math.min(40, correct * XP.correctAnswer), 'Correct answers', body.context.id ?? body.context.type, now);
    return { xp };
  });

  app.post('/activity', async (req) => {
    const body = parse(
      z.object({
        type: z.enum(['review', 'dictation', 'shadowing', 'listening', 'reading', 'pronunciation', 'grammar_review', 'mistakes', 'vocabulary']),
        ref: z.string().max(200).nullable().optional(),
        skill: z.string().max(30).nullable().optional(),
        minutes: z.number().min(0).max(90).optional(),
        score: z.number().min(0).max(1).nullable().optional(),
        count: z.number().int().min(0).max(100).optional(),
        level: z.string().max(10).optional(),
        perfect: z.number().int().min(0).max(100).optional(),
      }),
      req.body,
    );
    const uid = userId(req);
    const now = nowFor(req);
    const xp = ACTIVITY_XP[body.type](body.score ?? null, body.count ?? 1);
    if (body.type === 'dictation' && body.perfect) {
      db.prepare(`INSERT INTO activity_log (user_id, type, ref, skill, minutes, score, created_at, date) VALUES (?, 'dictation_sentence', ?, 'listening', 0, 1, ?, ?)`).run(uid, body.ref ?? null, now.toISOString(), toDateKey(now));
    }
    if (body.score != null && body.level && ['listening', 'reading', 'dictation', 'grammar_review'].includes(body.type)) {
      const skill = body.type === 'dictation' ? 'listening' : body.type === 'grammar_review' ? 'grammar' : body.type;
      applyEvidence(db, uid, skill, body.level, body.score, 'practice', now);
    }
    const result = logActivity(db, uid, { type: body.type, ref: body.ref ?? null, skill: body.skill ?? null, minutes: body.minutes ?? 3, score: body.score ?? null, xp, xpReason: body.type }, now);
    if (body.type === 'review' && (body.count ?? 0) > 0) autoCompleteSessionItems(db, uid, 'review', () => true, now);
    if (body.type === 'mistakes') autoCompleteSessionItems(db, uid, 'mistakes', () => true, now);
    return result;
  });

  // Daily session.
  app.get('/session/today', async (req) => ({ session: todaySession(db, userId(req), nowFor(req)) }));
  app.get('/session/preview', async (req) => previewSession(db, userId(req), nowFor(req)));
  app.post('/session/start', async (req) => {
    const body = parse(z.object({ replan: z.boolean().optional() }).default({}), req.body ?? {});
    return { session: startSession(db, userId(req), nowFor(req), body) };
  });
  app.post('/session/:id/items/:index/complete', async (req) => {
    const { id, index } = req.params as { id: string; index: string };
    return completeSessionItem(db, userId(req), Number(id), Number(index), nowFor(req));
  });
}
