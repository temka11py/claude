// Answer checking for every question type. Used by the browser for instant
// feedback in practice and by the server to grade tests and exams.

import type { Question } from './contentSchema';
import { cleanText, keywords, levenshtein, normalizeAnswer, stem } from './text';

export type AnswerValue = number | string | string[] | null;

export interface CheckResult {
  correct: boolean;
  /** 0–1 credit (multi-part questions give partial credit). */
  score: number;
  /** "almost": right idea, small spelling slip. */
  feedback?: 'almost';
  /** Human-readable correct answer. */
  expected: string;
}

function typedMatch(given: string, accepted: string[]): { score: number; almost: boolean } {
  const g = normalizeAnswer(given);
  if (!g) return { score: 0, almost: false };
  let best = Infinity;
  for (const a of accepted) {
    const n = normalizeAnswer(a);
    if (n === g) return { score: 1, almost: false };
    best = Math.min(best, levenshtein(n, g));
  }
  // A one- or two-letter slip in a longer answer earns half credit.
  const shortest = Math.min(...accepted.map((a) => normalizeAnswer(a).length));
  const tolerance = shortest >= 12 ? 2 : shortest >= 5 ? 1 : 0;
  if (best <= tolerance) return { score: 0.5, almost: true };
  return { score: 0, almost: false };
}

function keywordMatch(given: string, accepted: string[]): number {
  const g = new Set(keywords(given));
  const n = normalizeAnswer(given);
  for (const a of accepted) {
    if (normalizeAnswer(a) === n) return 1;
    const kws = keywords(a);
    if (kws.length > 0 && kws.every((k) => g.has(k) || g.has(stem(k)))) return 1;
  }
  return 0;
}

export function expectedAnswer(q: Question): string {
  switch (q.type) {
    case 'mcq':
      return q.options[q.answer];
    case 'gap':
    case 'short':
    case 'correct':
    case 'transform':
      return q.answers[0];
    case 'tfng':
      return q.answer === 'not_given' ? 'Not given' : q.answer === 'true' ? 'True' : 'False';
    case 'order':
      return q.items.join(' → ');
    case 'words':
      return q.answer;
    case 'match':
      return q.pairs.map(([l, r]) => `${l} → ${r}`).join('; ');
    case 'error':
      return `${q.segments[q.wrongIndex]} → ${q.correction}`;
    case 'summary':
      return q.answers.join(', ');
  }
}

export function checkAnswer(q: Question, value: AnswerValue): CheckResult {
  const expected = expectedAnswer(q);
  const result = (score: number, feedback?: 'almost'): CheckResult => ({
    correct: score >= 1,
    score,
    feedback,
    expected,
  });

  if (value === null || value === undefined) return result(0);

  switch (q.type) {
    case 'mcq':
      return result(Number(value) === q.answer ? 1 : 0);

    case 'tfng':
      return result(String(value) === q.answer ? 1 : 0);

    case 'error':
      return result(Number(value) === q.wrongIndex ? 1 : 0);

    case 'gap': {
      if (q.options) {
        const v = normalizeAnswer(String(value));
        return result(q.answers.some((a) => normalizeAnswer(a) === v) ? 1 : 0);
      }
      const m = typedMatch(String(value), q.answers);
      return result(m.score, m.almost ? 'almost' : undefined);
    }

    case 'correct':
    case 'transform': {
      const given = String(value);
      if (q.type === 'transform' && q.keyword) {
        // The keyword must appear in the rewritten sentence.
        const kw = cleanText(q.keyword).toLowerCase();
        if (!cleanText(given).toLowerCase().includes(kw) && !normalizeAnswer(given).includes(normalizeAnswer(kw))) {
          return result(0);
        }
      }
      const m = typedMatch(given, q.answers);
      return result(m.score, m.almost ? 'almost' : undefined);
    }

    case 'short': {
      if (q.match === 'exact') {
        const m = typedMatch(String(value), q.answers);
        return result(m.score, m.almost ? 'almost' : undefined);
      }
      return result(keywordMatch(String(value), q.answers));
    }

    case 'words': {
      const given = Array.isArray(value) ? value.join(' ') : String(value);
      const accepted = [q.answer, ...(q.alternatives ?? [])];
      const g = normalizeAnswer(given);
      return result(accepted.some((a) => normalizeAnswer(a) === g) ? 1 : 0);
    }

    case 'order': {
      if (!Array.isArray(value)) return result(0);
      const correctPositions = q.items.filter((item, i) => value[i] === item).length;
      return result(correctPositions === q.items.length ? 1 : correctPositions / q.items.length);
    }

    case 'match': {
      if (!Array.isArray(value)) return result(0);
      const right = q.pairs.filter(([, r], i) => normalizeAnswer(value[i] ?? '') === normalizeAnswer(r)).length;
      return result(right / q.pairs.length);
    }

    case 'summary': {
      if (!Array.isArray(value)) return result(0);
      const right = q.answers.filter((a, i) => normalizeAnswer(value[i] ?? '') === normalizeAnswer(a)).length;
      return result(right / q.answers.length);
    }
  }
}

/** Remove answers before sending a question to the browser in graded tests. */
export function stripAnswer(q: Question): Record<string, unknown> {
  const { explanation: _e, explanationMn: _m, ...rest } = q as Question & Record<string, unknown>;
  switch (q.type) {
    case 'mcq':
    case 'tfng': {
      const { answer: _a, ...r } = rest as Record<string, unknown>;
      return r;
    }
    case 'gap':
    case 'short':
    case 'correct':
    case 'transform': {
      const { answers: _a, ...r } = rest as Record<string, unknown>;
      return r;
    }
    case 'words': {
      const { answer, alternatives: _alt, distractors, ...r } = rest as Record<string, unknown> & { answer: string; distractors?: string[] };
      // The tiles are the words of the answer (shuffled by the client) plus distractors.
      return { ...r, tiles: [...answer.split(/\s+/), ...(distractors ?? [])].sort() };
    }
    case 'order': {
      const { items, ...r } = rest as Record<string, unknown> & { items: string[] };
      return { ...r, items: [...items].sort() };
    }
    case 'match': {
      const { pairs, ...r } = rest as Record<string, unknown> & { pairs: [string, string][] };
      return { ...r, left: pairs.map((p) => p[0]), right: pairs.map((p) => p[1]).sort() };
    }
    case 'error': {
      const { wrongIndex: _w, correction: _c, ...r } = rest as Record<string, unknown>;
      return r;
    }
    case 'summary': {
      const { answers: _a, ...r } = rest as Record<string, unknown>;
      return r;
    }
  }
}

/** Weighted percentage from section results, e.g. module test sections. */
export function weightedPercent(sections: { weight: number; percent: number | null }[]): number {
  const scored = sections.filter((s) => s.percent !== null);
  const totalWeight = scored.reduce((a, s) => a + s.weight, 0);
  if (totalWeight === 0) return 0;
  return scored.reduce((a, s) => a + s.weight * (s.percent ?? 0), 0) / totalWeight;
}
