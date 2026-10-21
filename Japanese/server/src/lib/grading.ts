import { kanaToRomaji, toHiragana } from './kana.js';

export type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'matching'
  | 'fill_blank'
  | 'typing'
  | 'ja_to_mn'
  | 'mn_to_ja'
  | 'kanji_reading'
  | 'listening';

export interface GradableQuestion {
  type: string;
  options: string; // JSON
  correctAnswer: string;
}

export interface GradeResult {
  correct: boolean;
  /** Human readable canonical answer to show after submission. */
  expected: string;
  /** Optional detail for free-text answers (e.g. matched keywords). */
  feedback?: { matched: string[]; missing: string[]; ratio: number };
}

const JA_PUNCT = /[\s　。、．，,.!！?？「」『』（）()・〜~…"'“”‘’]/g;
const MN_PUNCT = /[.,!?;:"'“”«»()\-–—]/g;

export function normalizeJapanese(value: string): string {
  return toHiragana(value.normalize('NFKC').replace(JA_PUNCT, '')).toLowerCase();
}

export function normalizeRomaji(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ā/g, 'aa')
    .replace(/ī/g, 'ii')
    .replace(/ū/g, 'uu')
    .replace(/ē/g, 'ee')
    .replace(/ō/g, 'ou')
    .replace(/[\s'’\-.]/g, '');
}

export function normalizeMongolian(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(MN_PUNCT, ' ').replace(/\s+/g, ' ').trim();
}

export function alternatives(correctAnswer: string): string[] {
  return correctAnswer.split('||').map((s) => s.trim()).filter(Boolean);
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Japanese answer check that also accepts a romaji or kana-only answer when given. */
function matchesJapanese(answer: string, accepted: string[]): boolean {
  const a = normalizeJapanese(answer);
  if (!a) return false;
  return accepted.some((alt) => {
    const n = normalizeJapanese(alt);
    if (n === a) return true;
    // Allow learners to type romaji for kana-only answers (e.g. typing drills).
    if (/^[a-z']+$/.test(a) && /^[぀-ゟー]+$/.test(n)) {
      return normalizeRomaji(kanaToRomaji(n)) === normalizeRomaji(a);
    }
    return false;
  });
}

interface KeywordOptions {
  keywords?: string[][]; // each group lists acceptable stems/synonyms
}

/**
 * Free-text Mongolian translation check. Mongolian is agglutinative, so every
 * keyword group holds word stems; a group is matched if any stem appears.
 */
export function gradeMongolian(answer: string, correctAnswer: string, optionsJson: string): GradeResult {
  const accepted = alternatives(correctAnswer);
  const normalized = normalizeMongolian(answer);
  const exact = accepted.some((alt) => normalizeMongolian(alt) === normalized);
  const { keywords = [] } = parseJson<KeywordOptions>(optionsJson, {});
  const matched: string[] = [];
  const missing: string[] = [];
  for (const group of keywords) {
    const hit = group.some((stem) => normalized.includes(normalizeMongolian(stem)));
    (hit ? matched : missing).push(group[0]);
  }
  const ratio = keywords.length ? matched.length / keywords.length : exact ? 1 : 0;
  return {
    correct: normalized.length > 0 && (exact || ratio >= 0.75),
    expected: accepted[0] ?? '',
    feedback: { matched, missing, ratio: exact ? 1 : ratio },
  };
}

export function gradeAnswer(question: GradableQuestion, rawAnswer: string | undefined | null): GradeResult {
  const answer = (rawAnswer ?? '').toString();
  const accepted = alternatives(question.correctAnswer);

  switch (question.type) {
    case 'matching': {
      const expected = parseJson<string[]>(question.correctAnswer, []);
      const given = parseJson<string[]>(answer, []);
      const correct = expected.length > 0 && expected.every((value, i) => given[i] === value);
      return { correct, expected: expected.join(' · ') };
    }
    case 'true_false':
      return { correct: answer === question.correctAnswer, expected: question.correctAnswer };
    case 'typing': {
      // Romaji typing for kana, or kana typing for readings.
      const a = normalizeRomaji(answer);
      const correct =
        a.length > 0 &&
        (accepted.some((alt) => normalizeRomaji(alt) === a) || matchesJapanese(answer, accepted));
      return { correct, expected: accepted[0] ?? '' };
    }
    case 'fill_blank':
      return { correct: matchesJapanese(answer, accepted), expected: accepted[0] ?? '' };
    case 'mn_to_ja': {
      if (matchesJapanese(answer, accepted)) {
        return { correct: true, expected: accepted[0] ?? '', feedback: { matched: [], missing: [], ratio: 1 } };
      }
      const { keywords = [] } = parseJson<KeywordOptions>(question.options, {});
      if (keywords.length === 0) return { correct: false, expected: accepted[0] ?? '' };
      // Particles and punctuation are not required for basic checking: content words must appear.
      const normalized = normalizeJapanese(answer);
      const matched: string[] = [];
      const missing: string[] = [];
      for (const group of keywords) {
        const hit = group.some((k) => normalized.includes(normalizeJapanese(k)));
        (hit ? matched : missing).push(group[0]);
      }
      const ratio = matched.length / keywords.length;
      return { correct: normalized.length > 0 && ratio >= 0.75, expected: accepted[0] ?? '', feedback: { matched, missing, ratio } };
    }
    case 'ja_to_mn': {
      const options = parseJson<unknown>(question.options, null);
      if (Array.isArray(options) && options.length > 0) {
        return { correct: accepted.includes(answer), expected: accepted[0] ?? '' };
      }
      return gradeMongolian(answer, question.correctAnswer, question.options);
    }
    default:
      // multiple_choice, kanji_reading, listening
      return { correct: accepted.includes(answer), expected: accepted[0] ?? '' };
  }
}
