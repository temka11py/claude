// End-to-end API flow against the seeded development database.
// A throwaway user is created and deleted at the end (cascades remove its data).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.loadEnvFile?.('.env');
const { createApp } = await import('../app.js');
const { prisma } = await import('../lib/prisma.js');

const app = createApp();
const agent = request.agent(app);
const email = `test-${Date.now()}@example.com`;
const today = '2026-09-26';

before(async () => {
  const res = await agent.post('/api/auth/register').send({ name: 'Tester', email, password: 'password123' });
  assert.equal(res.status, 201);
});

after(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test('auth: protected routes reject anonymous requests', async () => {
  const res = await request(app).get('/api/modules');
  assert.equal(res.status, 401);
});

test('auth: duplicate registration and bad login are rejected', async () => {
  assert.equal((await request(app).post('/api/auth/register').send({ name: 'x', email, password: 'password123' })).status, 409);
  assert.equal((await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' })).status, 401);
  assert.equal((await request(app).post('/api/auth/register').send({ name: '', email: 'bad', password: '1' })).status, 400);
});

test('auth: password is stored hashed', async () => {
  const user = await prisma.user.findUnique({ where: { email } });
  assert.ok(user && user.passwordHash !== 'password123' && user.passwordHash.startsWith('$2'));
});

test('learning path: first lesson available, second locked', async () => {
  const res = await agent.get('/api/modules').set('x-local-date', today);
  assert.equal(res.status, 200);
  const lessons = res.body.modules.flatMap((m: { lessons: unknown[] }) => m.lessons);
  assert.equal(lessons[0].status, 'available');
  assert.equal(lessons[1].status, 'locked');
  const locked = await agent.get(`/api/lessons/${lessons[1].id}`);
  assert.equal(locked.status, 403);
});

test('lesson flow: quiz → complete → next unlocked → review items', async () => {
  const modules = (await agent.get('/api/modules')).body.modules;
  const first = modules[0].lessons[0];
  const lesson = (await agent.get(`/api/lessons/${first.id}`)).body;
  assert.ok(lesson.sections.includes('kana'));
  assert.ok(lesson.lesson.quiz);

  // cannot complete before the quiz
  assert.equal((await agent.post(`/api/lessons/${first.id}/complete`)).status, 400);

  const quiz = (await agent.get(`/api/quizzes/${lesson.lesson.quiz.id}`)).body.quiz;
  assert.ok(quiz.questions.length >= 5);
  for (const q of quiz.questions) assert.equal(q.correctAnswer, undefined, 'answers must not leak');

  // answer every question correctly using the DB (simulates a perfect learner)
  const answers: Record<string, string> = {};
  for (const q of quiz.questions) {
    const row = await prisma.question.findUnique({ where: { id: q.id } });
    answers[q.id] = row!.correctAnswer.split('||')[0];
  }
  const submit = await agent.post('/api/quiz/submit').set('x-local-date', today).send({ quizId: quiz.id, answers, durationSec: 60 });
  assert.equal(submit.status, 200);
  assert.equal(submit.body.attempt.percent, 100);
  assert.equal(submit.body.attempt.passed, true);

  const done = await agent.post(`/api/lessons/${first.id}/complete`).set('x-local-date', today);
  assert.equal(done.status, 200);
  assert.ok(done.body.reviewItemsAdded > 0);
  assert.ok(done.body.achievements.some((a: { code: string }) => a.code === 'first_lesson'));

  const after = (await agent.get('/api/modules')).body.modules;
  assert.equal(after[0].lessons[0].status, 'completed');
  assert.equal(after[0].lessons[1].status, 'available');
});

test('quiz: wrong answers are graded and weak areas reported', async () => {
  const practice = (await agent.get('/api/quiz/practice?categories=particles&count=5')).body;
  assert.equal(practice.questions.length, 5);
  const answers = Object.fromEntries(practice.questions.map((q: { id: number }) => [q.id, 'definitely wrong']));
  const res = await agent.post('/api/quiz/submit').set('x-local-date', today).send({ kind: 'practice', questionIds: practice.questions.map((q: { id: number }) => q.id), answers });
  assert.equal(res.status, 200);
  assert.equal(res.body.attempt.correct, 0);
  assert.ok(res.body.attempt.weakCategories.some((c: { category: string }) => c.category === 'particles'));
  const dash = (await agent.get('/api/dashboard').set('x-local-date', today)).body;
  assert.ok(dash.weakAreas.some((w: { category: string }) => w.category === 'particles'));
});

test('review: due items can be rated and rescheduled', async () => {
  const due = (await agent.get('/api/review/due?limit=5')).body.items;
  assert.ok(due.length > 0);
  const res = await agent.post('/api/review').set('x-local-date', today).send({ reviewItemId: due[0].id, rating: 'easy' });
  assert.equal(res.status, 200);
  assert.equal(res.body.item.state, 'review');
  assert.ok(new Date(res.body.item.dueAt).getTime() > Date.now() + 3 * 86_400_000);
});

test('module test is locked until all module lessons are complete', async () => {
  const tests = (await agent.get('/api/quizzes?kind=module_test')).body.quizzes;
  const res = await agent.get(`/api/quizzes/${tests[0].id}`);
  assert.equal(res.status, 403);
});

test('mock exam is available and has four sections', async () => {
  const exams = (await agent.get('/api/quizzes?kind=mock_exam')).body.quizzes;
  const exam = (await agent.get(`/api/quizzes/${exams[0].id}`)).body.quiz;
  const sections = new Set(exam.questions.map((q: { section: string }) => q.section));
  assert.deepEqual([...sections].sort(), ['grammar', 'listening', 'reading', 'vocabulary']);
  assert.ok(exam.timeLimitSec > 0);
});

test('translation check gives keyword feedback without storing anything', async () => {
  const q = (await agent.get('/api/quiz/practice?categories=translation&types=mn_to_ja&count=1')).body.questions[0];
  const res = await agent.post('/api/quiz/check').send({ questionId: q.id, answer: 'xyz' });
  assert.equal(res.status, 200);
  assert.equal(res.body.correct, false);
  assert.ok(res.body.expected.length > 0);
});

test('progress, stories, settings', async () => {
  const progress = (await agent.get('/api/progress').set('x-local-date', today)).body;
  assert.equal(progress.totals.lessonsCompleted, 1);
  assert.ok(progress.totals.streak >= 1);
  const stories = (await agent.get('/api/stories')).body.stories;
  const story = (await agent.get(`/api/stories/${stories[0].slug}`)).body.story;
  assert.ok(story.sentences.length > 0 && story.vocabulary.length > 0);
  const settings = await agent.put('/api/settings').send({ theme: 'dark', dailyGoalMinutes: 30 });
  assert.equal(settings.body.settings.theme, 'dark');
  assert.equal((await agent.put('/api/settings').send({ theme: 'purple' })).status, 400);
});

async function perfectAnswers(quizId: number) {
  const links = await prisma.quizQuestion.findMany({ where: { quizId }, include: { question: true } });
  return Object.fromEntries(links.map((l) => [l.questionId, l.question.correctAnswer.split('||')[0]]));
}

test('completing a whole module unlocks and passes its module test', async () => {
  const modules = (await agent.get('/api/modules')).body.modules;
  const mod = modules[0];
  for (const l of mod.lessons) {
    if (l.status === 'completed') continue;
    const detail = (await agent.get(`/api/lessons/${l.id}`)).body;
    assert.equal(detail.status === 'locked', false, `lesson ${l.slug} should be unlocked`);
    const quizId = detail.lesson.quiz.id;
    await agent.post('/api/quiz/submit').set('x-local-date', today).send({ quizId, answers: await perfectAnswers(quizId) });
    const done = await agent.post(`/api/lessons/${l.id}/complete`).set('x-local-date', today);
    assert.equal(done.status, 200);
  }
  const after = (await agent.get('/api/modules')).body.modules[0];
  assert.equal(after.completed, after.total);
  assert.equal(after.test.available, true);
  // next module's first lesson is now open
  assert.equal((await agent.get('/api/modules')).body.modules[1].lessons[0].status, 'available');

  const test = (await agent.get(`/api/quizzes/${after.test.id}`)).body.quiz;
  assert.equal(test.questions.length, 30);
  const res = await agent.post('/api/quiz/submit').set('x-local-date', today).send({ quizId: test.id, answers: await perfectAnswers(test.id) });
  assert.equal(res.body.attempt.percent, 100);
  assert.equal(res.body.attempt.passed, true);
  const codes = (await agent.get('/api/achievements')).body.achievements.filter((a: { unlockedAt: string | null }) => a.unlockedAt).map((a: { code: string }) => a.code);
  assert.ok(codes.includes('kana_master'));
  assert.ok(codes.includes('module_test'));
  assert.ok(codes.includes('quiz_90'));
});

test('logout clears the session', async () => {
  await agent.post('/api/auth/logout');
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});
