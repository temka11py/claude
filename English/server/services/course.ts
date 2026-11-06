// Course structure and the learner's position in it: roadmap, unlocking and
// "what should I study next?".

import type { DB } from '../db';
import { parseJson } from '../db';
import { COURSE_LEVELS, nextCourseLevel, type CourseLevel } from '@shared/cefr';
import { getSettings } from './users';

export type ModuleState = 'planned' | 'locked' | 'available' | 'in_progress' | 'test_ready' | 'completed' | 'optional';
export type LessonState = 'locked' | 'available' | 'in_progress' | 'completed';

interface ModuleRow {
  id: string;
  level_code: CourseLevel;
  ord: number;
  title: string;
  topic: string;
  description: string;
  description_mn: string | null;
  objectives: string;
  targets: string;
  status: 'draft' | 'published' | 'planned';
  test_json: string | null;
}

interface LessonRow {
  id: string;
  module_id: string;
  ord: number;
  title: string;
  kind: 'core' | 'review';
  focus: string;
  skills: string;
  cefr_level: string;
  difficulty: number;
  minutes: number;
  objectives: string;
  status: string;
}

interface ProgressRow {
  lesson_id: string;
  status: 'in_progress' | 'completed';
  current_step: number;
  score: number | null;
  best_score: number | null;
  attempts: number;
  completed_at: string | null;
}

export const MODULE_TEST_MINUTES = 30;
export const MODULE_PASS = 0.6;
export const LEVEL_PASS = 0.7;
export const LEVEL_SKILL_FLOOR = 0.55;
/** Planning estimate for modules whose content is still being written. */
export const PLANNED_MODULE_MINUTES = 170;

export function userLevels(db: DB, userId: number): Map<string, { status: string; unlockedAt: string; completedAt: string | null }> {
  const rows = db.prepare('SELECT level_code, status, unlocked_at, completed_at FROM user_levels WHERE user_id = ?').all(userId) as {
    level_code: string;
    status: string;
    unlocked_at: string;
    completed_at: string | null;
  }[];
  return new Map(rows.map((r) => [r.level_code, { status: r.status, unlockedAt: r.unlocked_at, completedAt: r.completed_at }]));
}

function progressMap(db: DB, userId: number): Map<string, ProgressRow> {
  const rows = db.prepare('SELECT lesson_id, status, current_step, score, best_score, attempts, completed_at FROM user_progress WHERE user_id = ?').all(userId) as ProgressRow[];
  return new Map(rows.map((r) => [r.lesson_id, r]));
}

function passedModules(db: DB, userId: number): Map<string, number> {
  const rows = db.prepare('SELECT module_id, MAX(percent) AS best FROM module_results WHERE user_id = ? GROUP BY module_id').all(userId) as { module_id: string; best: number }[];
  return new Map(rows.map((r) => [r.module_id, r.best]));
}

export interface LessonView {
  id: string;
  moduleId: string;
  order: number;
  title: string;
  kind: 'core' | 'review';
  focus: string;
  skills: string[];
  level: string;
  difficulty: number;
  minutes: number;
  objectives: string[];
  state: LessonState;
  currentStep: number;
  score: number | null;
  bestScore: number | null;
  attempts: number;
}

export interface ModuleView {
  id: string;
  level: CourseLevel;
  order: number;
  title: string;
  topic: string;
  description: string;
  descriptionMn: string | null;
  objectives: { text: string; skills: string[] }[];
  targets: Record<string, unknown>;
  state: ModuleState;
  hasTest: boolean;
  lessons: LessonView[];
  lessonsCompleted: number;
  lessonsTotal: number;
  progress: number;
  bestTestScore: number | null;
  testPassed: boolean;
  minutesTotal: number;
  minutesRemaining: number;
  lockedReason: string | null;
}

export interface LevelView {
  code: CourseLevel;
  order: number;
  title: string;
  description: string;
  descriptionMn: string | null;
  canDo: string[];
  status: 'locked' | 'unlocked' | 'placed_out' | 'completed';
  current: boolean;
  modules: ModuleView[];
  modulesCompleted: number;
  modulesPublished: number;
  modulesPlanned: number;
  progress: number;
  minutesRemaining: number;
  hasExam: boolean;
  examAvailable: boolean;
  examPassed: boolean;
  bestExamScore: number | null;
  unlockCondition: string;
}

/** Full roadmap with the learner's state for every level, module and lesson. */
export function roadmap(db: DB, userId: number): LevelView[] {
  const settings = getSettings(db, userId);
  const levels = db.prepare('SELECT code, ord, title, description, description_mn, can_do, exam_json FROM levels ORDER BY ord').all() as {
    code: CourseLevel;
    ord: number;
    title: string;
    description: string;
    description_mn: string | null;
    can_do: string;
    exam_json: string | null;
  }[];
  const modules = db.prepare(`SELECT id, level_code, ord, title, topic, description, description_mn, objectives, targets, status, test_json FROM modules WHERE status != 'draft' ORDER BY ord`).all() as ModuleRow[];
  const lessons = db.prepare(`SELECT id, module_id, ord, title, kind, focus, skills, cefr_level, difficulty, minutes, objectives, status FROM lessons WHERE status = 'published' ORDER BY ord`).all() as LessonRow[];
  const progress = progressMap(db, userId);
  const passed = passedModules(db, userId);
  const ulevels = userLevels(db, userId);
  const examResults = db.prepare('SELECT level_code, MAX(percent) AS best, MAX(passed) AS passed FROM level_results WHERE user_id = ? GROUP BY level_code').all(userId) as {
    level_code: string;
    best: number;
    passed: number;
  }[];
  const examByLevel = new Map(examResults.map((r) => [r.level_code, r]));

  const lessonsByModule = new Map<string, LessonRow[]>();
  for (const l of lessons) lessonsByModule.set(l.module_id, [...(lessonsByModule.get(l.module_id) ?? []), l]);

  return levels.map((lv) => {
    const ul = ulevels.get(lv.code);
    const levelStatus: LevelView['status'] = ul ? (ul.status as LevelView['status']) : 'locked';
    const levelModules = modules.filter((m) => m.level_code === lv.code);
    let previousDone = true;
    const moduleViews: ModuleView[] = levelModules.map((m) => {
      const ls = lessonsByModule.get(m.id) ?? [];
      const best = passed.get(m.id) ?? null;
      const testPassed = best !== null && best >= MODULE_PASS;
      let prevLessonDone = true;
      const lessonViews: LessonView[] = ls.map((l) => {
        const p = progress.get(l.id);
        const completed = p?.status === 'completed';
        let state: LessonState;
        if (completed) state = 'completed';
        else if (p?.status === 'in_progress') state = 'in_progress';
        else state = prevLessonDone ? 'available' : 'locked';
        // Review lesson opens once every core lesson is done.
        if (l.kind === 'review' && !completed) {
          state = ls.filter((x) => x.kind === 'core').every((x) => progress.get(x.id)?.status === 'completed') ? (p ? 'in_progress' : 'available') : 'locked';
        }
        if (l.kind === 'core') prevLessonDone = completed;
        return {
          id: l.id,
          moduleId: l.module_id,
          order: l.ord,
          title: l.title,
          kind: l.kind,
          focus: l.focus,
          skills: parseJson(l.skills, []),
          level: l.cefr_level,
          difficulty: l.difficulty,
          minutes: l.minutes,
          objectives: parseJson(l.objectives, []),
          state,
          currentStep: p?.current_step ?? 0,
          score: p?.score ?? null,
          bestScore: p?.best_score ?? null,
          attempts: p?.attempts ?? 0,
        };
      });
      const lessonsCompleted = lessonViews.filter((l) => l.state === 'completed').length;
      const coreDone = lessonViews.filter((l) => l.kind === 'core').every((l) => l.state === 'completed');
      const minutesTotal = m.status === 'planned' ? PLANNED_MODULE_MINUTES : ls.reduce((a, l) => a + l.minutes, 0) + (m.test_json ? MODULE_TEST_MINUTES : 0);
      const minutesRemaining =
        m.status === 'planned'
          ? PLANNED_MODULE_MINUTES
          : lessonViews.filter((l) => l.state !== 'completed').reduce((a, l) => a + l.minutes, 0) + (m.test_json && !testPassed ? MODULE_TEST_MINUTES : 0);

      let state: ModuleState;
      let lockedReason: string | null = null;
      if (m.status === 'planned') {
        state = 'planned';
      } else if (testPassed) {
        state = 'completed';
      } else if (levelStatus === 'placed_out' || levelStatus === 'completed') {
        state = 'optional';
      } else if (levelStatus === 'locked') {
        state = 'locked';
        lockedReason = `Unlock ${lv.code} by passing the previous level exam.`;
      } else if (!previousDone) {
        state = 'locked';
        lockedReason = 'Complete the previous module first.';
      } else if (coreDone && m.test_json) {
        state = 'test_ready';
      } else {
        state = lessonViews.some((l) => l.state === 'completed' || l.state === 'in_progress') ? 'in_progress' : 'available';
      }
      if (m.status !== 'planned') previousDone = state === 'completed' || (!m.test_json && coreDone);

      const units = lessonViews.length + (m.test_json ? 1 : 0);
      return {
        id: m.id,
        level: m.level_code,
        order: m.ord,
        title: m.title,
        topic: m.topic,
        description: m.description,
        descriptionMn: m.description_mn,
        objectives: parseJson(m.objectives, []),
        targets: parseJson(m.targets, {}),
        state,
        hasTest: !!m.test_json,
        lessons: lessonViews,
        lessonsCompleted,
        lessonsTotal: lessonViews.length,
        progress: units ? (lessonsCompleted + (testPassed ? 1 : 0)) / units : 0,
        bestTestScore: best,
        testPassed,
        minutesTotal,
        minutesRemaining,
        lockedReason,
      };
    });

    const published = moduleViews.filter((m) => m.state !== 'planned');
    const exam = examByLevel.get(lv.code);
    const hasExam = !!lv.exam_json;
    const allDone = published.length > 0 && published.every((m) => m.state === 'completed');
    const halfDone = published.filter((m) => m.state === 'completed').length >= Math.ceil(published.length / 2);
    const idx = COURSE_LEVELS.indexOf(lv.code);
    return {
      code: lv.code,
      order: lv.ord,
      title: lv.title,
      description: lv.description,
      descriptionMn: lv.description_mn,
      canDo: parseJson(lv.can_do, []),
      status: levelStatus,
      current: settings.courseLevel === lv.code,
      modules: moduleViews,
      modulesCompleted: published.filter((m) => m.state === 'completed').length,
      modulesPublished: published.length,
      modulesPlanned: moduleViews.length - published.length,
      progress: moduleViews.length ? moduleViews.reduce((a, m) => a + (m.state === 'planned' ? 0 : m.progress), 0) / moduleViews.length : 0,
      minutesRemaining: levelStatus === 'completed' || levelStatus === 'placed_out' ? 0 : moduleViews.reduce((a, m) => a + (m.state === 'completed' ? 0 : m.minutesRemaining), 0),
      hasExam,
      examAvailable: hasExam && (levelStatus === 'unlocked' || levelStatus === 'completed') && (allDone || halfDone),
      examPassed: !!exam?.passed,
      bestExamScore: exam?.best ?? null,
      unlockCondition:
        idx === 0
          ? 'Available from the start.'
          : `Pass the ${COURSE_LEVELS[idx - 1]} level exam (70% overall, at least 55% in every skill), or place into this level with the placement test.`,
    };
  });
}

export type NextStep =
  | { type: 'lesson'; lessonId: string; lessonTitle: string; moduleId: string; moduleTitle: string; level: CourseLevel; currentStep: number; kind: 'core' | 'review'; minutes: number }
  | { type: 'module_test'; moduleId: string; moduleTitle: string; level: CourseLevel }
  | { type: 'level_exam'; level: CourseLevel }
  | { type: 'waiting'; level: CourseLevel; message: string }
  | { type: 'done' };

/** The single most appropriate next curriculum step. */
export function nextStep(db: DB, userId: number, map?: LevelView[]): NextStep {
  const settings = getSettings(db, userId);
  const levels = map ?? roadmap(db, userId);
  const level = levels.find((l) => l.code === settings.courseLevel) ?? levels[0];
  for (const m of level.modules) {
    if (m.state === 'planned' || m.state === 'completed' || m.state === 'optional') continue;
    if (m.state === 'locked') break;
    const lesson = m.lessons.find((l) => l.state !== 'completed');
    if (lesson) {
      return {
        type: 'lesson',
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        moduleId: m.id,
        moduleTitle: m.title,
        level: level.code,
        currentStep: lesson.currentStep,
        kind: lesson.kind,
        minutes: lesson.minutes,
      };
    }
    if (m.hasTest) return { type: 'module_test', moduleId: m.id, moduleTitle: m.title, level: level.code };
  }
  if (level.examAvailable && !level.examPassed) return { type: 'level_exam', level: level.code };
  if (level.status === 'completed' && !nextCourseLevel(level.code)) return { type: 'done' };
  return {
    type: 'waiting',
    level: level.code,
    message:
      level.modulesPlanned > 0
        ? `You've finished every module that is ready in ${level.code}. More modules are in preparation — meanwhile, keep reviewing and practising.`
        : `Keep practising — the ${level.code} exam becomes available when the modules are complete.`,
  };
}

/** Unlock a level (placement or level exam). */
export function unlockLevel(db: DB, userId: number, level: CourseLevel, now: Date): void {
  db.prepare(
    `INSERT INTO user_levels (user_id, level_code, status, unlocked_at) VALUES (?, ?, 'unlocked', ?)
     ON CONFLICT(user_id, level_code) DO NOTHING`,
  ).run(userId, level, now.toISOString());
}

export function setCourseLevel(db: DB, userId: number, level: CourseLevel): void {
  db.prepare('UPDATE user_settings SET course_level = ? WHERE user_id = ?').run(level, userId);
}

/** Place the learner at a level: earlier levels become optional ("placed out"). */
export function placeAtLevel(db: DB, userId: number, level: CourseLevel, now: Date): void {
  const idx = COURSE_LEVELS.indexOf(level);
  db.transaction(() => {
    COURSE_LEVELS.forEach((code, i) => {
      if (i < idx) {
        db.prepare(
          `INSERT INTO user_levels (user_id, level_code, status, unlocked_at) VALUES (?, ?, 'placed_out', ?)
           ON CONFLICT(user_id, level_code) DO UPDATE SET status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'placed_out' END`,
        ).run(userId, code, now.toISOString());
      }
    });
    unlockLevel(db, userId, level, now);
    setCourseLevel(db, userId, level);
  })();
}

/** After a passed level exam: mark completed, unlock and move to the next level. */
export function completeLevel(db: DB, userId: number, level: CourseLevel, now: Date): CourseLevel | null {
  const next = nextCourseLevel(level);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO user_levels (user_id, level_code, status, unlocked_at, completed_at) VALUES (?, ?, 'completed', ?, ?)
       ON CONFLICT(user_id, level_code) DO UPDATE SET status = 'completed', completed_at = excluded.completed_at`,
    ).run(userId, level, now.toISOString(), now.toISOString());
    if (next) {
      unlockLevel(db, userId, next, now);
      setCourseLevel(db, userId, next);
    }
  })();
  return next;
}

export function moduleView(db: DB, userId: number, moduleId: string): ModuleView | null {
  for (const level of roadmap(db, userId)) {
    const m = level.modules.find((x) => x.id === moduleId);
    if (m) return m;
  }
  return null;
}

/** Remaining course minutes from the current level to the end of C1. */
export function remainingCourseMinutes(levels: LevelView[], current: CourseLevel): number {
  const idx = COURSE_LEVELS.indexOf(current);
  return levels.filter((l) => COURSE_LEVELS.indexOf(l.code) >= idx).reduce((a, l) => a + l.minutesRemaining + (l.examPassed || !l.hasExam ? 0 : 60), 0);
}
