// AI tutor and conversation simulator, with offline fallbacks that are honest
// about what they can do.

import * as z4 from 'zod/v4';
import type { DB } from '../db';
import { parseJson } from '../db';
import { analyzeWriting } from '@shared/writingChecker';
import { keywords, normalizeAnswer } from '@shared/text';
import { labelFor } from '@shared/cefr';
import { XP } from '@shared/gamification';
import { badRequest, notFound } from '../http';
import type { AIProvider, ChatMessage } from './provider';
import { skillProfile } from '../services/skills';
import { listErrors } from '../services/errors';
import { effectiveExplanationLanguage, getSettings } from '../services/users';
import { logActivity } from '../services/activity';
import { applyEvidence } from '../services/skills';
import { upsertError } from '../services/errors';
import type { ScenarioDoc } from '@shared/contentSchema';

type Scenario = ScenarioDoc['scenarios'][number];

/** A compact description of the learner for personalising AI answers. */
export function learnerProfileText(db: DB, userId: number): string {
  const settings = getSettings(db, userId);
  const profile = skillProfile(db, userId);
  const skills = profile.skills
    .filter((s) => ['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing'].includes(s.skill))
    .map((s) => `${s.skill} ${s.label}${s.accuracy !== null ? ` (${Math.round(s.accuracy * 100)}% recent accuracy)` : ''}`)
    .join(', ');
  const weakWords = db
    .prepare(`SELECT v.word FROM user_vocab uv JOIN vocabulary v ON v.id = uv.vocab_id WHERE uv.user_id = ? AND (uv.lapses > 0 OR uv.state = 'REVIEW') ORDER BY uv.lapses DESC LIMIT 10`)
    .pluck()
    .all(userId) as string[];
  const errors = listErrors(db, userId, { status: 'open' }).slice(0, 6).map((e) => `"${e.wrong}" → "${e.correct}"`);
  const modules = db
    .prepare(`SELECT DISTINCT m.title FROM module_results r JOIN modules m ON m.id = r.module_id WHERE r.user_id = ? AND r.passed = 1`)
    .pluck()
    .all(userId) as string[];
  const current = db
    .prepare(`SELECT m.title FROM user_progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id WHERE p.user_id = ? ORDER BY p.updated_at DESC LIMIT 1`)
    .pluck()
    .get(userId) as string | undefined;
  const lang = effectiveExplanationLanguage(settings);
  return [
    `Course level: ${settings.courseLevel}. Estimated overall level: ${profile.overall.label}.`,
    `Skills: ${skills}.`,
    weakWords.length ? `Words they often forget: ${weakWords.join(', ')}.` : '',
    errors.length ? `Recent repeated mistakes: ${errors.join('; ')}.` : '',
    modules.length ? `Completed modules: ${modules.join(', ')}.` : 'No modules completed yet.',
    current ? `Currently studying: ${current}.` : '',
    `Preferred explanation language: ${lang === 'en' ? 'English' : lang === 'mn' ? 'Mongolian' : 'English with short Mongolian clarifications'}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

const TUTOR_SYSTEM = `You are a patient, encouraging English tutor inside "Fluent Path", a personal course taking an adult Mongolian speaker from B1 to C1.
Answer questions about English: meanings, grammar, usage, pronunciation, register, and corrections. Pitch your language at the learner's level (slightly above is good).
Keep answers focused and practical — short explanations, 1–3 natural examples, and a quick check question when useful. Use simple Markdown (bold, bullet lists) sparingly.
When correcting, show original → improved and explain why. When asked to explain in Mongolian, answer in Mongolian (Cyrillic) with the English examples kept in English.
When asked to quiz or practise, ask one question at a time and wait for the answer.
If a request is unrelated to learning English, briefly steer back to English practice.`;

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export function listThreads(db: DB, userId: number, mode: 'tutor' | 'conversation') {
  return db
    .prepare(`SELECT id, title, scenario_id AS scenarioId, status, guided, created_at AS createdAt, updated_at AS updatedAt FROM ai_threads WHERE user_id = ? AND mode = ? ORDER BY updated_at DESC LIMIT 30`)
    .all(userId, mode);
}

export function getThread(db: DB, userId: number, id: number) {
  const t = db.prepare('SELECT * FROM ai_threads WHERE id = ? AND user_id = ?').get(id, userId) as
    | { id: number; mode: string; scenario_id: string | null; title: string; status: string; guided: number; feedback: string | null; created_at: string }
    | undefined;
  if (!t) throw notFound('Conversation not found');
  const messages = db.prepare('SELECT id, role, content, created_at AS createdAt FROM ai_messages WHERE thread_id = ? ORDER BY id').all(id) as {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  }[];
  return {
    id: t.id,
    mode: t.mode,
    scenarioId: t.scenario_id,
    title: t.title,
    status: t.status,
    guided: !!t.guided,
    feedback: parseJson(t.feedback, null),
    createdAt: t.created_at,
    messages,
  };
}

export function deleteThread(db: DB, userId: number, id: number): void {
  db.prepare('DELETE FROM ai_threads WHERE id = ? AND user_id = ?').run(id, userId);
}

function addMessage(db: DB, threadId: number, role: 'user' | 'assistant', content: string, now: Date): void {
  db.prepare('INSERT INTO ai_messages (thread_id, role, content, created_at) VALUES (?, ?, ?, ?)').run(threadId, role, content, now.toISOString());
  db.prepare('UPDATE ai_threads SET updated_at = ? WHERE id = ?').run(now.toISOString(), threadId);
}

function history(db: DB, threadId: number, limit = 30): ChatMessage[] {
  const rows = db.prepare('SELECT role, content FROM ai_messages WHERE thread_id = ? ORDER BY id DESC LIMIT ?').all(threadId, limit) as ChatMessage[];
  const msgs = rows.reverse();
  // The API requires the first message to be from the user.
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

// ---------------------------------------------------------------------------
// Tutor
// ---------------------------------------------------------------------------

/** Offline tutor: dictionary lookup, rule-based checking and grammar topic search. */
export function offlineTutorAnswer(db: DB, userId: number, message: string): string {
  const text = message.trim();
  const meaning = text.match(/(?:what does|what's the meaning of|meaning of|define|what is)\s+["“']?([a-z][a-z' -]{0,40}?)["”']?\s*(?:mean)?\??$/i);
  const bare = text.replace(/[?!.]/g, '').trim();
  const lookup = meaning?.[1] ?? (bare.split(/\s+/).length <= 3 ? bare : null);
  if (lookup) {
    const rows = db
      .prepare(`SELECT word, pos, definition, mongolian, examples, collocations, mistake FROM vocabulary WHERE LOWER(word) = LOWER(?) AND (owner_user_id IS NULL OR owner_user_id = ?) LIMIT 2`)
      .all(lookup.trim(), userId) as { word: string; pos: string | null; definition: string; mongolian: string | null; examples: string; collocations: string; mistake: string | null }[];
    if (rows.length) {
      return rows
        .map((r) => {
          const ex = parseJson<string[]>(r.examples, []);
          const col = parseJson<string[]>(r.collocations, []);
          return [
            `**${r.word}**${r.pos ? ` (${r.pos})` : ''} — ${r.definition}`,
            r.mongolian ? `Монголоор: ${r.mongolian}` : '',
            ex.length ? `Examples:\n${ex.map((e) => `- ${e}`).join('\n')}` : '',
            col.length ? `Collocations: ${col.join(', ')}` : '',
            r.mistake ? `Watch out: ${r.mistake}` : '',
          ]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n\n');
    }
    if (meaning) {
      return `"${lookup}" isn't in the course dictionary yet. The AI tutor (enabled with an API key) can explain any word. You can also add it to your personal vocabulary notebook.`;
    }
  }

  const quoted = text.match(/["“](.+?)["”]/)?.[1] ?? (text.includes(':') ? text.slice(text.indexOf(':') + 1).trim() : null);
  const wantsCheck = /correct|check|wrong|mistake|right\?|is this|fix/i.test(text);
  if (wantsCheck || quoted) {
    const target = quoted ?? text;
    const analysis = analyzeWriting(target, {});
    if (analysis.issues.length) {
      return [
        'Here is what the automatic checker found:',
        ...analysis.issues.slice(0, 6).map((i) => `- ❌ ${i.original} → ✅ ${i.suggestion}\n  ${i.explanation}${i.explanationMn ? `\n  _${i.explanationMn}_` : ''}`),
        '',
        'The offline checker catches common learner errors only. The AI tutor can explain everything in detail.',
      ].join('\n');
    }
    if (wantsCheck) {
      return 'The automatic checker did not find common errors in that text. It only knows frequent learner mistakes, so it cannot confirm everything is perfect — the AI tutor can give a full correction.';
    }
  }

  const kws = keywords(text).filter((k) => k.length > 2);
  if (kws.length) {
    const topics = db.prepare('SELECT id, title, data FROM grammar_topics').all() as { id: string; title: string; data: string }[];
    const scored = topics
      .map((t) => {
        const hay = normalizeAnswer(`${t.title} ${t.data}`);
        return { t, score: kws.filter((k) => hay.includes(k)).length + kws.filter((k) => normalizeAnswer(t.title).includes(k)).length * 2 };
      })
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score);
    if (scored.length) {
      const best = scored[0].t;
      const data = JSON.parse(best.data) as { summary: string; summaryMn?: string; structure: string[]; examples: { en: string; note?: string }[] };
      return [
        `**${best.title}**`,
        data.summary,
        data.summaryMn ? `_${data.summaryMn}_` : '',
        `Structure:\n${data.structure.map((s) => `- ${s}`).join('\n')}`,
        `Examples:\n${data.examples.slice(0, 3).map((e) => `- ${e.en}${e.note ? ` — ${e.note}` : ''}`).join('\n')}`,
        scored.length > 1 ? `Related topics: ${scored.slice(1, 4).map((s) => s.t.title).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    }
  }

  return [
    'The AI tutor is not configured, so I am running in **offline mode**. I can:',
    '- explain words from the course: type a word, or "What does *deadline* mean?"',
    '- check a sentence for common mistakes: "Check: I am agree with you."',
    '- show a grammar topic: "present perfect", "second conditional", "reported speech"',
    '',
    'To unlock free conversation, explanations of anything and full corrections, add ANTHROPIC_API_KEY to the .env file and restart the app.',
  ].join('\n');
}

export async function tutorMessage(
  db: DB,
  ai: AIProvider,
  userId: number,
  input: { threadId?: number | null; message: string },
  now: Date,
  onText: (delta: string) => void,
): Promise<{ threadId: number; reply: string; offline: boolean }> {
  const message = input.message.trim().slice(0, 4000);
  if (!message) throw badRequest('Type a message first.');
  let threadId = input.threadId ?? null;
  if (threadId) getThread(db, userId, threadId);
  else {
    const title = message.length > 60 ? `${message.slice(0, 57)}…` : message;
    threadId = Number(
      db.prepare(`INSERT INTO ai_threads (user_id, mode, title, guided, created_at, updated_at) VALUES (?, 'tutor', ?, ?, ?, ?)`).run(userId, title, ai.available ? 0 : 1, now.toISOString(), now.toISOString())
        .lastInsertRowid,
    );
  }
  addMessage(db, threadId, 'user', message, now);
  let reply: string;
  let offline = false;
  if (ai.available) {
    reply = await ai.stream(
      { system: `${TUTOR_SYSTEM}\n\nABOUT THE LEARNER:\n${learnerProfileText(db, userId)}`, messages: history(db, threadId), maxTokens: 2000, effort: 'low' },
      onText,
    );
  } else {
    offline = true;
    reply = offlineTutorAnswer(db, userId, message);
    onText(reply);
  }
  addMessage(db, threadId, 'assistant', reply, new Date());
  return { threadId, reply, offline };
}

// ---------------------------------------------------------------------------
// Conversation simulator
// ---------------------------------------------------------------------------

export function scenarios(db: DB): Scenario[] {
  return (db.prepare('SELECT data FROM conversation_scenarios ORDER BY min_level, title').pluck().all() as string[]).map((d) => JSON.parse(d) as Scenario);
}

function scenario(db: DB, id: string): Scenario {
  const d = db.prepare('SELECT data FROM conversation_scenarios WHERE id = ?').pluck().get(id) as string | undefined;
  if (!d) throw notFound('Scenario not found');
  return JSON.parse(d) as Scenario;
}

const LEVEL_STYLE: Record<string, string> = {
  B1: 'Use clear, simple, everyday English: short sentences, common words, no idioms. Speak a little slower in style (short turns).',
  'B1+': 'Use natural everyday English with some common phrasal verbs; keep sentences reasonably short.',
  B2: 'Use natural English at normal speed, including common idioms and phrasal verbs.',
  'B2+': 'Use natural, fluent English with idioms, hedging and a wider range of vocabulary.',
  C1: 'Use complex, nuanced, native-like English — idioms, subtle opinions, abstract ideas — as a fluent professional would.',
};

function conversationSystem(sc: Scenario, level: string, profile: string): string {
  return `You are role-playing in an English conversation practice app. Stay in character for the whole conversation.
SCENARIO: ${sc.title} — ${sc.description}
YOUR ROLE: ${sc.partnerRole}
THE LEARNER'S GOAL: ${sc.learnerGoal}
LANGUAGE LEVEL: ${LEVEL_STYLE[level] ?? LEVEL_STYLE.B1}
RULES: Keep each turn to 1–3 sentences and usually end with a question or a prompt so the learner keeps talking. Do NOT correct the learner's English during the conversation (feedback comes at the end). If the learner seems stuck, rephrase more simply. Never mention that you are an AI unless asked.
ABOUT THE LEARNER:\n${profile}`;
}

export function startConversation(db: DB, ai: AIProvider, userId: number, scenarioId: string, now: Date) {
  const sc = scenario(db, scenarioId);
  const guided = !ai.available;
  const id = Number(
    db
      .prepare(`INSERT INTO ai_threads (user_id, mode, scenario_id, title, guided, created_at, updated_at) VALUES (?, 'conversation', ?, ?, ?, ?, ?)`)
      .run(userId, sc.id, sc.title, guided ? 1 : 0, now.toISOString(), now.toISOString()).lastInsertRowid,
  );
  addMessage(db, id, 'assistant', sc.opening, now);
  return { thread: getThread(db, userId, id), scenario: sc };
}

export async function conversationMessage(db: DB, ai: AIProvider, userId: number, threadId: number, text: string, now: Date, onText: (d: string) => void) {
  const t = getThread(db, userId, threadId);
  if (t.mode !== 'conversation') throw badRequest('Not a conversation');
  if (t.status === 'finished') throw badRequest('This conversation has finished.');
  const message = text.trim().slice(0, 2000);
  if (!message) throw badRequest('Say something first.');
  addMessage(db, threadId, 'user', message, now);
  const sc = scenario(db, t.scenarioId!);
  let reply: string;
  let done = false;
  if (t.guided) {
    const userTurns = t.messages.filter((m) => m.role === 'user').length; // before this message
    const turn = sc.guidedTurns[userTurns];
    if (turn) reply = turn.prompt;
    else {
      reply = 'Thank you — that was great practice. Press "Finish" to see your feedback.';
      done = true;
    }
    onText(reply);
  } else {
    const settings = getSettings(db, userId);
    // The API needs the conversation to start with a user turn; the scenario opening is given as context instead.
    const msgs: ChatMessage[] = [{ role: 'user', content: `(Start of role-play. You already said: "${sc.opening}")` }, ...history(db, threadId, 40)];
    reply = await ai.stream({ system: conversationSystem(sc, settings.courseLevel, learnerProfileText(db, userId)), messages: msgs, maxTokens: 600, effort: 'low' }, onText);
  }
  addMessage(db, threadId, 'assistant', reply, new Date());
  const hint = t.guided ? sc.guidedTurns[t.messages.filter((m) => m.role === 'user').length]?.hint ?? null : null;
  return { reply, done, hint };
}

const conversationFeedbackSchema = z4.object({
  summary: z4.string(),
  strengths: z4.array(z4.string()),
  improvements: z4.array(z4.string()),
  corrections: z4.array(z4.object({ original: z4.string(), improved: z4.string(), explanation: z4.string() })).describe('Up to 6 of the learner\'s own sentences with better versions'),
  usefulPhrases: z4.array(z4.object({ phrase: z4.string(), meaning: z4.string() })),
  goalAchieved: z4.boolean(),
  score: z4.number().describe('0-100 for communication at the target level'),
});

export async function finishConversation(db: DB, ai: AIProvider, userId: number, threadId: number, now: Date) {
  const t = getThread(db, userId, threadId);
  if (t.status === 'finished' && t.feedback) return { feedback: t.feedback, xp: 0, achievements: [] };
  const sc = scenario(db, t.scenarioId!);
  const learnerTurns = t.messages.filter((m) => m.role === 'user').map((m) => m.content);
  if (!learnerTurns.length) throw badRequest('Say something before finishing.');
  const settings = getSettings(db, userId);
  let feedback: Record<string, unknown>;

  if (ai.available) {
    const transcript = t.messages.map((m) => `${m.role === 'user' ? 'LEARNER' : 'PARTNER'}: ${m.content}`).join('\n');
    try {
      feedback = {
        source: 'ai',
        ...(await ai.structured({
          schema: conversationFeedbackSchema,
          effort: 'medium',
          system: `You are an English speaking coach. The learner (Mongolian native speaker, course level ${settings.courseLevel}) just finished a role-play: "${sc.title}". Their goal: ${sc.learnerGoal}. Give warm, specific feedback on their turns only. Never say "failed"; say "not quite yet". Corrections: quote the learner's words exactly as "original".`,
          messages: [{ role: 'user', content: transcript }],
        })),
      };
    } catch (err) {
      feedback = offlineConversationFeedback(sc, learnerTurns);
      feedback.note = `AI feedback was not available (${(err as Error).message}).`;
    }
  } else {
    feedback = offlineConversationFeedback(sc, learnerTurns);
  }

  for (const c of ((feedback.corrections as { original: string; improved: string; explanation: string }[]) ?? []).slice(0, 6)) {
    if (normalizeAnswer(c.original) !== normalizeAnswer(c.improved)) {
      upsertError(db, userId, { category: 'grammar', key: `c:${normalizeAnswer(c.original).slice(0, 120)}`, wrong: c.original, correct: c.improved, explanation: c.explanation, source: 'conversation' }, now);
    }
  }
  db.prepare(`UPDATE ai_threads SET status = 'finished', feedback = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(feedback), now.toISOString(), threadId);
  if (typeof feedback.score === 'number' && feedback.source === 'ai') applyEvidence(db, userId, 'speaking', settings.courseLevel, (feedback.score as number) / 100, 'practice', now);
  const act = logActivity(db, userId, { type: 'conversation', ref: sc.id, skill: 'speaking', minutes: Math.min(20, 2 + learnerTurns.length), score: typeof feedback.score === 'number' ? (feedback.score as number) / 100 : null, xp: XP.conversation, xpReason: `Conversation: ${sc.title}` }, now);
  return { feedback, ...act };
}

function offlineConversationFeedback(sc: Scenario, turns: string[]) {
  const text = turns.join('\n');
  const analysis = analyzeWriting(text, {});
  const lower = text.toLowerCase();
  const phrasesUsed = sc.phrases.filter((p) => lower.includes(p.toLowerCase().replace(/[.…!?]+$/, '').replace(/\.\.\.$/, '').trim().slice(0, 18)));
  const avgWords = Math.round(turns.reduce((a, t) => a + t.split(/\s+/).length, 0) / turns.length);
  const strengths: string[] = [];
  const improvements: string[] = [];
  if (avgWords >= 12) strengths.push(`Your answers were well developed (about ${avgWords} words per turn).`);
  else improvements.push(`Try to give longer answers (you averaged ${avgWords} words). Add a reason or an example to each answer.`);
  if (phrasesUsed.length) strengths.push(`You used useful phrases: ${phrasesUsed.map((p) => `“${p}”`).join(', ')}.`);
  else improvements.push('Try to include some of the useful phrases for this situation next time.');
  if (!analysis.issues.length) strengths.push('No common learner errors were found by the automatic checker.');
  return {
    source: 'guided',
    summary: 'Guided practice finished. Compare your answers with the sample answers below — reading them aloud is great speaking practice.',
    strengths,
    improvements,
    corrections: analysis.issues.slice(0, 6).map((i) => ({ original: i.sentence, improved: i.improvedSentence, explanation: i.explanation })),
    usefulPhrases: sc.phrases.map((p) => ({ phrase: p, meaning: '' })),
    samples: sc.guidedTurns.map((g) => ({ prompt: g.prompt, sample: g.sample })),
    goalAchieved: turns.length >= Math.min(4, sc.guidedTurns.length),
    note: 'Automatic feedback (no AI). It checks answer length, useful phrases and common mistakes.',
  };
}

export { labelFor };
