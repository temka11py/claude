import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toDateKey } from '@shared/streak';
import { nowFor, parse, userId } from '../http';
import { analytics, knowledgeMap, monthlyReport, weeklyReport } from '../services/reports';
import { weekStart } from '../services/focus';
import { skillProfile } from '../services/skills';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  const db = app.db;

  app.get('/reports/weekly', async (req) => {
    const q = parse(z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.query);
    const now = nowFor(req);
    return weeklyReport(db, userId(req), q.week ? weekStart(new Date(`${q.week}T12:00:00`)) : weekStart(now));
  });

  app.get('/reports/monthly', async (req) => {
    const q = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), req.query);
    return monthlyReport(db, userId(req), q.month ?? toDateKey(nowFor(req)).slice(0, 7));
  });

  app.get('/knowledge-map', async (req) => knowledgeMap(db, userId(req)));

  app.get('/analytics', async (req) => analytics(db, userId(req), nowFor(req)));

  /** Personal completion page for the C1 journey (not an official certificate). */
  app.get('/certificate', async (req) => {
    const uid = userId(req);
    const passed = db.prepare(`SELECT created_at, percent FROM level_results WHERE user_id = ? AND level_code = 'C1' AND passed = 1 ORDER BY id LIMIT 1`).get(uid) as
      | { created_at: string; percent: number }
      | undefined;
    const n = (sql: string) => db.prepare(sql).pluck().get(uid) as number;
    const stats = {
      sessions: n(`SELECT COUNT(*) FROM study_sessions WHERE user_id = ? AND status = 'completed'`),
      studyDays: n('SELECT COUNT(*) FROM study_days WHERE user_id = ? AND activities > 0'),
      minutes: Math.round(n('SELECT COALESCE(SUM(minutes), 0) FROM study_days WHERE user_id = ?')),
      lessons: n(`SELECT COUNT(*) FROM user_progress WHERE user_id = ? AND status = 'completed'`),
      wordsMastered: n(`SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND state = 'MASTERED'`),
      wordsLearned: n('SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND first_learned_at IS NOT NULL'),
      modules: n('SELECT COUNT(DISTINCT module_id) FROM module_results WHERE user_id = ? AND passed = 1'),
      levelsPassed: db.prepare('SELECT DISTINCT level_code FROM level_results WHERE user_id = ? AND passed = 1').pluck().all(uid) as string[],
    };
    return {
      earned: !!passed,
      completedAt: passed?.created_at ?? null,
      examScore: passed?.percent ?? null,
      name: req.user?.displayName,
      stats,
      skills: skillProfile(db, uid).skills,
      requirement: 'Pass the C1 level exam to complete the journey.',
    };
  });
}
