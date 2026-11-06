// Everything the "Today" dashboard needs in one call.

import type { DB } from '../db';
import { weakSkills } from '@shared/adaptive';
import { estimateTimeline } from '@shared/timeline';
import { daysBetween, toDateKey } from '@shared/streak';
import { effectiveExplanationLanguage, getSettings } from './users';
import { listAchievements, streakView, xpSummary } from './activity';
import { skillProfile, skillStats } from './skills';
import { nextStep, remainingCourseMinutes, roadmap } from './course';
import { vocabCounts } from './vocab';
import { dueErrorCount } from './errors';
import { todaySession } from './session';
import { currentFocus } from './focus';
import { todayChallenge } from './challenge';

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + n));
}

export function dashboard(db: DB, userId: number, now: Date) {
  const settings = getSettings(db, userId);
  const today = toDateKey(now);
  const map = roadmap(db, userId);
  const step = nextStep(db, userId, map);
  const streak = streakView(db, userId, now);
  const todayRow = db.prepare('SELECT minutes, xp, activities FROM study_days WHERE user_id = ? AND date = ?').get(userId, today) as
    | { minutes: number; xp: number; activities: number }
    | undefined;
  const week = db.prepare('SELECT date, minutes FROM study_days WHERE user_id = ? AND date >= ? ORDER BY date').all(userId, addDays(today, -6)) as { date: string; minutes: number }[];
  const weekByDate = new Map(week.map((w) => [w.date, w.minutes]));
  const weekly = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, minutes: Math.round(weekByDate.get(date) ?? 0) };
  });
  const recent4 = db.prepare('SELECT COALESCE(SUM(minutes), 0) FROM study_days WHERE user_id = ? AND date > ?').pluck().get(userId, addDays(today, -28)) as number;
  const stats = skillStats(db, userId);
  const weak = weakSkills(stats);
  const vocab = vocabCounts(db, userId, now, settings.schedule);
  const session = todaySession(db, userId, now);
  const focus = currentFocus(db, userId, now);
  const achievements = listAchievements(db, userId);
  const earned = achievements.filter((a) => a.unlockedAt).sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''));
  const current = map.find((l) => l.current);
  const firstActivity = db.prepare('SELECT MIN(date) FROM study_days WHERE user_id = ?').pluck().get(userId) as string | null;
  const hasHistory = (db.prepare('SELECT COUNT(*) FROM activity_log WHERE user_id = ?').pluck().get(userId) as number) > 0;

  const lastStudy = streak.lastStudyDate;
  const away = lastStudy && lastStudy !== today ? daysBetween(lastStudy, today) : 0;
  const welcomeBack = away >= (settings.schedule === 'alternate' ? 4 : 2) ? `Welcome back. Let's continue where you left off.` : null;

  const timeline = estimateTimeline({
    remainingContentMinutes: remainingCourseMinutes(map, settings.courseLevel),
    minutesPerStudyDay: settings.dailyMinutes,
    schedule: settings.schedule,
    recentMinutesPerWeek: firstActivity && daysBetween(firstActivity, today) >= 14 ? recent4 / 4 : null,
  });

  const difficultWords = vocab.difficult;
  const weakAreas = [
    ...weak.map((s) => ({ kind: 'skill' as const, skill: s, label: s[0].toUpperCase() + s.slice(1), detail: stats.find((x) => x.skill === s)?.accuracy != null ? `${Math.round((stats.find((x) => x.skill === s)!.accuracy ?? 0) * 100)}% accuracy` : 'behind your other skills' })),
    ...(difficultWords ? [{ kind: 'words' as const, skill: 'vocabulary', label: 'Difficult words', detail: `${difficultWords} word${difficultWords === 1 ? '' : 's'} forgotten more than once` }] : []),
  ];

  return {
    user: { courseLevel: settings.courseLevel, placementStatus: settings.placementStatus, onboarded: settings.onboarded, explanationLanguage: effectiveExplanationLanguage(settings) },
    welcomeBack,
    isNew: !hasHistory,
    next: step,
    today: {
      date: today,
      goalMinutes: settings.dailyMinutes,
      minutes: Math.round(todayRow?.minutes ?? 0),
      xp: todayRow?.xp ?? 0,
      activities: todayRow?.activities ?? 0,
      schedule: settings.schedule,
      isRestDay: settings.schedule === 'alternate' && lastStudy !== null && daysBetween(lastStudy, today) === 1,
    },
    session: session ? { id: session.id, status: session.status, progress: session.progress, items: session.items.length, done: session.completed.length, minutes: session.plannedMinutes } : null,
    review: { due: vocab.due, mistakesDue: dueErrorCount(db, userId, now, settings.schedule) },
    vocab,
    streak,
    xp: xpSummary(db, userId),
    profile: skillProfile(db, userId),
    weakAreas,
    focusMessages: focus.focus.messages,
    achievements: { earned: earned.length, total: achievements.length, recent: earned.slice(0, 3) },
    weekly,
    level: current
      ? { code: current.code, title: current.title, progress: current.progress, modulesCompleted: current.modulesCompleted, modulesPublished: current.modulesPublished, modulesPlanned: current.modulesPlanned }
      : null,
    timeline,
    challenge: todayChallenge(db, userId, now),
  };
}
