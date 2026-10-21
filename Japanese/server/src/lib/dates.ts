import type { Request } from 'express';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The learner's local calendar date (sent by the client) — used for streaks and daily goals. */
export function localDate(req: Request): string {
  const header = req.header('x-local-date');
  if (header && DATE_RE.test(header)) return header;
  return formatDate(new Date());
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Consecutive study days ending today (or yesterday if today has no activity yet). */
export function computeStreak(activeDates: string[], today: string): { current: number; longest: number; activeToday: boolean } {
  const set = new Set(activeDates);
  const activeToday = set.has(today);
  let cursor = activeToday ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev = '';
  for (const date of sorted) {
    run = prev && addDays(prev, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = date;
  }
  return { current, longest, activeToday };
}
