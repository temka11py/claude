// Word-level comparison of what the learner typed/said against the expected
// sentence. Used by dictation, shadowing (speech-recognition transcripts) and
// listening detective games.

import { levenshtein, normalizeWord, tokenize } from './text';

export type DiffKind = 'match' | 'spelling' | 'wrong' | 'missing' | 'extra';

export interface DiffToken {
  kind: DiffKind;
  /** Word from the expected sentence (absent for "extra"). */
  expected?: string;
  /** Word the learner produced (absent for "missing"). */
  given?: string;
}

export interface DiffResult {
  tokens: DiffToken[];
  /** Share of expected words reproduced exactly (spelling slips count half). */
  accuracy: number;
  counts: Record<DiffKind, number>;
}

function isSpellingSlip(expected: string, given: string): boolean {
  const e = normalizeWord(expected);
  const g = normalizeWord(given);
  if (!e || !g) return false;
  const d = levenshtein(e, g);
  const allowed = e.length <= 3 ? 0 : e.length <= 6 ? 1 : 2;
  return d > 0 && d <= allowed;
}

/**
 * Align the two word sequences with a minimum-edit alignment where
 * substitutions of similar-looking words are cheap (spelling slips).
 */
export function diffWords(expectedText: string, givenText: string): DiffResult {
  const exp = tokenize(expectedText);
  const giv = tokenize(givenText);
  const e = exp.map(normalizeWord);
  const g = giv.map(normalizeWord);
  const n = e.length;
  const m = g.length;

  const subCost = (i: number, j: number) => (e[i] === g[j] ? 0 : isSpellingSlip(exp[i], giv[j]) ? 0.5 : 1.5);
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + subCost(i - 1, j - 1));
    }
  }

  const tokens: DiffToken[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + subCost(i - 1, j - 1)) {
      const kind: DiffKind = e[i - 1] === g[j - 1] ? 'match' : isSpellingSlip(exp[i - 1], giv[j - 1]) ? 'spelling' : 'wrong';
      tokens.push({ kind, expected: exp[i - 1], given: giv[j - 1] });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      tokens.push({ kind: 'missing', expected: exp[i - 1] });
      i--;
    } else {
      tokens.push({ kind: 'extra', given: giv[j - 1] });
      j--;
    }
  }
  tokens.reverse();

  const counts: Record<DiffKind, number> = { match: 0, spelling: 0, wrong: 0, missing: 0, extra: 0 };
  for (const t of tokens) counts[t.kind]++;
  const accuracy = n === 0 ? 0 : Math.max(0, (counts.match + counts.spelling * 0.5 - counts.extra * 0.25) / n);
  return { tokens, accuracy: Math.min(1, accuracy), counts };
}
