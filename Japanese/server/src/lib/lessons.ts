import { prisma } from './prisma.js';
import { parseJson } from './json.js';

export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface LessonState {
  id: number;
  status: LessonStatus;
  sectionsDone: string[];
  quizScore: number | null;
}

/**
 * Lesson status for the library. The daily program guides the order, so no
 * lesson is locked: every lesson is open to browse at any time.
 */
export async function lessonStates(userId: string): Promise<Map<number, LessonState>> {
  const [lessons, progress] = await Promise.all([
    prisma.lesson.findMany({ orderBy: { globalOrder: 'asc' }, select: { id: true } }),
    prisma.userProgress.findMany({ where: { userId } }),
  ]);
  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  const states = new Map<number, LessonState>();
  for (const lesson of lessons) {
    const p = byLesson.get(lesson.id);
    let status: LessonStatus;
    if (p?.status === 'completed') status = 'completed';
    else if (p) status = 'in_progress';
    else status = 'available';
    states.set(lesson.id, {
      id: lesson.id,
      status,
      sectionsDone: parseJson<string[]>(p?.sectionsDone, []),
      quizScore: p?.quizScore ?? null,
    });
  }
  return states;
}

/** The lesson a learner should continue with: in-progress first, otherwise the next available. */
export async function nextLesson(userId: string) {
  const states = await lessonStates(userId);
  const ordered = [...states.values()];
  const target = ordered.find((s) => s.status === 'in_progress') ?? ordered.find((s) => s.status === 'available');
  if (!target) return null;
  const lesson = await prisma.lesson.findUnique({
    where: { id: target.id },
    select: { id: true, slug: true, title: true, titleJa: true, summary: true, order: true, globalOrder: true, minutes: true, module: { select: { order: true, title: true } } },
  });
  return lesson ? { ...lesson, status: target.status, sectionsDone: target.sectionsDone } : null;
}
