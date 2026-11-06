// Study activity, XP, streaks and achievements.

import type { DB } from '../db';
import { nowIso, parseJson } from '../db';
import { newlyEarned, rankFor, XP, type AchievementDef, type AchievementMetrics } from '@shared/gamification';
import { recordStudyDay, streakStatus, toDateKey, type StreakState } from '@shared/streak';
import { getSettings } from './users';

export interface ActivityResult {
  xp: number;
  achievements: AchievementDef[];
  streak?: { current: number; freezeEarned: boolean; freezeUsed: number; restarted: boolean };
}

export function awardXp(db: DB, userId: number, amount: number, reason: string, ref: string | null, now: Date): number {
  if (amount <= 0) return 0;
  const n = Math.round(amount);
  db.prepare('INSERT INTO xp_events (user_id, amount, reason, ref, created_at) VALUES (?, ?, ?, ?, ?)').run(userId, n, reason, ref, now.toISOString());
  db.prepare(
    `INSERT INTO study_days (user_id, date, xp) VALUES (?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET xp = xp + excluded.xp`,
  ).run(userId, toDateKey(now), n);
  return n;
}

export function totalXp(db: DB, userId: number): number {
  return (db.prepare('SELECT COALESCE(SUM(amount), 0) FROM xp_events WHERE user_id = ?').pluck().get(userId) as number) ?? 0;
}

export function getStreak(db: DB, userId: number): StreakState {
  const r = db.prepare('SELECT current, longest, last_study_date, freezes, freezes_used FROM streaks WHERE user_id = ?').get(userId) as
    | { current: number; longest: number; last_study_date: string | null; freezes: number; freezes_used: number }
    | undefined;
  return r
    ? { current: r.current, longest: r.longest, lastStudyDate: r.last_study_date, freezes: r.freezes, freezesUsed: r.freezes_used }
    : { current: 0, longest: 0, lastStudyDate: null, freezes: 0, freezesUsed: 0 };
}

export function streakView(db: DB, userId: number, now: Date) {
  const settings = getSettings(db, userId);
  const s = getStreak(db, userId);
  const status = streakStatus(s, toDateKey(now), settings.schedule);
  // A broken streak shows as 0 without touching the stored longest streak.
  return { ...s, current: status === 'broken' ? 0 : s.current, status };
}

/**
 * Log a completed learning activity. Records study time, marks the day as a
 * study day (streak), and evaluates achievements.
 */
export function logActivity(
  db: DB,
  userId: number,
  a: { type: string; ref?: string | null; skill?: string | null; minutes?: number; score?: number | null; xp?: number; xpReason?: string },
  now: Date,
): ActivityResult {
  const minutes = Math.max(0, Math.min(90, a.minutes ?? 0));
  const date = toDateKey(now);
  let xp = 0;
  let streakInfo: ActivityResult['streak'];

  db.transaction(() => {
    db.prepare('INSERT INTO activity_log (user_id, type, ref, skill, minutes, score, created_at, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      userId,
      a.type,
      a.ref ?? null,
      a.skill ?? null,
      minutes,
      a.score ?? null,
      now.toISOString(),
      date,
    );
    db.prepare(
      `INSERT INTO study_days (user_id, date, minutes, activities) VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET minutes = minutes + excluded.minutes, activities = activities + 1`,
    ).run(userId, date, minutes);

    const settings = getSettings(db, userId);
    const before = getStreak(db, userId);
    if (before.lastStudyDate !== date) {
      const u = recordStudyDay(before, date, settings.schedule);
      db.prepare('UPDATE streaks SET current = ?, longest = ?, last_study_date = ?, freezes = ?, freezes_used = ?, updated_at = ? WHERE user_id = ?').run(
        u.state.current,
        u.state.longest,
        u.state.lastStudyDate,
        u.state.freezes,
        u.state.freezesUsed,
        now.toISOString(),
        userId,
      );
      if (u.freezesConsumed) db.prepare('UPDATE study_days SET freeze_used = ? WHERE user_id = ? AND date = ?').run(u.freezesConsumed, userId, date);
      xp += awardXp(db, userId, XP.streakDay, 'Study day', date, now);
      streakInfo = { current: u.state.current, freezeEarned: u.freezeEarned, freezeUsed: u.freezesConsumed, restarted: u.restarted };
    }
    if (a.xp) xp += awardXp(db, userId, a.xp, a.xpReason ?? a.type, a.ref ?? null, now);
  })();

  const achievements = evaluateAchievements(db, userId, now);
  xp += achievements.reduce((s, x) => s + x.xp, 0);
  return { xp, achievements, streak: streakInfo };
}

export function achievementMetrics(db: DB, userId: number): AchievementMetrics {
  const count = (sql: string, ...params: unknown[]) => (db.prepare(sql).pluck().get(userId, ...params) as number) ?? 0;
  const levels = db.prepare('SELECT level_code, status FROM user_levels WHERE user_id = ?').all(userId) as { level_code: string; status: string }[];
  return {
    lessonsCompleted: count(`SELECT COUNT(*) FROM user_progress WHERE user_id = ? AND status = 'completed'`),
    wordsLearned: count('SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND first_learned_at IS NOT NULL'),
    wordsMastered: count(`SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND state = 'MASTERED'`),
    reviewsDone: count('SELECT COUNT(*) FROM vocabulary_reviews WHERE user_id = ?'),
    longestStreak: count('SELECT longest FROM streaks WHERE user_id = ?'),
    speakingAttempts: count('SELECT COUNT(*) FROM speaking_attempts WHERE user_id = ?'),
    writingSubmissions: count('SELECT COUNT(*) FROM writing_submissions WHERE user_id = ?'),
    essays: count(`SELECT COUNT(*) FROM writing_submissions WHERE user_id = ? AND word_count >= 150`),
    modulesCompleted: count('SELECT COUNT(DISTINCT module_id) FROM module_results WHERE user_id = ? AND passed = 1'),
    levelsPassed: (db.prepare('SELECT DISTINCT level_code FROM level_results WHERE user_id = ? AND passed = 1').pluck().all(userId) as string[]) ?? [],
    unlockedLevels: levels.map((l) => l.level_code),
    perfectLessons: count(`SELECT COUNT(*) FROM user_progress WHERE user_id = ? AND best_score >= 0.999`),
    gamesPlayed: count(`SELECT COUNT(*) FROM activity_log WHERE user_id = ? AND type = 'game'`),
    bossWins: count(`SELECT COUNT(*) FROM activity_log WHERE user_id = ? AND type = 'game' AND ref = 'boss' AND score >= 0.7`),
    mistakesFixed: count('SELECT COUNT(*) FROM user_errors WHERE user_id = ? AND resolved_at IS NOT NULL'),
    customWords: count('SELECT COUNT(*) FROM vocabulary WHERE owner_user_id = ?'),
    conversations: count(`SELECT COUNT(*) FROM ai_threads WHERE user_id = ? AND mode = 'conversation' AND status = 'finished'`),
    dictationsPerfect: count(`SELECT COUNT(*) FROM activity_log WHERE user_id = ? AND type = 'dictation_sentence' AND score >= 0.999`),
    placementDone: count('SELECT COUNT(*) FROM placement_results WHERE user_id = ?') > 0,
    sessionsCompleted: count(`SELECT COUNT(*) FROM study_sessions WHERE user_id = ? AND status = 'completed'`),
    challengesCompleted: count(`SELECT COUNT(*) FROM daily_challenges WHERE user_id = ? AND status = 'done'`),
  };
}

/** Award any achievements whose conditions are now met. */
export function evaluateAchievements(db: DB, userId: number, now: Date): AchievementDef[] {
  const earned = new Set(db.prepare('SELECT code FROM user_achievements WHERE user_id = ?').pluck().all(userId) as string[]);
  const fresh = newlyEarned(achievementMetrics(db, userId), earned);
  for (const a of fresh) {
    db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, code, unlocked_at) VALUES (?, ?, ?)').run(userId, a.code, now.toISOString());
    awardXp(db, userId, a.xp, `Achievement: ${a.title}`, a.code, now);
  }
  return fresh;
}

export function xpSummary(db: DB, userId: number) {
  const xp = totalXp(db, userId);
  const r = rankFor(xp);
  return { xp, rank: r.rank, nextRank: r.next, progress: r.progress };
}

export function listAchievements(db: DB, userId: number) {
  const rows = db
    .prepare(
      `SELECT a.code, a.title, a.description, a.icon, a.category, a.xp, ua.unlocked_at AS unlockedAt
       FROM achievements a LEFT JOIN user_achievements ua ON ua.code = a.code AND ua.user_id = ?
       ORDER BY a.ord`,
    )
    .all(userId) as { code: string; title: string; description: string; icon: string; category: string; xp: number; unlockedAt: string | null }[];
  return rows;
}

export function recentActivityTypes(db: DB, userId: number, sinceDays = 3): string[] {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  return db.prepare('SELECT DISTINCT type FROM activity_log WHERE user_id = ? AND created_at >= ?').pluck().all(userId, since) as string[];
}

export { nowIso, parseJson };
