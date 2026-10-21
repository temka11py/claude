import { prisma } from './prisma.js';
import { computeStreak } from './dates.js';

export type DailyField = 'seconds' | 'lessons' | 'vocab' | 'kanji' | 'grammar' | 'stories' | 'reviews' | 'questions' | 'correct';

/** Increment counters for the learner's current day. */
export async function bumpDaily(userId: string, date: string, inc: Partial<Record<DailyField, number>>) {
  const data = Object.fromEntries(Object.entries(inc).filter(([, v]) => v && v > 0)) as Partial<Record<DailyField, number>>;
  if (Object.keys(data).length === 0) return;
  await prisma.dailyStat.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...data },
    update: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { increment: v }])),
  });
}

export async function getStreak(userId: string, today: string) {
  const days = await prisma.dailyStat.findMany({ where: { userId }, select: { date: true, seconds: true, lessons: true, reviews: true, questions: true, stories: true } });
  const active = days.filter((d) => d.seconds >= 60 || d.lessons > 0 || d.reviews > 0 || d.questions > 0 || d.stories > 0).map((d) => d.date);
  return computeStreak(active, today);
}

const LEARNED = ['review', 'mastered'];

export async function learnedCounts(userId: string) {
  const grouped = await prisma.reviewItem.groupBy({
    by: ['itemType', 'state'],
    where: { userId },
    _count: { _all: true },
  });
  const byType = (type: string) => {
    const rows = grouped.filter((g) => g.itemType === type);
    const count = (states: string[]) => rows.filter((r) => states.includes(r.state)).reduce((s, r) => s + r._count._all, 0);
    return {
      new: count(['new']),
      learning: count(['learning']),
      review: count(['review']),
      mastered: count(['mastered']),
      learned: count(LEARNED),
    };
  };
  return { vocab: byType('vocab'), kanji: byType('kanji'), grammar: byType('grammar'), kana: byType('kana') };
}

/** Completion across the N5 syllabus areas (used by the dashboard and progress page). */
export async function overallProgress(userId: string) {
  const [learned, totals, completedLessons, storiesDone, listeningDone] = await Promise.all([
    learnedCounts(userId),
    Promise.all([prisma.vocabulary.count(), prisma.kanji.count(), prisma.grammar.count(), prisma.story.count(), prisma.listeningExercise.count(), prisma.lesson.count()]),
    prisma.userProgress.findMany({ where: { userId, status: 'completed' }, select: { lessonId: true } }),
    prisma.activity.findMany({ where: { userId, type: 'story' }, distinct: ['refId'], select: { refId: true } }),
    prisma.activity.findMany({ where: { userId, type: 'listening' }, distinct: ['refId'], select: { refId: true } }),
  ]);
  const [vocabTotal, kanjiTotal, grammarTotal, storyTotal, listeningTotal, lessonTotal] = totals;
  const grammarDone = await prisma.grammar.count({ where: { lessonId: { in: completedLessons.map((l) => l.lessonId) } } });
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  return {
    lessons: { done: completedLessons.length, total: lessonTotal, percent: pct(completedLessons.length, lessonTotal) },
    vocabulary: { done: learned.vocab.learned, total: vocabTotal, percent: pct(learned.vocab.learned, vocabTotal) },
    kanji: { done: learned.kanji.learned, total: kanjiTotal, percent: pct(learned.kanji.learned, kanjiTotal) },
    grammar: { done: grammarDone, total: grammarTotal, percent: pct(grammarDone, grammarTotal) },
    reading: { done: storiesDone.length, total: storyTotal, percent: pct(storiesDone.length, storyTotal) },
    listening: { done: listeningDone.length, total: listeningTotal, percent: pct(listeningDone.length, listeningTotal) },
    learned,
  };
}

/** Categories with the lowest accuracy over the learner's recent answers. */
export async function weakAreas(userId: string, limit = 3) {
  const recent = await prisma.quizAnswer.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take: 400,
    select: { category: true, correct: true },
  });
  const stats = new Map<string, { correct: number; total: number }>();
  for (const a of recent) {
    const s = stats.get(a.category) ?? { correct: 0, total: 0 };
    s.total++;
    if (a.correct) s.correct++;
    stats.set(a.category, s);
  }
  const all = [...stats.entries()].map(([category, s]) => ({ category, ...s, accuracy: Math.round((s.correct / s.total) * 100) }));
  return {
    all: all.sort((a, b) => a.accuracy - b.accuracy),
    weak: all.filter((c) => c.total >= 4 && c.accuracy < 80).slice(0, limit),
  };
}
