// Today's study session: gathers the learner's state, runs the planner and
// tracks completion of each planned item.

import type { DB } from '../db';
import { parseJson } from '../db';
import { planSession, type PlannedItem, type PlannerInput, type SessionItemType, type SessionPlan } from '@shared/sessionPlanner';
import { daysBetween, toDateKey } from '@shared/streak';
import { XP } from '@shared/gamification';
import { CORE_SKILLS, type CoreSkill } from '@shared/cefr';
import { badRequest, notFound } from '../http';
import { getSettings } from './users';
import { getStreak, logActivity } from './activity';
import { dueCount } from './vocab';
import { dueErrorCount } from './errors';
import { skillStats } from './skills';
import { currentFocus, useFocus } from './focus';
import { nextStep } from './course';

export interface SessionView {
  id: number;
  date: string;
  mode: SessionPlan['mode'];
  message: string;
  plannedMinutes: number;
  items: (PlannedItem & { done: boolean })[];
  completed: number[];
  status: 'active' | 'completed';
  progress: number;
}

function toView(row: { id: number; date: string; mode: string; message: string; planned_minutes: number; plan: string; completed: string; status: string }): SessionView {
  const items = parseJson<PlannedItem[]>(row.plan, []);
  const completed = parseJson<number[]>(row.completed, []);
  return {
    id: row.id,
    date: row.date,
    mode: row.mode as SessionPlan['mode'],
    message: row.message,
    plannedMinutes: row.planned_minutes,
    items: items.map((it, i) => ({ ...it, done: completed.includes(i) })),
    completed,
    status: row.status as 'active' | 'completed',
    progress: items.length ? completed.length / items.length : 0,
  };
}

export function todaySession(db: DB, userId: number, now: Date): SessionView | null {
  const row = db.prepare('SELECT * FROM study_sessions WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1').get(userId, toDateKey(now)) as
    | Parameters<typeof toView>[0]
    | undefined;
  return row ? toView(row) : null;
}

const PRACTICE_LOG_TYPE = { listening_materials: 'listening', reading_materials: 'reading', speaking_tasks: 'speaking', writing_tasks: 'writing' } as const;

/** Days a material rests before it can come back as extra practice: longer each time it is repeated. */
const REST_DAYS = [3, 7, 14, 30];

/**
 * Materials from lessons the learner has completed — used for extra practice without spoiling
 * future lessons. Anything met recently (in its lesson or as practice) rests first, and the least
 * recently met come first, so the same task doesn't return day after day.
 */
function practicedMaterials(db: DB, userId: number, table: keyof typeof PRACTICE_LOG_TYPE, now: Date): string[] {
  const logType = PRACTICE_LOG_TYPE[table];
  const rows = db
    .prepare(
      `SELECT t.id, p.completed_at AS lessonDone,
              (SELECT MAX(a.created_at) FROM activity_log a WHERE a.user_id = p.user_id AND a.type = ? AND a.ref = t.id) AS lastPractice,
              (SELECT COUNT(*) FROM activity_log a WHERE a.user_id = p.user_id AND a.type = ? AND a.ref = t.id) AS practices
       FROM ${table} t JOIN user_progress p ON p.lesson_id = t.lesson_id AND p.user_id = ?
       WHERE p.status = 'completed' AND t.context = 'lesson'`,
    )
    .all(logType, logType, userId) as { id: string; lessonDone: string | null; lastPractice: string | null; practices: number }[];
  return rows
    .map((r) => {
      const last = [r.lessonDone, r.lastPractice].filter((d): d is string => !!d).sort().at(-1) ?? null;
      const rest = REST_DAYS[Math.min(r.practices, REST_DAYS.length - 1)];
      return { id: r.id, last, rested: !last || (now.getTime() - Date.parse(last)) / 86400000 >= rest };
    })
    .filter((r) => r.rested)
    .sort((a, b) => (a.last ?? '').localeCompare(b.last ?? ''))
    .slice(0, 12)
    .map((r) => r.id);
}

export function plannerInput(db: DB, userId: number, now: Date): PlannerInput {
  const settings = getSettings(db, userId);
  const today = toDateKey(now);
  const streak = getStreak(db, userId);
  const studiedToday = streak.lastStudyDate === today;
  const daysAway = studiedToday ? 0 : streak.lastStudyDate ? daysBetween(streak.lastStudyDate, today) : null;
  const focus = currentFocus(db, userId, now);
  const step = nextStep(db, userId);

  let nextLesson: PlannerInput['nextLesson'] = null;
  if (step.type === 'lesson') {
    const acts = db.prepare('SELECT ord, type, skill, minutes FROM activities WHERE lesson_id = ? ORDER BY ord').all(step.lessonId) as {
      ord: number;
      type: string;
      skill: string;
      minutes: number;
    }[];
    nextLesson = {
      id: step.lessonId,
      title: step.lessonTitle,
      moduleTitle: step.moduleTitle,
      currentStep: step.currentStep,
      steps: acts.map((a) => ({ index: a.ord, kind: a.type, minutes: a.minutes, skill: a.skill })),
    };
  }

  const recent = db.prepare('SELECT plan FROM study_sessions WHERE user_id = ? AND date < ? ORDER BY id DESC LIMIT 2').all(userId, today) as { plan: string }[];
  const recentTypes = [...new Set(recent.flatMap((r) => parseJson<PlannedItem[]>(r.plan, []).map((i) => i.type)))].filter((t) => !['review', 'lesson', 'challenge', 'module_test', 'mistakes'].includes(t)) as SessionItemType[];
  const since = new Date(now.getTime() - 3 * 86400000).toISOString();
  const recentGames = db.prepare(`SELECT DISTINCT ref FROM activity_log WHERE user_id = ? AND type = 'game' AND created_at >= ?`).pluck().all(userId, since) as string[];

  const listening = practicedMaterials(db, userId, 'listening_materials', now);
  // Dictation and shadowing draw sentences from every studied script, rested or not.
  const studiedListening = (db
    .prepare(`SELECT COUNT(*) FROM listening_materials t JOIN user_progress p ON p.lesson_id = t.lesson_id AND p.user_id = ? WHERE p.status = 'completed' AND t.context = 'lesson'`)
    .pluck()
    .get(userId) as number) > 0;
  const completedGrammar = db
    .prepare(`SELECT COUNT(*) FROM lessons l JOIN user_progress p ON p.lesson_id = l.id AND p.user_id = ? WHERE p.status = 'completed' AND l.grammar_topic_id IS NOT NULL`)
    .pluck()
    .get(userId) as number;
  const hasPronunciation = (db
    .prepare(`SELECT COUNT(*) FROM lessons l JOIN user_progress p ON p.lesson_id = l.id AND p.user_id = ? WHERE p.status = 'completed' AND l.pronunciation_id IS NOT NULL`)
    .pluck()
    .get(userId) as number) > 0;

  return {
    date: today,
    minutes: settings.dailyMinutes,
    schedule: settings.schedule,
    daysAway,
    dueReviews: dueCount(db, userId, now, settings.schedule),
    dueMistakes: dueErrorCount(db, userId, now, settings.schedule),
    learnedWords: db.prepare(`SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND state != 'NEW'`).pluck().get(userId) as number,
    skillStats: skillStats(db, userId),
    weeklyExtra: focus.remaining,
    lighterSkills: focus.focus.lighter,
    nextLesson,
    moduleTestReady: step.type === 'module_test' ? { moduleId: step.moduleId, title: step.moduleTitle } : null,
    recentTypes,
    recentGames,
    available: {
      listening,
      reading: practicedMaterials(db, userId, 'reading_materials', now),
      speaking: practicedMaterials(db, userId, 'speaking_tasks', now),
      writing: practicedMaterials(db, userId, 'writing_tasks', now),
      dictation: studiedListening,
      shadowing: hasPronunciation || studiedListening,
      grammarReview: completedGrammar > 0,
    },
    challengeDone: (db.prepare(`SELECT COUNT(*) FROM daily_challenges WHERE user_id = ? AND date = ? AND status = 'done'`).pluck().get(userId, today) as number) > 0,
  };
}

/** Preview today's plan without saving it. */
export function previewSession(db: DB, userId: number, now: Date): SessionPlan {
  return planSession(plannerInput(db, userId, now));
}

export function startSession(db: DB, userId: number, now: Date, opts: { replan?: boolean } = {}): SessionView {
  const existing = todaySession(db, userId, now);
  if (existing && !(opts.replan && existing.status === 'completed')) return existing;
  const input = plannerInput(db, userId, now);
  const plan = planSession(input);
  if (!plan.items.length) throw badRequest('Nothing to plan right now — you are all caught up!');
  const info = db
    .prepare(`INSERT INTO study_sessions (user_id, date, mode, message, planned_minutes, plan, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, input.date, plan.mode, opts.replan ? 'Extra session: more practice while you have time.' : plan.message, plan.totalMinutes, JSON.stringify(plan.items), now.toISOString());
  return todaySession(db, userId, now) ?? toView(db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(Number(info.lastInsertRowid)) as Parameters<typeof toView>[0]);
}

/**
 * Work done outside the session (e.g. a lesson opened from the course page)
 * still ticks off the matching item in today's plan.
 */
export function autoCompleteSessionItems(
  db: DB,
  userId: number,
  type: SessionItemType,
  matches: (payload: Record<string, unknown>) => boolean,
  now: Date,
): void {
  const session = todaySession(db, userId, now);
  if (!session || session.status === 'completed') return;
  session.items.forEach((item, index) => {
    if (!item.done && item.type === type && matches(item.payload)) completeSessionItem(db, userId, session.id, index, now);
  });
}

export function completeSessionItem(db: DB, userId: number, sessionId: number, index: number, now: Date) {
  const row = db.prepare('SELECT * FROM study_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId) as Parameters<typeof toView>[0] | undefined;
  if (!row) throw notFound('Session not found');
  const view = toView(row);
  const item = view.items[index];
  if (!item) throw badRequest('Unknown session item');
  if (view.completed.includes(index)) return { session: view, xp: 0, achievements: [] };
  const completed = [...view.completed, index];
  const allDone = completed.length >= view.items.length;
  db.prepare('UPDATE study_sessions SET completed = ?, status = ?, finished_at = ? WHERE id = ?').run(
    JSON.stringify(completed),
    allDone ? 'completed' : 'active',
    allDone ? now.toISOString() : null,
    sessionId,
  );
  if ((CORE_SKILLS as readonly string[]).includes(item.skill)) {
    const focus = currentFocus(db, userId, now);
    if ((focus.remaining[item.skill as CoreSkill] ?? 0) > 0 && !['lesson', 'review', 'module_test'].includes(item.type)) useFocus(db, userId, item.skill as CoreSkill, now);
  }
  let xp = 0;
  let achievements: ReturnType<typeof logActivity>['achievements'] = [];
  if (allDone) {
    const act = logActivity(db, userId, { type: 'session', ref: String(sessionId), minutes: 0, xp: XP.sessionComplete, xpReason: 'Daily session completed' }, now);
    xp = act.xp;
    achievements = act.achievements;
  }
  return { session: todaySession(db, userId, now) ?? view, xp, achievements };
}
