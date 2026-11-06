import type { DB } from '../db';
import { nowIso } from '../db';
import { hashPassword } from '../auth';
import { CORE_SKILLS, levelValue, type CourseLevel } from '@shared/cefr';
import { INTENSITY_MINUTES, type Intensity } from '@shared/timeline';
import type { StudySchedule } from '@shared/srs';

export interface Settings {
  schedule: StudySchedule;
  intensity: Intensity;
  dailyMinutes: number;
  explanationLanguage: 'auto' | 'en' | 'mn' | 'mixed';
  theme: 'system' | 'light' | 'dark';
  reduceMotion: boolean;
  largeText: boolean;
  ttsVoice: string | null;
  ttsRate: number;
  placementStatus: 'pending' | 'done' | 'skipped';
  courseLevel: CourseLevel;
  onboarded: boolean;
}

export function createUser(db: DB, input: { username: string; displayName: string; password: string; role: 'learner' | 'admin' }): number {
  const now = nowIso();
  return db.transaction(() => {
    const info = db
      .prepare('INSERT INTO users (username, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(input.username.trim(), input.displayName.trim(), hashPassword(input.password), input.role, now);
    const id = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)').run(id, now);
    db.prepare('INSERT INTO streaks (user_id, updated_at) VALUES (?, ?)').run(id, now);
    const skillStmt = db.prepare('INSERT INTO skill_profile (user_id, skill, score, provisional, updated_at) VALUES (?, ?, ?, 1, ?)');
    for (const skill of [...CORE_SKILLS, 'pronunciation']) skillStmt.run(id, skill, levelValue('B1'), now);
    db.prepare(`INSERT INTO user_levels (user_id, level_code, status, unlocked_at) VALUES (?, 'B1', 'unlocked', ?)`).run(id, now);
    return id;
  })();
}

export function getSettings(db: DB, userId: number): Settings {
  const r = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as Record<string, unknown>;
  return {
    schedule: r.schedule as StudySchedule,
    intensity: r.intensity as Intensity,
    dailyMinutes: r.daily_minutes as number,
    explanationLanguage: r.explanation_language as Settings['explanationLanguage'],
    theme: r.theme as Settings['theme'],
    reduceMotion: !!r.reduce_motion,
    largeText: !!r.large_text,
    ttsVoice: (r.tts_voice as string | null) ?? null,
    ttsRate: r.tts_rate as number,
    placementStatus: r.placement_status as Settings['placementStatus'],
    courseLevel: r.course_level as CourseLevel,
    onboarded: !!r.onboarded,
  };
}

export function updateSettings(db: DB, userId: number, patch: Partial<Omit<Settings, 'placementStatus' | 'courseLevel'>>): Settings {
  const map: Record<string, string> = {
    schedule: 'schedule',
    intensity: 'intensity',
    dailyMinutes: 'daily_minutes',
    explanationLanguage: 'explanation_language',
    theme: 'theme',
    reduceMotion: 'reduce_motion',
    largeText: 'large_text',
    ttsVoice: 'tts_voice',
    ttsRate: 'tts_rate',
    onboarded: 'onboarded',
  };
  const next = { ...patch };
  // Choosing an intensity sets a sensible default time unless minutes were given explicitly.
  if (patch.intensity && patch.dailyMinutes === undefined) next.dailyMinutes = INTENSITY_MINUTES[patch.intensity].default;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(next)) {
    const col = map[key];
    if (!col || value === undefined) continue;
    sets.push(`${col} = ?`);
    values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }
  if (sets.length) {
    db.prepare(`UPDATE user_settings SET ${sets.join(', ')}, updated_at = ? WHERE user_id = ?`).run(...values, nowIso(), userId);
  }
  return getSettings(db, userId);
}

/** Explanation language actually used, when the setting is "auto": less Mongolian as the learner progresses. */
export function effectiveExplanationLanguage(settings: Settings): 'en' | 'mn' | 'mixed' {
  if (settings.explanationLanguage !== 'auto') return settings.explanationLanguage;
  return settings.courseLevel === 'B1' || settings.courseLevel === 'B1+' ? 'mixed' : 'en';
}

export function userCount(db: DB): number {
  return db.prepare('SELECT COUNT(*) FROM users').pluck().get() as number;
}
