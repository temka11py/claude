// Keeps learners' progress across re-seeding. Content rows get new ids on every
// seed, so learning data is saved by stable natural keys (lesson slug, kana
// character, word + reading, kanji, grammar slug, question key, day slug…) and
// re-attached to the new rows afterwards. Rows whose content disappeared are dropped.
import type { PrismaClient } from '@prisma/client';

type Natural = Map<number, string>;

async function naturalKeys(prisma: PrismaClient) {
  const [lessons, kana, vocab, kanji, grammar, quizzes, questions, days] = await Promise.all([
    prisma.lesson.findMany({ select: { id: true, slug: true } }),
    prisma.kana.findMany({ select: { id: true, script: true, char: true } }),
    prisma.vocabulary.findMany({ select: { id: true, word: true, kana: true } }),
    prisma.kanji.findMany({ select: { id: true, char: true } }),
    prisma.grammar.findMany({ select: { id: true, slug: true } }),
    prisma.quiz.findMany({ select: { id: true, slug: true } }),
    prisma.question.findMany({ select: { id: true, key: true } }),
    prisma.programDay.findMany({ select: { id: true, slug: true } }),
  ]);
  return {
    lesson: new Map(lessons.map((l) => [l.id, l.slug])) as Natural,
    kana: new Map(kana.map((k) => [k.id, `${k.script}:${k.char}`])) as Natural,
    vocab: new Map(vocab.map((v) => [v.id, `${v.word}|${v.kana}`])) as Natural,
    kanji: new Map(kanji.map((k) => [k.id, k.char])) as Natural,
    grammar: new Map(grammar.map((g) => [g.id, g.slug])) as Natural,
    quiz: new Map(quizzes.map((q) => [q.id, q.slug])) as Natural,
    question: new Map(questions.map((q) => [q.id, q.key])) as Natural,
    day: new Map(days.map((d) => [d.id, d.slug])) as Natural,
  };
}

const invert = (m: Natural) => new Map([...m].map(([id, key]) => [key, id]));
const drop = <T extends object, K extends keyof T>(row: T, ...keys: K[]): Omit<T, K> => {
  const copy = { ...row };
  for (const k of keys) delete copy[k];
  return copy;
};

export async function snapshotLearning(prisma: PrismaClient) {
  const keys = await naturalKeys(prisma);
  const [progress, reviews, favorites, attempts, dayProgress] = await Promise.all([
    prisma.userProgress.findMany(),
    prisma.reviewItem.findMany(),
    prisma.favorite.findMany(),
    prisma.quizAttempt.findMany({ include: { answers: true } }),
    prisma.programDay.count().then((n) => (n ? prisma.dayProgress.findMany() : [])),
  ]);
  return {
    progress: progress.map((p) => ({ ...drop(p, 'id', 'lessonId'), lesson: keys.lesson.get(p.lessonId) })),
    reviews: reviews.map((r) => ({
      ...drop(r, 'id', 'vocabularyId', 'kanjiId', 'grammarId', 'kanaId', 'key'),
      ref: r.vocabularyId ? keys.vocab.get(r.vocabularyId) : r.kanjiId ? keys.kanji.get(r.kanjiId) : r.grammarId ? keys.grammar.get(r.grammarId) : r.kanaId ? keys.kana.get(r.kanaId) : undefined,
    })),
    favorites: favorites.map((f) => ({ ...drop(f, 'id', 'vocabularyId', 'kanjiId', 'key'), vocab: f.vocabularyId ? keys.vocab.get(f.vocabularyId) : undefined, kanji: f.kanjiId ? keys.kanji.get(f.kanjiId) : undefined })),
    attempts: attempts.map((a) => ({
      ...drop(a, 'quizId', 'answers'),
      quiz: a.quizId ? keys.quiz.get(a.quizId) : undefined,
      answers: a.answers.map((ans) => ({ ...drop(ans, 'id', 'attemptId', 'questionId'), question: keys.question.get(ans.questionId) })),
    })),
    dayProgress: dayProgress.map((d) => ({ ...drop(d, 'id', 'dayId'), day: keys.day.get(d.dayId) })),
  };
}

export type LearningSnapshot = Awaited<ReturnType<typeof snapshotLearning>>;

export async function restoreLearning(prisma: PrismaClient, snap: LearningSnapshot) {
  const keys = await naturalKeys(prisma);
  const id = {
    lesson: invert(keys.lesson), kana: invert(keys.kana), vocab: invert(keys.vocab), kanji: invert(keys.kanji),
    grammar: invert(keys.grammar), quiz: invert(keys.quiz), question: invert(keys.question), day: invert(keys.day),
  };
  const counts = { progress: 0, reviews: 0, favorites: 0, attempts: 0, days: 0 };

  for (const p of snap.progress) {
    const lessonId = p.lesson && id.lesson.get(p.lesson);
    if (!lessonId) continue;
    await prisma.userProgress.create({ data: { ...drop(p, 'lesson'), lessonId } });
    counts.progress++;
  }

  const FK = { vocab: 'vocabularyId', kanji: 'kanjiId', grammar: 'grammarId', kana: 'kanaId' } as const;
  for (const r of snap.reviews) {
    const type = r.itemType as keyof typeof FK;
    const itemId = r.ref ? id[type]?.get(r.ref) : undefined;
    if (!itemId) continue;
    await prisma.reviewItem.create({ data: { ...drop(r, 'ref'), key: `${type}:${itemId}`, [FK[type]]: itemId } });
    counts.reviews++;
  }

  for (const f of snap.favorites) {
    const vocabularyId = f.vocab ? id.vocab.get(f.vocab) : undefined;
    const kanjiId = f.kanji ? id.kanji.get(f.kanji) : undefined;
    if (!vocabularyId && !kanjiId) continue;
    await prisma.favorite.create({ data: { ...drop(f, 'vocab', 'kanji'), key: vocabularyId ? `vocab:${vocabularyId}` : `kanji:${kanjiId}`, vocabularyId, kanjiId } });
    counts.favorites++;
  }

  for (const a of snap.attempts) {
    const quizId = a.quiz ? id.quiz.get(a.quiz) ?? null : null;
    const answers = a.answers.flatMap((ans) => {
      const questionId = ans.question ? id.question.get(ans.question) : undefined;
      return questionId ? [{ ...drop(ans, 'question'), questionId }] : [];
    });
    await prisma.quizAttempt.create({ data: { ...drop(a, 'quiz', 'answers'), quizId } });
    if (answers.length) await prisma.quizAnswer.createMany({ data: answers.map((x) => ({ ...x, attemptId: a.id })) });
    counts.attempts++;
  }

  for (const d of snap.dayProgress) {
    const dayId = d.day ? id.day.get(d.day) : undefined;
    if (!dayId) continue;
    await prisma.dayProgress.create({ data: { ...drop(d, 'day'), dayId } });
    counts.days++;
  }

  return counts;
}

/**
 * First run of the daily program: days whose lesson the learner already
 * completed (before the program existed) start out completed.
 */
export async function adoptCompletedLessons(prisma: PrismaClient) {
  const users = await prisma.user.findMany({ select: { id: true, dayProgress: { select: { id: true }, take: 1 } } });
  const days = await prisma.programDay.findMany({ where: { kind: { in: ['kana', 'lesson'] }, lessonId: { not: null } }, select: { id: true, lessonId: true, steps: true } });
  let adopted = 0;
  for (const user of users) {
    if (user.dayProgress.length) continue;
    const done = await prisma.userProgress.findMany({ where: { userId: user.id, status: 'completed' }, select: { lessonId: true, completedAt: true } });
    const doneAt = new Map(done.map((d) => [d.lessonId, d.completedAt ?? new Date()]));
    for (const day of days) {
      const at = doneAt.get(day.lessonId!);
      if (!at) continue;
      const steps = (JSON.parse(day.steps) as { key: string }[]).map((s) => s.key);
      await prisma.dayProgress.create({
        data: { userId: user.id, dayId: day.id, stepsDone: JSON.stringify(steps), completedAt: at, completedOn: at.toISOString().slice(0, 10) },
      });
      adopted++;
    }
  }
  return adopted;
}
