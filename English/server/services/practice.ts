// Practice outside lessons: dictation, shadowing, grammar review, extra
// listening/reading, writing and speaking submissions.

import type { DB } from '../db';
import { parseJson } from '../db';
import type { ListeningMaterial, PronunciationTopic, Question } from '@shared/contentSchema';
import { findWordForm, normalizeAnswer, seededRandom, shuffle, tokenize } from '@shared/text';
import { XP } from '@shared/gamification';
import { badRequest, notFound } from '../http';
import type { AIProvider } from '../ai/provider';
import { speakingFeedback, writingFeedback } from '../ai/feedback';
import { logActivity } from './activity';
import { upsertError } from './errors';
import { applyEvidence } from './skills';
import { gradeWord } from './vocab';
import { effectiveExplanationLanguage, getSettings } from './users';
import { speechRate, speakingTask, writingTask, type QuestionDTO } from './lessons';

function completedLessonIds(db: DB, userId: number): string[] {
  return db.prepare(`SELECT lesson_id FROM user_progress WHERE user_id = ? AND status = 'completed'`).pluck().all(userId) as string[];
}

/** Lessons the learner has completed or is working on — practice uses material from these only. */
function studiedLessonIds(db: DB, userId: number): string[] {
  return db.prepare(`SELECT lesson_id FROM user_progress WHERE user_id = ?`).pluck().all(userId) as string[];
}

function inList(ids: string[]): string {
  return ids.length ? ids.map(() => '?').join(',') : "''";
}

function listeningDifficulty(db: DB, userId: number): number | null {
  return (db.prepare(`SELECT difficulty FROM skill_profile WHERE user_id = ? AND skill = 'listening'`).pluck().get(userId) as number | undefined) ?? null;
}

export interface DictationSentence {
  text: string;
  voice: 'female' | 'male';
  accent: string;
  source: string;
  level: string;
}

export function dictationSet(db: DB, userId: number, count: number, seed: string) {
  const ids = studiedLessonIds(db, userId);
  const rows = db.prepare(`SELECT title, cefr_level, data FROM listening_materials WHERE lesson_id IN (${inList(ids)})`).all(...ids) as { title: string; cefr_level: string; data: string }[];
  const sentences: DictationSentence[] = [];
  for (const r of rows) {
    const m = JSON.parse(r.data) as ListeningMaterial;
    for (const line of m.lines) {
      const n = tokenize(line.text).length;
      if (n < 5 || n > 18) continue;
      const sp = m.speakers.find((s) => s.name === line.speaker);
      sentences.push({ text: line.text, voice: sp?.voice ?? 'female', accent: sp?.accent ?? 'en-GB', source: r.title, level: r.cefr_level });
    }
  }
  // Fall back to example sentences of words the learner has met.
  if (sentences.length < count) {
    const ex = db
      .prepare(`SELECT v.examples, v.cefr_level FROM user_vocab uv JOIN vocabulary v ON v.id = uv.vocab_id WHERE uv.user_id = ? ORDER BY uv.last_reviewed_at DESC LIMIT 40`)
      .all(userId) as { examples: string; cefr_level: string }[];
    for (const e of ex) {
      for (const s of parseJson<string[]>(e.examples, [])) {
        const n = tokenize(s).length;
        if (n >= 5 && n <= 18) sentences.push({ text: s, voice: 'female', accent: 'en-GB', source: 'Vocabulary examples', level: e.cefr_level });
      }
    }
  }
  const random = seededRandom(seed);
  const picked = shuffle(sentences, random).slice(0, count);
  const level = picked[0]?.level ?? 'B1';
  return { sentences: picked, rate: speechRate(level, listeningDifficulty(db, userId)) };
}

export function shadowingSet(db: DB, userId: number, count: number, seed: string) {
  const ids = studiedLessonIds(db, userId);
  const topics = db
    .prepare(`SELECT p.data FROM pronunciation_topics p JOIN lessons l ON l.pronunciation_id = p.id WHERE l.id IN (${inList(ids)})`)
    .all(...ids) as { data: string }[];
  const items: { text: string; stress: string | null; tip: string | null; difficult: string[]; source: string }[] = [];
  for (const t of topics) {
    const topic = JSON.parse(t.data) as PronunciationTopic;
    for (const s of topic.shadowing) items.push({ text: s.text, stress: s.stress, tip: s.tip ?? null, difficult: s.difficult, source: topic.title });
  }
  if (items.length < count) {
    for (const s of dictationSet(db, userId, count * 2, `${seed}:sh`).sentences) items.push({ text: s.text, stress: null, tip: null, difficult: [], source: s.source });
  }
  return { items: shuffle(items, seededRandom(seed)).slice(0, count) };
}

/** Grammar questions from studied lessons, weighted towards topics with lower accuracy. */
export function grammarReviewSet(db: DB, userId: number, count: number, seed: string): QuestionDTO[] {
  const ids = completedLessonIds(db, userId);
  if (!ids.length) return [];
  const topicIds = db.prepare(`SELECT grammar_topic_id FROM lessons WHERE id IN (${inList(ids)}) AND grammar_topic_id IS NOT NULL`).pluck().all(...ids) as string[];
  const rows = db
    .prepare(
      `SELECT q.id, q.skill, q.cefr_level, q.data, q.owner_id,
         (SELECT AVG(score) FROM question_responses r WHERE r.user_id = ? AND r.question_id = q.id) AS acc
       FROM quiz_questions q
       WHERE (q.owner_type IN ('grammar_guided', 'grammar_free') AND q.owner_id IN (${inList(topicIds)}))
          OR (q.owner_type = 'lesson_quiz' AND q.skill = 'grammar' AND q.owner_id IN (${inList(ids)}))`,
    )
    .all(userId, ...topicIds, ...ids) as { id: string; skill: string; cefr_level: string; data: string; acc: number | null }[];
  const random = seededRandom(seed);
  const weighted = rows
    .map((r) => ({ r, key: (r.acc ?? 0.6) + random() * 0.5 }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map(({ r }) => ({ ...(JSON.parse(r.data) as Question), id: r.id, skill: r.skill as QuestionDTO['skill'], level: r.cefr_level as QuestionDTO['level'] }));
  return shuffle(weighted, random);
}

export function practiceLibrary(db: DB, userId: number) {
  const ids = studiedLessonIds(db, userId);
  const list = (table: string, extra = '') =>
    db
      .prepare(`SELECT t.id, t.title, t.cefr_level AS level ${extra} FROM ${table} t WHERE t.lesson_id IN (${inList(ids)}) ORDER BY t.id`)
      .all(...ids) as { id: string; title: string; level: string }[];
  const speaking = db.prepare(`SELECT id, type, prompt, cefr_level AS level FROM speaking_tasks WHERE lesson_id IN (${inList(ids)})`).all(...ids);
  const writing = db.prepare(`SELECT id, type, prompt, cefr_level AS level, min_words AS minWords, max_words AS maxWords FROM writing_tasks WHERE lesson_id IN (${inList(ids)})`).all(...ids);
  const pronunciation = db
    .prepare(`SELECT p.id, p.title, p.category, p.cefr_level AS level FROM pronunciation_topics p JOIN lessons l ON l.pronunciation_id = p.id WHERE l.id IN (${inList(ids)})`)
    .all(...ids);
  return {
    listening: list('listening_materials', ', t.kind'),
    reading: list('reading_materials', ', t.genre, t.word_count AS words'),
    speaking,
    writing,
    pronunciation,
    grammarQuestions: grammarReviewSet(db, userId, 50, 'count').length,
  };
}

/** Lesson vocabulary ids for target words (to record production evidence when used). */
function targetVocabIds(db: DB, taskId: string | null, words: string[]): Map<string, string> {
  const map = new Map<string, string>();
  if (!taskId || !words.length) return map;
  const moduleId = (db.prepare('SELECT module_id FROM speaking_tasks WHERE id = ? UNION SELECT module_id FROM writing_tasks WHERE id = ?').pluck().get(taskId, taskId) as string | undefined) ?? null;
  if (!moduleId) return map;
  const rows = db.prepare('SELECT id, word FROM vocabulary WHERE module_id = ? AND owner_user_id IS NULL').all(moduleId) as { id: string; word: string }[];
  for (const w of words) {
    const hit = rows.find((r) => normalizeAnswer(r.word) === normalizeAnswer(w));
    if (hit) map.set(w, hit.id);
  }
  return map;
}

function recordCorrections(db: DB, userId: number, corrections: { original: string; improved: string; explanation: string; explanationMn?: string; category: string }[], source: string, now: Date) {
  for (const c of corrections.slice(0, 10)) {
    if (!c.original || !c.improved || normalizeAnswer(c.original) === normalizeAnswer(c.improved)) continue;
    upsertError(
      db,
      userId,
      {
        category: c.category === 'coherence' ? 'sentence_structure' : c.category,
        // Original + improved: two different errors in the same sentence stay separate entries.
        key: `w:${c.category}:${normalizeAnswer(c.original).slice(0, 100)}=>${normalizeAnswer(c.improved).slice(0, 100)}`,
        wrong: c.original,
        correct: c.improved,
        explanation: c.explanation,
        explanationMn: c.explanationMn ?? null,
        source,
      },
      now,
    );
  }
}

export async function submitWriting(
  db: DB,
  ai: AIProvider,
  userId: number,
  input: { taskId?: string | null; text: string; context: string; prompt?: string | null; minutes?: number },
  now: Date,
) {
  const text = input.text.trim();
  if (text.length < 3) throw badRequest('Write something first.');
  const settings = getSettings(db, userId);
  const task = input.taskId ? writingTask(db, input.taskId) : null;
  if (input.taskId && !task) throw notFound('Writing task not found');
  const info = task
    ? { prompt: task.prompt, type: task.type, register: task.register, minWords: task.minWords, maxWords: task.maxWords, targetWords: task.targetWords, level: task.level }
    : { prompt: input.prompt ?? 'Free writing', type: 'paragraph', register: 'neutral', minWords: 20, maxWords: 400, targetWords: [], level: settings.courseLevel };
  const fb = await writingFeedback(ai, text, info, { level: info.level, explanationLanguage: effectiveExplanationLanguage(settings) });
  const res = db
    .prepare(`INSERT INTO writing_submissions (user_id, task_id, context, prompt, text, word_count, feedback, score, ai_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, task?.id ?? null, input.context, info.prompt, text, fb.analysis.wordCount, JSON.stringify(fb), fb.score, fb.source === 'ai' ? 1 : 0, now.toISOString());
  recordCorrections(db, userId, fb.corrections, 'writing', now);
  const vocabIds = targetVocabIds(db, task?.id ?? null, fb.analysis.targetWordsUsed);
  for (const id of vocabIds.values()) gradeWord(db, userId, { vocabId: id, correct: true, mode: 'writing', dimension: 'production', source: 'writing' }, now);
  applyEvidence(db, userId, 'writing', info.level, fb.score / 100, 'practice', now);
  const act = logActivity(
    db,
    userId,
    { type: 'writing', ref: task?.id ?? input.context, skill: 'writing', minutes: input.minutes ?? 10, score: fb.score / 100, xp: XP.writingTask + Math.min(25, Math.floor(fb.analysis.wordCount / 10)), xpReason: 'Writing task' },
    now,
  );
  return { id: Number(res.lastInsertRowid), feedback: fb, ...act };
}

export async function submitSpeaking(
  db: DB,
  ai: AIProvider,
  userId: number,
  input: { taskId?: string | null; transcript?: string | null; durationSec?: number | null; selfRating?: number | null; audioPath?: string | null; context: string; prompt?: string | null; minutes?: number },
  now: Date,
) {
  const settings = getSettings(db, userId);
  const task = input.taskId ? speakingTask(db, input.taskId) : null;
  const info = task
    ? { prompt: task.prompt, type: task.type, points: task.points, targetWords: task.targetWords, speakSeconds: task.speakSeconds, level: task.level }
    : { prompt: input.prompt ?? 'Free speaking', type: 'describe', points: [], targetWords: [], speakSeconds: 60, level: settings.courseLevel };
  const fb = await speakingFeedback(
    ai,
    { transcript: input.transcript ?? null, durationSec: input.durationSec ?? null, selfRating: input.selfRating ?? null },
    info,
    { level: info.level, explanationLanguage: effectiveExplanationLanguage(settings) },
  );
  const res = db
    .prepare(`INSERT INTO speaking_attempts (user_id, task_id, context, prompt, transcript, audio_path, duration_sec, feedback, ai_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, task?.id ?? null, input.context, info.prompt, input.transcript ?? null, input.audioPath ?? null, input.durationSec ?? null, JSON.stringify(fb), fb.source === 'ai' ? 1 : 0, now.toISOString());
  recordCorrections(db, userId, fb.corrections, 'speaking', now);
  if (input.transcript) {
    const used = info.targetWords.filter((w) => findWordForm(input.transcript!, w));
    for (const id of targetVocabIds(db, task?.id ?? null, used).values()) gradeWord(db, userId, { vocabId: id, correct: true, mode: 'lesson', dimension: 'production', source: 'speaking' }, now);
  }
  if (fb.score !== null && fb.source !== 'self') applyEvidence(db, userId, 'speaking', info.level, fb.score / 100, 'practice', now);
  const act = logActivity(
    db,
    userId,
    { type: 'speaking', ref: task?.id ?? input.context, skill: 'speaking', minutes: input.minutes ?? Math.max(2, Math.round((input.durationSec ?? 60) / 60) + 2), score: fb.score !== null ? fb.score / 100 : null, xp: XP.speakingTask, xpReason: 'Speaking task' },
    now,
  );
  return { id: Number(res.lastInsertRowid), feedback: fb, ...act };
}

export function speakingHistory(db: DB, userId: number, taskId?: string) {
  const rows = db
    .prepare(
      `SELECT id, task_id AS taskId, context, prompt, transcript, audio_path IS NOT NULL AS hasAudio, duration_sec AS durationSec, feedback, ai_used AS aiUsed, created_at AS createdAt
       FROM speaking_attempts WHERE user_id = ? ${taskId ? 'AND task_id = ?' : ''} ORDER BY id DESC LIMIT 50`,
    )
    .all(...(taskId ? [userId, taskId] : [userId])) as { feedback: string | null }[];
  return rows.map((r) => ({ ...r, feedback: parseJson(r.feedback, null) }));
}

export function writingHistory(db: DB, userId: number, taskId?: string) {
  const rows = db
    .prepare(
      `SELECT id, task_id AS taskId, context, prompt, text, word_count AS wordCount, score, ai_used AS aiUsed, feedback, created_at AS createdAt
       FROM writing_submissions WHERE user_id = ? ${taskId ? 'AND task_id = ?' : ''} ORDER BY id DESC LIMIT 50`,
    )
    .all(...(taskId ? [userId, taskId] : [userId])) as { feedback: string | null }[];
  return rows.map((r) => ({ ...r, feedback: parseJson(r.feedback, null) }));
}
