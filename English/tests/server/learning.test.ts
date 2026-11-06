import { describe, expect, it } from 'vitest';
import * as z4 from 'zod/v4';
import { answersFor, createTestApp, GOOD_TEXT } from './helpers';
import type { AIProvider } from '../../server/ai/provider';
import { plannerInput } from '../../server/services/session';

const DAY0 = '2026-03-02T09:00:00';
const at = (days: number, hour = 9) => {
  const d = new Date(DAY0);
  d.setDate(d.getDate() + days);
  d.setHours(hour);
  return d.toISOString();
};

describe('lessons and progress', () => {
  it('serves a structured lesson and completes it', async () => {
    const t = await createTestApp();
    const lesson = await t.json('GET', '/api/lessons/b1-01-l1');
    expect(lesson.steps.map((s: { kind: string }) => s.kind)).toEqual(['warmup', 'objectives', 'vocabulary', 'vocab_practice', 'reading', 'quiz']);
    expect(lesson.steps[2].words).toHaveLength(12);
    expect(lesson.steps[2].words[0]).toHaveProperty('mongolian');

    await t.json('POST', '/api/lessons/b1-01-l1/progress', { step: 3 });
    expect((await t.json('GET', '/api/lessons/b1-01-l1')).progress.currentStep).toBe(3);

    const done = await t.json('POST', '/api/lessons/b1-01-l1/complete', { score: 0.8, skillScores: { vocabulary: 0.8, reading: 0.9 } }, { now: DAY0 });
    expect(done.firstCompletion).toBe(true);
    expect(done.wordsAdded).toBe(12);
    expect(done.xp).toBeGreaterThanOrEqual(50);
    expect(done.achievements.map((a: { code: string }) => a.code)).toContain('first_lesson');
    expect(done.next).toMatchObject({ type: 'lesson', lessonId: 'b1-01-l2' });

    const course = await t.json('GET', '/api/course');
    const mod = course.levels[0].modules.find((m: { id: string }) => m.id === 'b1-01');
    expect(mod.lessons[0].state).toBe('completed');
    expect(mod.lessons[1].state).toBe('available');
    expect(mod.lessons[2].state).toBe('locked');
    expect(mod.progress).toBeCloseTo(1 / 6);
  });

  it('adapts difficulty and adds extra practice after a weak result', async () => {
    const t = await createTestApp();
    const before = t.db.prepare(`SELECT difficulty FROM skill_profile WHERE user_id = ? AND skill = 'grammar'`).pluck().get(t.userId) as number;
    const weak = await t.json('POST', '/api/lessons/b1-01-l2/complete', { score: 0.3, skillScores: { grammar: 0.3 } }, { now: DAY0 });
    expect(weak.action).toBe('review_prerequisites');
    expect(weak.message).toMatch(/Not quite yet/);
    const after = t.db.prepare(`SELECT difficulty FROM skill_profile WHERE user_id = ? AND skill = 'grammar'`).pluck().get(t.userId) as number;
    expect(after).toBe(before - 1);
    const focus = JSON.parse(t.db.prepare('SELECT focus FROM weekly_focus WHERE user_id = ?').pluck().get(t.userId) as string);
    expect(focus.extra.grammar).toBeGreaterThanOrEqual(1);

    const strong = await t.json('POST', '/api/lessons/b1-01-l3/complete', { score: 1, skillScores: { listening: 0.95 } }, { now: DAY0 });
    expect(strong.action).toBe('increase');
  });

  it('collects mistakes and resolves them after three correct reviews', async () => {
    const t = await createTestApp();
    await t.json('POST', '/api/practice/answers', {
      context: { type: 'lesson', id: 'b1-01-l2' },
      answers: [{ questionId: 'q1', skill: 'grammar', qtype: 'correct', correct: false, score: 0, wrong: 'I am agree with you.', right: 'I agree with you.', explanation: 'agree is a verb' }],
    }, { now: DAY0 });
    const list = await t.json('GET', '/api/mistakes');
    expect(list.errors).toHaveLength(1);
    expect((await t.json('GET', '/api/mistakes/review', undefined, { now: DAY0 })).items).toHaveLength(0);
    const due = await t.json('GET', '/api/mistakes/review', undefined, { now: at(2) });
    expect(due.items).toHaveLength(1);
    const id = due.items[0].id;
    for (const [i, d] of [2, 9, 23].entries()) {
      const r = await t.json('POST', `/api/mistakes/${id}/review`, { answer: "i agree with you" }, { now: at(d) });
      expect(r.correct).toBe(true);
      expect(r.resolved).toBe(i === 2);
    }
    expect((await t.json('GET', '/api/mistakes?status=resolved')).errors).toHaveLength(1);
  });
});

describe('review scheduling and streaks', () => {
  it('schedules reviews same day → 2 days, with look-ahead for every-other-day learners', async () => {
    const t = await createTestApp();
    await t.json('POST', '/api/lessons/b1-01-l1/complete', { score: 1 }, { now: DAY0 });
    const q0 = await t.json('GET', '/api/review/queue?limit=50', undefined, { now: at(0, 10) });
    expect(q0.items).toHaveLength(12);
    const vocabId = q0.items[0].exercise.vocabId;
    const g = await t.json('POST', '/api/review/grade', { vocabId, grade: 'good', mode: 'flashcard' }, { now: at(0, 10) });
    expect(g.intervalDays).toBe(2);

    const day1 = await t.json('GET', '/api/review/queue?limit=50', undefined, { now: at(1) });
    expect(day1.items.some((i: { exercise: { vocabId: string } }) => i.exercise.vocabId === vocabId)).toBe(false);

    await t.json('PUT', '/api/settings', { schedule: 'alternate' });
    const day1alt = await t.json('GET', '/api/review/queue?limit=50', undefined, { now: at(1) });
    expect(day1alt.items.some((i: { exercise: { vocabId: string } }) => i.exercise.vocabId === vocabId)).toBe(true);

    const again = await t.json('POST', '/api/review/grade', { vocabId, grade: 'again', mode: 'flashcard' }, { now: at(2) });
    expect(again.intervalDays).toBe(0);
  });

  it('counts study days into a streak and never resets progress after a break', async () => {
    const t = await createTestApp();
    await t.json('POST', '/api/activity', { type: 'review', minutes: 5 }, { now: at(0) });
    await t.json('POST', '/api/activity', { type: 'review', minutes: 5 }, { now: at(1) });
    const s1 = await t.json('GET', '/api/dashboard', undefined, { now: at(1, 20) });
    expect(s1.streak.current).toBe(2);
    await t.json('POST', '/api/lessons/b1-01-l1/complete', { score: 1 }, { now: at(1) });

    // Four days away: gentle recovery, progress intact.
    const back = await t.json('GET', '/api/dashboard', undefined, { now: at(5) });
    expect(back.welcomeBack).toMatch(/Welcome back/);
    expect(back.streak.current).toBe(0);
    expect(back.streak.longest).toBe(2);
    const plan = await t.json('GET', '/api/session/preview', undefined, { now: at(5) });
    expect(plan.mode).toBe('recovery');
    expect(t.db.prepare(`SELECT status FROM user_progress WHERE lesson_id = 'b1-01-l1'`).pluck().get()).toBe('completed');
  });
});

describe('daily session', () => {
  it('plans a session and completes it item by item', async () => {
    const t = await createTestApp();
    const { session } = await t.json('POST', '/api/session/start', {}, { now: DAY0 });
    expect(session.items.length).toBeGreaterThan(0);
    expect(session.items[0].type).toBe('lesson');
    let last;
    for (let i = 0; i < session.items.length; i++) last = await t.json('POST', `/api/session/${session.id}/items/${i}/complete`, {}, { now: DAY0 });
    expect(last.session.status).toBe('completed');
    const again = await t.json('POST', '/api/session/start', {}, { now: DAY0 });
    expect(again.session.id).toBe(session.id);
  });

  it('ticks off session items when the work is done elsewhere', async () => {
    const t = await createTestApp();
    const { session } = await t.json('POST', '/api/session/start', {}, { now: DAY0 });
    const lessonIndex = session.items.findIndex((i: { type: string }) => i.type === 'lesson');
    await t.json('POST', `/api/lessons/${session.items[lessonIndex].payload.lessonId}/complete`, { score: 0.9 }, { now: DAY0 });
    const today = await t.json('GET', '/api/session/today', undefined, { now: DAY0 });
    expect(today.session.items[lessonIndex].done).toBe(true);
  });

  it('ticks off a planned lesson segment once its last step is done anywhere', async () => {
    const t = await createTestApp();
    await t.json('PUT', '/api/settings', { dailyMinutes: 15 });
    const { session } = await t.json('POST', '/api/session/start', {}, { now: DAY0 });
    const lessonIndex = session.items.findIndex((i: { type: string }) => i.type === 'lesson');
    const { lessonId, toStep } = session.items[lessonIndex].payload;
    await t.json('POST', `/api/lessons/${lessonId}/progress`, { step: toStep }, { now: DAY0 });
    expect((await t.json('GET', '/api/session/today', undefined, { now: DAY0 })).session.items[lessonIndex].done).toBe(false);
    await t.json('POST', `/api/lessons/${lessonId}/progress`, { step: toStep + 1 }, { now: DAY0 });
    expect((await t.json('GET', '/api/session/today', undefined, { now: DAY0 })).session.items[lessonIndex].done).toBe(true);
  });

  it('lets a practised task rest before offering it again, longer after each repeat', async () => {
    const t = await createTestApp();
    const speaking = (when: string) => plannerInput(t.db, t.userId, new Date(when)).available.speaking;
    await t.json('POST', '/api/lessons/b1-01-l2/complete', { score: 1 }, { now: DAY0 });
    expect(speaking(at(1))).toEqual([]);
    expect(speaking(at(3))).toEqual(['b1-01-s-typical-day']);

    t.db
      .prepare(`INSERT INTO activity_log (user_id, type, ref, skill, minutes, created_at, date) VALUES (?, 'speaking', 'b1-01-s-typical-day', 'speaking', 5, ?, ?)`)
      .run(t.userId, at(3), at(3).slice(0, 10));
    expect(speaking(at(9))).toEqual([]);
    expect(speaking(at(10))).toEqual(['b1-01-s-typical-day']);
  });
});

describe('module test and level progression', () => {
  it('never sends answers to the browser and grades on the server', async () => {
    const t = await createTestApp();
    const paper = await t.json('POST', '/api/modules/b1-01/test', {});
    const text = JSON.stringify(paper);
    expect(paper.sections.map((s: { skill: string }) => s.skill)).toEqual(['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking']);
    expect(text).not.toMatch(/"answer":/);
    expect(text).not.toMatch(/"answers":/);
    expect(text).not.toMatch(/"wrongIndex":/);

    const fail = await t.json('POST', `/api/tests/${paper.attemptId}/submit`, { answers: {} });
    expect(fail.passed).toBe(false);
    expect(fail.message).toMatch(/Not quite yet/);
    expect(fail.recommendations.length).toBeGreaterThan(0);
    expect((await t.req('POST', `/api/tests/${paper.attemptId}/submit`, { answers: {} })).statusCode).toBe(409);
  });

  it('passing tests completes the module and a passed level exam unlocks the next level', async () => {
    const t = await createTestApp();
    // A new, different paper each attempt.
    const paper = await t.json('POST', '/api/modules/b1-01/test', { fresh: true });
    const result = await t.json('POST', `/api/tests/${paper.attemptId}/submit`, {
      answers: answersFor(t.db, paper.attemptId),
      writing: { text: GOOD_TEXT },
      speaking: { selfRating: 1 },
    });
    expect(result.percent).toBeGreaterThan(0.8);
    expect(result.passed).toBe(true);
    expect(result.objectives.filter((o: { achieved: boolean }) => o.achieved).length).toBeGreaterThanOrEqual(4);
    expect(result.writingFeedback.source).toBe('automatic');

    const course = await t.json('GET', '/api/course');
    const b1 = course.levels.find((l: { code: string }) => l.code === 'B1');
    expect(b1.modules.find((m: { id: string }) => m.id === 'b1-01').state).toBe('completed');
    expect(b1.examAvailable).toBe(true);
    expect(course.levels.find((l: { code: string }) => l.code === 'B1+').status).toBe('locked');

    const exam = await t.json('POST', `/api/levels/${encodeURIComponent('B1')}/exam`, {});
    const examResult = await t.json('POST', `/api/tests/${exam.attemptId}/submit`, {
      answers: answersFor(t.db, exam.attemptId),
      writing: { text: GOOD_TEXT },
      speaking: { selfRating: 1 },
    });
    expect(examResult.passed).toBe(true);
    expect(examResult.recommendation).toBe('Recommended to continue to B1+.');
    const after = await t.json('GET', '/api/course');
    expect(after.courseLevel).toBe('B1+');
    expect(after.levels.find((l: { code: string }) => l.code === 'B1').status).toBe('completed');
    expect(after.levels.find((l: { code: string }) => l.code === 'B1+').status).toBe('unlocked');
    const skills = t.db.prepare(`SELECT score FROM skill_profile WHERE user_id = ? AND skill = 'grammar'`).pluck().get(t.userId) as number;
    expect(skills).toBeGreaterThan(2);
  });

  it('does not unlock the next level on a weak exam', async () => {
    const t = await createTestApp();
    const paper = await t.json('POST', '/api/modules/b1-01/test', {});
    await t.json('POST', `/api/tests/${paper.attemptId}/submit`, { answers: answersFor(t.db, paper.attemptId), writing: { text: GOOD_TEXT }, speaking: { selfRating: 1 } });
    const exam = await t.json('POST', '/api/levels/B1/exam', {});
    const r = await t.json('POST', `/api/tests/${exam.attemptId}/submit`, { answers: answersFor(t.db, exam.attemptId, (i) => i % 3 === 0) });
    expect(r.passed).toBe(false);
    expect(r.recommendation).toMatch(/Not quite yet/);
    expect((await t.json('GET', '/api/course')).courseLevel).toBe('B1');
  });
});

describe('placement', () => {
  it('estimates a CEFR profile and places the learner', async () => {
    const t = await createTestApp();
    const paper = await t.json('GET', '/api/placement');
    expect(JSON.stringify(paper)).not.toMatch(/"answer":/);
    const answers = answersFor(t.db, paper.attemptId);
    const result = await t.json('POST', `/api/placement/${paper.attemptId}/submit`, { answers, writing: { text: GOOD_TEXT } });
    expect(result.labels.grammar).toMatch(/C1/);
    expect(result.provisional).toContain('speaking');
    expect(['B2+', 'C1']).toContain(result.recommendedStart);
    const accept = await t.json('POST', '/api/placement/accept', { level: 'B2' });
    expect(accept.courseLevel).toBe('B2');
    const course = await t.json('GET', '/api/course');
    expect(course.levels.find((l: { code: string }) => l.code === 'B1').status).toBe('placed_out');
  });
});

describe('practice features', () => {
  it('unlocks games once enough words are known and records results', async () => {
    const t = await createTestApp();
    const locked = await t.json('GET', '/api/games');
    expect(locked.find((g: { id: string }) => g.id === 'word-match').available).toBe(false);
    await t.json('POST', '/api/lessons/b1-01-l1/complete', { score: 1 });
    const round = await t.json('GET', '/api/games/word-match/round');
    expect(round.pairs.length).toBeGreaterThanOrEqual(3);
    const r = await t.json('POST', '/api/games/word-match/result', { correct: 5, total: 6, words: round.pairs.map((p: { vocabId: string }) => ({ vocabId: p.vocabId, correct: true })) });
    expect(r.score).toBeCloseTo(5 / 6);
    expect(r.achievements.map((a: { code: string }) => a.code)).toContain('first_game');
  });

  it('gives automatic writing feedback and logs corrections as mistakes', async () => {
    const t = await createTestApp();
    const r = await t.json('POST', '/api/writing/submit', { text: 'I am agree that nowadays people is busy. We discussed about it yesterday.', context: 'practice' });
    expect(r.feedback.source).toBe('automatic');
    expect(r.feedback.corrections.length).toBeGreaterThanOrEqual(3);
    expect((await t.json('GET', '/api/mistakes')).errors.length).toBeGreaterThanOrEqual(3);
  });

  it('uses the AI provider for feedback when one is configured', async () => {
    const fake: AIProvider = {
      available: true,
      model: 'fake-model',
      complete: async () => 'ok',
      stream: async (_o, onText) => {
        onText('Hello from the tutor');
        return 'Hello from the tutor';
      },
      structured: async <T,>(o: { schema: z4.ZodType<T> }) =>
        o.schema.parse({
          score: 72,
          levelEstimate: 'B1+',
          summary: 'Good work.',
          strengths: ['Clear ideas'],
          improvements: ['Use more linkers'],
          corrections: [{ original: 'I am agree.', improved: 'I agree.', explanation: 'agree is a verb', explanationMn: '', category: 'grammar' }],
          betterVersion: 'I agree.',
          usefulVocabulary: [{ phrase: 'in my view', meaning: 'I think' }],
          criteria: { taskAchievement: 4, grammar: 3, vocabulary: 3, coherence: 4, register: 4 },
        }) as T,
    };
    const t = await createTestApp({ ai: fake });
    const r = await t.json('POST', '/api/writing/submit', { text: 'I am agree with this idea because it is useful for everyone.', context: 'practice' });
    expect(r.feedback.source).toBe('ai');
    expect(r.feedback.score).toBe(72);
    const tutor = await t.req('POST', '/api/tutor/message', { message: 'Hi' });
    expect(tutor.body).toContain('event: delta');
    expect(tutor.body).toContain('Hello from the tutor');
    expect(tutor.body).toContain('event: done');
  });

  it('answers offline in the tutor and runs a guided conversation without AI', async () => {
    const t = await createTestApp();
    await t.json('POST', '/api/lessons/b1-01-l1/complete', { score: 1 });
    const tutor = await t.req('POST', '/api/tutor/message', { message: 'What does commute mean?' });
    expect(tutor.body).toContain('commute');
    expect(tutor.body).toMatch(/Монголоор/);

    const { thread } = await t.json('POST', '/api/conversation/start', { scenarioId: 'cafe' });
    expect(thread.guided).toBe(true);
    const reply = await t.req('POST', `/api/conversation/${thread.id}/message`, { message: "I'd like a cappuccino, please." });
    expect(reply.body).toContain('Would you like anything to eat?');
    const fin = await t.json('POST', `/api/conversation/${thread.id}/finish`, {});
    expect(fin.feedback.source).toBe('guided');
    expect(fin.feedback.samples).toHaveLength(3);
  });
});
