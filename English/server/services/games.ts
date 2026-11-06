// Mini games built only from vocabulary and grammar the learner has already met.

import type { DB } from '../db';
import { parseJson } from '../db';
import type { Question } from '@shared/contentSchema';
import { GAMES } from '@shared/sessionPlanner';
import { buildExercise, type VocabExercise, type VocabMode } from '@shared/vocabExercises';
import { seededRandom, shuffle, tokenize } from '@shared/text';
import { XP } from '@shared/gamification';
import { badRequest } from '../http';
import { logActivity } from './activity';
import { distractorPool, gradeWord, rowToItem, type VocabRow } from './vocab';
import { recordResponses } from './skills';
import { grammarReviewSet } from './practice';
import { dueErrors } from './errors';
import { getSettings } from './users';

export const MIN_WORDS = 8;

function knownWords(db: DB, userId: number, limit = 60): VocabRow[] {
  return db
    .prepare(
      `SELECT v.* FROM user_vocab uv JOIN vocabulary v ON v.id = uv.vocab_id
       WHERE uv.user_id = ? AND uv.state != 'NEW' ORDER BY uv.confidence ASC, uv.last_reviewed_at DESC LIMIT ?`,
    )
    .all(userId, limit) as VocabRow[];
}

export function gameList(db: DB, userId: number) {
  const words = db.prepare(`SELECT COUNT(*) FROM user_vocab WHERE user_id = ? AND state != 'NEW'`).pluck().get(userId) as number;
  const grammar = grammarReviewSet(db, userId, 12, 'count').length;
  const best = db.prepare(`SELECT ref, MAX(score) AS best, COUNT(*) AS plays FROM activity_log WHERE user_id = ? AND type = 'game' GROUP BY ref`).all(userId) as {
    ref: string;
    best: number;
    plays: number;
  }[];
  const bestBy = new Map(best.map((b) => [b.ref, b]));
  return GAMES.map((g) => {
    const needsGrammar = g.skill === 'grammar';
    const available = needsGrammar ? grammar >= 5 : words >= MIN_WORDS;
    return {
      ...g,
      available,
      requirement: available ? null : needsGrammar ? 'Complete a grammar lesson to unlock this game.' : `Learn at least ${MIN_WORDS} words to unlock (${words}/${MIN_WORDS}).`,
      best: bestBy.get(g.id)?.best ?? null,
      plays: bestBy.get(g.id)?.plays ?? 0,
    };
  });
}

function exercises(rows: VocabRow[], pool: ReturnType<typeof distractorPool>, modes: VocabMode[], count: number, random: () => number): VocabExercise[] {
  const out: VocabExercise[] = [];
  for (const row of shuffle(rows, random)) {
    if (out.length >= count) break;
    for (const mode of shuffle(modes, random)) {
      const ex = buildExercise(rowToItem(row), mode, pool, random);
      if (ex) {
        out.push(ex);
        break;
      }
    }
  }
  return out;
}

/** Generate a round for a game. */
export function gameRound(db: DB, userId: number, gameId: string, now: Date) {
  const game = GAMES.find((g) => g.id === gameId);
  if (!game) throw badRequest('Unknown game');
  const random = seededRandom(`${userId}:${gameId}:${now.getTime()}`);
  const words = knownWords(db, userId);
  const pool = distractorPool(db, userId);
  const needWords = () => {
    if (words.length < MIN_WORDS) throw badRequest(`Learn at least ${MIN_WORDS} words first — games only use words you have already met.`);
  };
  const vocabDifficulty = (db.prepare(`SELECT difficulty FROM skill_profile WHERE user_id = ? AND skill = 'vocabulary'`).pluck().get(userId) as number) ?? 4;

  switch (gameId) {
    case 'word-match':
    case 'memory': {
      needWords();
      const picked = shuffle(words.filter((w) => w.mongolian), random).slice(0, gameId === 'memory' ? 6 : 6);
      const useDefinition = gameId === 'word-match' && random() < 0.5;
      return {
        game,
        pairs: picked.map((w) => ({ vocabId: w.id, left: w.word, right: useDefinition ? w.definition : w.mongolian! })),
        rightLabel: useDefinition ? 'Definition' : 'Mongolian',
      };
    }
    case 'speed':
    case 'vocab-race': {
      needWords();
      return {
        game,
        seconds: gameId === 'speed' ? 60 : 90,
        items: exercises(words, pool, ['meaning', 'translation', 'word_from_definition', 'synonym'], 30, random),
      };
    }
    case 'collocation':
      needWords();
      return { game, items: exercises(words.filter((w) => parseJson<string[]>(w.collocations, []).length), pool, ['collocation'], 8, random) };
    case 'synonym-battle':
      needWords();
      return {
        game,
        hp: 5,
        items: exercises(words.filter((w) => parseJson<string[]>(w.synonyms, []).length || parseJson<string[]>(w.antonyms, []).length), pool, ['synonym', 'antonym'], 10, random),
      };
    case 'missing-word':
      needWords();
      return { game, items: exercises(words, pool, ['cloze'], 10, random) };
    case 'word-builder':
      needWords();
      return { game, items: exercises(words.filter((w) => !/\s/.test(w.word)), pool, ['builder'], 8, random) };
    case 'listening-detective': {
      needWords();
      const items = exercises(words, pool, ['cloze'], 8, random)
        .filter((e) => e.kind === 'choice' && e.sentence)
        .map((e) => ({ ...e, speak: e.kind === 'choice' && e.sentence ? e.sentence.replace(/_{3,}/, e.options[e.answerIndex]) : '' }));
      return { game, items };
    }
    case 'sentence-builder': {
      const grammar = grammarReviewSet(db, userId, 30, `${now.getTime()}`).filter((q) => q.type === 'words');
      const sentences: { answer: string; alternatives: string[]; source: string }[] = grammar.map((q) => ({
        answer: (q as Extract<Question, { type: 'words' }>).answer,
        alternatives: (q as Extract<Question, { type: 'words' }>).alternatives ?? [],
        source: 'Grammar',
      }));
      for (const w of shuffle(words, random)) {
        if (sentences.length >= 8) break;
        const ex = parseJson<string[]>(w.examples, []).find((s) => tokenize(s).length >= 5 && tokenize(s).length <= 11);
        if (ex) sentences.push({ answer: ex, alternatives: [], source: w.word });
      }
      if (sentences.length < 3) throw badRequest('Learn a few more words or finish a grammar lesson to play Sentence Builder.');
      return { game, items: shuffle(sentences, random).slice(0, 8).map((s) => ({ ...s, tiles: shuffle(tokenize(s.answer), random) })) };
    }
    case 'grammar-duel': {
      const qs = grammarReviewSet(db, userId, 10, `${now.getTime()}`).filter((q) => q.type === 'mcq' || (q.type === 'gap' && q.options));
      if (qs.length < 5) throw badRequest('Finish a grammar lesson to unlock Grammar Duel.');
      const grammarDifficulty = (db.prepare(`SELECT difficulty FROM skill_profile WHERE user_id = ? AND skill = 'grammar'`).pluck().get(userId) as number) ?? 4;
      // The rival answers faster as your grammar difficulty level rises.
      return { game, questions: qs, rivalSeconds: Math.max(5, 14 - grammarDifficulty), rivalAccuracy: Math.min(0.9, 0.55 + grammarDifficulty * 0.03) };
    }
    case 'boss': {
      needWords();
      const settings = getSettings(db, userId);
      const vocab = exercises(words, pool, ['meaning', 'cloze', 'collocation', 'cloze_typed', 'translation'], 8, random);
      const grammar = grammarReviewSet(db, userId, 4, `${now.getTime()}:boss`);
      const mistakes = dueErrors(db, userId, now, settings.schedule, 3).map((e) => ({ id: e.id, wrong: e.wrong, correct: e.correct, explanation: e.explanation }));
      return { game, bossHp: vocab.length + grammar.length + mistakes.length, playerHp: vocabDifficulty <= 4 ? 5 : 4, vocab, grammar, mistakes };
    }
  }
  throw badRequest('Unknown game');
}

export function recordGameResult(
  db: DB,
  userId: number,
  gameId: string,
  input: { correct: number; total: number; words?: { vocabId: string; correct: boolean }[]; grammar?: { questionId: string; correct: boolean; qtype: string }[]; minutes?: number },
  now: Date,
) {
  const total = Math.max(1, input.total);
  const score = Math.max(0, Math.min(1, input.correct / total));
  for (const w of (input.words ?? []).slice(0, 60)) gradeWord(db, userId, { vocabId: w.vocabId, correct: w.correct, mode: 'game', source: 'game' }, now);
  if (input.grammar?.length) {
    recordResponses(
      db,
      userId,
      { type: 'game', id: gameId },
      input.grammar.slice(0, 30).map((g) => ({ questionId: g.questionId, skill: 'grammar', qtype: g.qtype, correct: g.correct, score: g.correct ? 1 : 0 })),
      now,
    );
  }
  const act = logActivity(
    db,
    userId,
    { type: 'game', ref: gameId, skill: GAMES.find((g) => g.id === gameId)?.skill ?? 'vocabulary', minutes: input.minutes ?? 4, score, xp: input.correct * XP.gamePerCorrect + (gameId === 'boss' && score >= 0.7 ? 40 : 0), xpReason: `Game: ${gameId}` },
    now,
  );
  return { score, ...act };
}
