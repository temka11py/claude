// One special challenge per study day, rotating between writing, speaking and
// error-correction challenges.

import type { DB } from '../db';
import { parseJson } from '../db';
import { findWordForm, hashString, seededRandom, shuffle } from '@shared/text';
import { analyzeWriting } from '@shared/writingChecker';
import { toDateKey } from '@shared/streak';
import { XP } from '@shared/gamification';
import { badRequest } from '../http';
import { logActivity } from './activity';
import { checkCorrection, listErrors } from './errors';
import { gradeWord } from './vocab';
import { autoCompleteSessionItems } from './session';

/** Frequent learner errors used when the learner's own notebook is still short. */
const COMMON_ERRORS: { wrong: string; correct: string; why: string }[] = [
  { wrong: 'I am agree with you.', correct: 'I agree with you.', why: '"Agree" is a verb — no "am".' },
  { wrong: 'She have two brothers.', correct: 'She has two brothers.', why: 'He/she/it → has.' },
  { wrong: 'We discussed about the plan.', correct: 'We discussed the plan.', why: '"Discuss" takes a direct object.' },
  { wrong: 'I have lived here since three years.', correct: 'I have lived here for three years.', why: '"For" + a period of time.' },
  { wrong: 'He explained me the rules.', correct: 'He explained the rules to me.', why: 'Explain something TO someone.' },
  { wrong: 'I didn\'t went to work yesterday.', correct: 'I didn\'t go to work yesterday.', why: 'After "didn\'t", use the base form.' },
  { wrong: 'Can you give me an advice?', correct: 'Can you give me some advice?', why: '"Advice" is uncountable.' },
  { wrong: 'This film is more better than the book.', correct: 'This film is better than the book.', why: 'No "more" with -er comparatives.' },
  { wrong: 'I look forward to hear from you.', correct: 'I look forward to hearing from you.', why: '"Look forward to" + -ing.' },
  { wrong: 'People is very friendly here.', correct: 'People are very friendly here.', why: '"People" is plural.' },
  { wrong: 'It depends of the weather.', correct: 'It depends on the weather.', why: 'Depend ON.' },
  { wrong: 'I am interesting in history.', correct: 'I am interested in history.', why: 'Feelings use -ed adjectives.' },
  { wrong: 'She is married with a doctor.', correct: 'She is married to a doctor.', why: 'Married TO someone.' },
  { wrong: 'I have visited Paris last year.', correct: 'I visited Paris last year.', why: 'Finished time → past simple.' },
  { wrong: 'He said me that he was tired.', correct: 'He told me that he was tired.', why: 'Tell + person.' },
  { wrong: 'Although it was late, but we continued.', correct: 'Although it was late, we continued.', why: 'Don\'t use "although" and "but" together.' },
  { wrong: 'I enjoy to read in the evening.', correct: 'I enjoy reading in the evening.', why: '"Enjoy" + -ing.' },
  { wrong: 'There are much people in the city.', correct: 'There are many people in the city.', why: '"Many" with countable nouns.' },
  { wrong: 'Every students has a laptop.', correct: 'Every student has a laptop.', why: '"Every" + singular noun.' },
  { wrong: 'I will call you when I will arrive.', correct: 'I will call you when I arrive.', why: 'Present tense after "when" for the future.' },
];

type ChallengeType = 'use_words' | 'speak' | 'fix_mistakes';

function currentModuleTopic(db: DB, userId: number): string {
  const topic = db
    .prepare(
      `SELECT m.topic FROM user_progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id
       WHERE p.user_id = ? ORDER BY p.updated_at DESC LIMIT 1`,
    )
    .pluck()
    .get(userId) as string | undefined;
  return topic ?? 'your daily life';
}

function build(db: DB, userId: number, date: string) {
  const random = seededRandom(`${userId}:${date}`);
  const types: ChallengeType[] = ['use_words', 'speak', 'fix_mistakes'];
  let type = types[hashString(date) % types.length];
  const words = db
    .prepare(`SELECT v.id, v.word FROM user_vocab uv JOIN vocabulary v ON v.id = uv.vocab_id WHERE uv.user_id = ? AND uv.state != 'NEW' ORDER BY uv.first_seen_at DESC LIMIT 20`)
    .all(userId) as { id: string; word: string }[];
  if (type === 'use_words' && words.length < 3) type = 'fix_mistakes';

  if (type === 'use_words') {
    const picked = shuffle(words, random).slice(0, 3);
    return {
      type,
      title: 'Three-word paragraph',
      instructions: `Write one short paragraph (3–6 sentences) that uses all three words naturally.`,
      payload: { words: picked },
    };
  }
  if (type === 'speak') {
    const topic = currentModuleTopic(db, userId);
    const prompts = [
      `Speak for 60 seconds about ${topic.toLowerCase()} in your life.`,
      `Speak for 60 seconds: what is one thing you would change about ${topic.toLowerCase()}, and why?`,
      'Speak for 60 seconds about your plans for next week.',
      'Speak for 60 seconds about your future career.',
    ];
    return { type, title: '60-second talk', instructions: prompts[Math.floor(random() * prompts.length)], payload: { seconds: 60 } };
  }
  const own = listErrors(db, userId, { status: 'open' }).filter((e) => e.wrong !== '—' && e.correct.split(' ').length <= 14);
  const items = [...shuffle(own, random).slice(0, 3).map((e) => ({ wrong: e.wrong, correct: e.correct, why: e.explanation ?? '' }))];
  for (const e of shuffle(COMMON_ERRORS, random)) {
    if (items.length >= 5) break;
    if (!items.some((i) => i.wrong === e.wrong)) items.push(e);
  }
  return {
    type,
    title: 'Fix five mistakes',
    instructions: 'Each sentence has one mistake. Rewrite it correctly.',
    payload: { items: items.map((i) => ({ wrong: i.wrong })), answers: items },
  };
}

export function todayChallenge(db: DB, userId: number, now: Date) {
  const date = toDateKey(now);
  let row = db.prepare('SELECT * FROM daily_challenges WHERE user_id = ? AND date = ?').get(userId, date) as
    | { type: string; payload: string; status: string; response: string | null; result: string | null }
    | undefined;
  if (!row) {
    const c = build(db, userId, date);
    db.prepare('INSERT INTO daily_challenges (user_id, date, type, payload) VALUES (?, ?, ?, ?)').run(userId, date, c.type, JSON.stringify({ title: c.title, instructions: c.instructions, ...c.payload }));
    row = { type: c.type, payload: JSON.stringify({ title: c.title, instructions: c.instructions, ...c.payload }), status: 'open', response: null, result: null };
  }
  const payload = parseJson<Record<string, unknown>>(row.payload, {});
  // Hide answers for the correction challenge.
  const { answers: _answers, ...publicPayload } = payload;
  return { date, type: row.type, status: row.status, ...publicPayload, result: parseJson(row.result, null) };
}

export function submitChallenge(db: DB, userId: number, input: { text?: string; corrections?: string[]; durationSec?: number; speakingAttemptId?: number }, now: Date) {
  const date = toDateKey(now);
  todayChallenge(db, userId, now);
  const row = db.prepare('SELECT type, payload, status FROM daily_challenges WHERE user_id = ? AND date = ?').get(userId, date) as { type: string; payload: string; status: string };
  const payload = parseJson<Record<string, unknown>>(row.payload, {});
  let result: Record<string, unknown>;
  let success: boolean;

  if (row.type === 'use_words') {
    const text = (input.text ?? '').trim();
    if (!text) throw badRequest('Write your paragraph first.');
    const words = (payload.words as { id: string; word: string }[]) ?? [];
    const used = words.map((w) => ({ word: w.word, used: !!findWordForm(text, w.word) }));
    const analysis = analyzeWriting(text, {});
    for (const w of words) {
      if (findWordForm(text, w.word)) gradeWord(db, userId, { vocabId: w.id, correct: true, mode: 'writing', dimension: 'production', source: 'challenge' }, now);
    }
    success = used.every((u) => u.used);
    result = {
      used,
      issues: analysis.issues.slice(0, 5).map((i) => ({ original: i.sentence, improved: i.improvedSentence, explanation: i.explanation })),
      message: success ? 'All three words used — great!' : `You're getting closer — ${used.filter((u) => !u.used).map((u) => `“${u.word}”`).join(', ')} still missing.`,
    };
  } else if (row.type === 'speak') {
    const seconds = input.durationSec ?? 0;
    success = seconds >= 45;
    result = { seconds: Math.round(seconds), message: success ? `You spoke for ${Math.round(seconds)} seconds. Well done!` : `You spoke for ${Math.round(seconds)} seconds. Try to reach at least 45 seconds.` };
  } else {
    const answers = (payload.answers as { wrong: string; correct: string; why: string }[]) ?? [];
    const given = input.corrections ?? [];
    const items = answers.map((a, i) => {
      const r = checkCorrection(given[i] ?? '', a.correct);
      return { wrong: a.wrong, given: given[i] ?? '', correct: a.correct, why: a.why, ok: r.correct, almost: r.almost };
    });
    const score = items.filter((i) => i.ok).length;
    success = score >= 4;
    result = { items, score, message: success ? `${score}/5 fixed. Excellent!` : `${score}/5 fixed. Not quite yet — read the explanations and try again tomorrow.` };
  }

  if (success && row.status !== 'done') {
    db.prepare(`UPDATE daily_challenges SET status = 'done', response = ?, result = ?, completed_at = ? WHERE user_id = ? AND date = ?`).run(JSON.stringify(input), JSON.stringify(result), now.toISOString(), userId, date);
    const act = logActivity(db, userId, { type: 'challenge', ref: date, minutes: 3, score: 1, xp: XP.dailyChallenge, xpReason: 'Daily challenge' }, now);
    autoCompleteSessionItems(db, userId, 'challenge', () => true, now);
    return { success, result, ...act };
  }
  db.prepare('UPDATE daily_challenges SET response = ?, result = ? WHERE user_id = ? AND date = ?').run(JSON.stringify(input), JSON.stringify(result), userId, date);
  return { success, result, xp: 0, achievements: [] };
}

