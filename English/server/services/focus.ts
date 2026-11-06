// Weekly adaptive focus: extra activities for weak skills, planned per week
// (Monday to Sunday) and consumed by the daily session planner.

import type { DB } from '../db';
import { parseJson } from '../db';
import { buildWeeklyFocus, type WeeklyFocus } from '@shared/adaptive';
import type { CoreSkill } from '@shared/cefr';
import { toDateKey } from '@shared/streak';
import { skillStats } from './skills';

export function weekStart(now: Date): string {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return toDateKey(d);
}

export interface FocusState {
  weekStart: string;
  focus: WeeklyFocus;
  used: Partial<Record<CoreSkill, number>>;
  remaining: Partial<Record<CoreSkill, number>>;
}

function load(db: DB, userId: number, week: string): { focus: WeeklyFocus; used: Partial<Record<CoreSkill, number>> } | null {
  const row = db.prepare('SELECT focus, used FROM weekly_focus WHERE user_id = ? AND week_start = ?').get(userId, week) as { focus: string; used: string } | undefined;
  return row ? { focus: parseJson(row.focus, { extra: {}, lighter: [], messages: [] }), used: parseJson(row.used, {}) } : null;
}

export function currentFocus(db: DB, userId: number, now: Date): FocusState {
  const week = weekStart(now);
  let state = load(db, userId, week);
  if (!state) {
    const focus = buildWeeklyFocus(skillStats(db, userId));
    db.prepare('INSERT OR IGNORE INTO weekly_focus (user_id, week_start, focus, used, created_at) VALUES (?, ?, ?, ?, ?)').run(
      userId,
      week,
      JSON.stringify(focus),
      '{}',
      now.toISOString(),
    );
    state = { focus, used: {} };
  }
  const remaining: Partial<Record<CoreSkill, number>> = {};
  for (const [skill, n] of Object.entries(state.focus.extra) as [CoreSkill, number][]) {
    remaining[skill] = Math.max(0, n - (state.used[skill] ?? 0));
  }
  return { weekStart: week, focus: state.focus, used: state.used, remaining };
}

/** A weak result adds one extra activity for that skill this week. */
export function addFocusExtra(db: DB, userId: number, skill: CoreSkill, now: Date): void {
  const s = currentFocus(db, userId, now);
  const extra = { ...s.focus.extra, [skill]: Math.min(6, (s.focus.extra[skill] ?? 0) + 1) };
  const messages = s.focus.messages.some((m) => m.includes(`extra ${skill}`))
    ? s.focus.messages
    : [...s.focus.messages, `Recent results show ${skill} needs more practice, so extra ${skill} activities have been added this week.`];
  db.prepare('UPDATE weekly_focus SET focus = ? WHERE user_id = ? AND week_start = ?').run(JSON.stringify({ ...s.focus, extra, messages }), userId, s.weekStart);
}

/** Mark one extra activity for a skill as done. */
export function useFocus(db: DB, userId: number, skill: CoreSkill, now: Date): void {
  const s = currentFocus(db, userId, now);
  if (!(skill in s.focus.extra)) return;
  const used = { ...s.used, [skill]: (s.used[skill] ?? 0) + 1 };
  db.prepare('UPDATE weekly_focus SET used = ? WHERE user_id = ? AND week_start = ?').run(JSON.stringify(used), userId, s.weekStart);
}
