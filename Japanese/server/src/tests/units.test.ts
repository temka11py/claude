import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, type SrsCard } from '../lib/srs.js';
import { gradeAnswer } from '../lib/grading.js';
import { kanaToRomaji, tokenRomaji } from '../lib/kana.js';
import { computeStreak } from '../lib/dates.js';

const fresh: SrsCard = { state: 'new', step: 0, ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 };
const DAY = 86_400_000;

test('srs: new card graduates after passing all learning steps', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const a = schedule(fresh, 'good', now);
  assert.equal(a.state, 'learning');
  assert.equal(a.dueAt.getTime() - now.getTime(), 10 * 60_000);
  const b = schedule(a, 'good', now);
  assert.equal(b.state, 'review');
  assert.equal(b.intervalDays, 1);
  assert.equal(b.dueAt.getTime() - now.getTime(), DAY);
});

test('srs: easy skips learning, again resets', () => {
  const now = new Date();
  const easy = schedule(fresh, 'easy', now);
  assert.equal(easy.state, 'review');
  assert.equal(easy.intervalDays, 4);
  const lapse = schedule({ ...easy }, 'again', now);
  assert.equal(lapse.state, 'learning');
  assert.equal(lapse.lapses, 1);
  assert.ok(lapse.ease < 2.5);
});

test('srs: long intervals become mastered', () => {
  const card: SrsCard = { state: 'review', step: 0, ease: 2.5, intervalDays: 10, reps: 5, lapses: 0 };
  const next = schedule(card, 'good');
  assert.equal(next.intervalDays, 25);
  assert.equal(next.state, 'mastered');
});

test('kana: romanisation', () => {
  assert.equal(kanaToRomaji('がっこう'), 'gakkou');
  assert.equal(kanaToRomaji('きょう'), 'kyou');
  assert.equal(kanaToRomaji('コーヒー'), 'koohii');
  assert.equal(kanaToRomaji('ちゃっと'), 'chatto');
  assert.equal(tokenRomaji('は'), 'wa');
  assert.equal(tokenRomaji('へ'), 'e');
});

test('grading: multiple choice and typing', () => {
  assert.equal(gradeAnswer({ type: 'multiple_choice', options: '["a","b"]', correctAnswer: 'a' }, 'a').correct, true);
  assert.equal(gradeAnswer({ type: 'multiple_choice', options: '["a","b"]', correctAnswer: 'a' }, 'b').correct, false);
  assert.equal(gradeAnswer({ type: 'typing', options: '[]', correctAnswer: 'shi||si' }, ' SI ').correct, true);
  assert.equal(gradeAnswer({ type: 'typing', options: '[]', correctAnswer: 'shi||si' }, 'chi').correct, false);
});

test('grading: Japanese free text ignores punctuation, accepts kana and keywords', () => {
  const q = { type: 'mn_to_ja', options: JSON.stringify({ keywords: [['毎日', 'まいにち'], ['学校', 'がっこう'], ['行きます', 'いきます']] }), correctAnswer: '私は毎日学校へ行きます。||毎日学校に行きます' };
  assert.equal(gradeAnswer(q, '私は毎日学校へ行きます').correct, true);
  assert.equal(gradeAnswer(q, 'まいにち がっこうに いきます。').correct, true);
  const partial = gradeAnswer(q, '毎日行きます');
  assert.equal(partial.correct, false);
  assert.deepEqual(partial.feedback?.missing, ['学校']);
});

test('grading: Mongolian keywords are stem based', () => {
  const q = { type: 'ja_to_mn', options: JSON.stringify({ keywords: [['өдөр бүр'], ['сургууль'], ['явдаг', 'явна']] }), correctAnswer: 'Би өдөр бүр сургууль руу явдаг.' };
  assert.equal(gradeAnswer(q, 'Би өдөр бүр сургуульд явна').correct, true);
  const partial = gradeAnswer(q, 'Би сургуульд явна'); // 2 of 3 keyword groups
  assert.equal(partial.correct, false);
  assert.deepEqual(partial.feedback?.missing, ['өдөр бүр']);
});

test('grading: matching requires every pair', () => {
  const q = { type: 'matching', options: '{}', correctAnswer: JSON.stringify(['a', 'b']) };
  assert.equal(gradeAnswer(q, JSON.stringify(['a', 'b'])).correct, true);
  assert.equal(gradeAnswer(q, JSON.stringify(['b', 'a'])).correct, false);
});

test('streak counts consecutive days ending today or yesterday', () => {
  assert.equal(computeStreak(['2026-09-24', '2026-09-25', '2026-09-26'], '2026-09-26').current, 3);
  assert.equal(computeStreak(['2026-09-24', '2026-09-25'], '2026-09-26').current, 2);
  assert.equal(computeStreak(['2026-09-20', '2026-09-25'], '2026-09-26').current, 1);
  assert.equal(computeStreak([], '2026-09-26').current, 0);
  assert.equal(computeStreak(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10'], '2026-09-26').longest, 3);
});
