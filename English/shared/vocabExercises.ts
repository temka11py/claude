// Generates vocabulary exercises from word data, so every word can be
// practised in many formats without authoring each exercise by hand.

import type { Dimension } from './srs';
import { findWordForm, shuffle } from './text';

export interface VocabItem {
  id: string;
  word: string;
  pos: string | null;
  ipa: string | null;
  definition: string;
  mongolian: string | null;
  examples: string[];
  collocations: string[];
  synonyms: string[];
  antonyms: string[];
  mistake: string | null;
  note: string | null;
  level: string;
  difficulty: number;
}

export type VocabMode =
  | 'flashcard'
  | 'meaning'
  | 'word_from_definition'
  | 'translation'
  | 'cloze'
  | 'cloze_typed'
  | 'collocation'
  | 'synonym'
  | 'antonym'
  | 'spelling'
  | 'builder';

export const MODE_DIMENSION: Record<VocabMode, Dimension> = {
  flashcard: 'recall',
  meaning: 'recognition',
  word_from_definition: 'recall',
  translation: 'recognition',
  cloze: 'context',
  cloze_typed: 'production',
  collocation: 'context',
  synonym: 'recognition',
  antonym: 'recognition',
  spelling: 'production',
  builder: 'production',
};

export const MODE_LABEL: Record<VocabMode, string> = {
  flashcard: 'Flashcard',
  meaning: 'Choose the meaning',
  word_from_definition: 'Which word fits the definition?',
  translation: 'Translation',
  cloze: 'Context challenge',
  cloze_typed: 'Fill in the word',
  collocation: 'Collocation',
  synonym: 'Synonym challenge',
  antonym: 'Antonym challenge',
  spelling: 'Listen and spell',
  builder: 'Word builder',
};

interface ExerciseBase {
  id: string;
  vocabId: string;
  mode: VocabMode;
  dimension: Dimension;
  word: string;
  prompt: string;
  /** Shown after answering. */
  reveal: { word: string; definition: string; mongolian: string | null; example: string | null; ipa: string | null };
}

export interface FlashcardExercise extends ExerciseBase {
  kind: 'flashcard';
  pos: string | null;
  collocations: string[];
}
export interface ChoiceExercise extends ExerciseBase {
  kind: 'choice';
  options: string[];
  answerIndex: number;
  sentence?: string;
}
export interface TypedExercise extends ExerciseBase {
  kind: 'typed';
  answers: string[];
  hint: string;
  sentence?: string;
  /** Text read aloud for listen-and-spell. */
  speak?: string;
}
export interface BuilderExercise extends ExerciseBase {
  kind: 'builder';
  letters: string[];
  answer: string;
}
export type VocabExercise = FlashcardExercise | ChoiceExercise | TypedExercise | BuilderExercise;

function reveal(item: VocabItem): ExerciseBase['reveal'] {
  return {
    word: item.word,
    definition: item.definition,
    mongolian: item.mongolian,
    example: item.examples[0] ?? null,
    ipa: item.ipa,
  };
}

function base(item: VocabItem, mode: VocabMode, prompt: string): ExerciseBase {
  return { id: `${item.id}:${mode}`, vocabId: item.id, mode, dimension: MODE_DIMENSION[mode], word: item.word, prompt, reveal: reveal(item) };
}

function blankSentence(item: VocabItem): { sentence: string; form: string } | null {
  for (const ex of item.examples) {
    const form = findWordForm(ex, item.word);
    if (form) return { sentence: ex.replace(form, '_____'), form };
  }
  return null;
}

/** Pick distractors: same part of speech first, never the word itself or its synonyms. */
function distractors<T>(
  item: VocabItem,
  pool: VocabItem[],
  pick: (v: VocabItem) => T | null,
  count: number,
  random: () => number,
): T[] {
  const lower = item.word.toLowerCase();
  const avoid = new Set([lower, ...item.synonyms.map((s) => s.toLowerCase()), ...item.antonyms.map((s) => s.toLowerCase())]);
  const candidates = pool.filter((v) => v.id !== item.id && !avoid.has(v.word.toLowerCase()));
  const samePos = shuffle(candidates.filter((v) => v.pos === item.pos), random);
  const other = shuffle(candidates.filter((v) => v.pos !== item.pos), random);
  const out: T[] = [];
  const seen = new Set<string>();
  for (const v of [...samePos, ...other]) {
    const value = pick(v);
    if (value === null) continue;
    const key = String(value).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= count) break;
  }
  return out;
}

function choice(item: VocabItem, mode: VocabMode, prompt: string, correct: string, wrong: string[], random: () => number, sentence?: string): ChoiceExercise | null {
  if (wrong.length < 2) return null;
  const options = shuffle([correct, ...wrong.slice(0, 3)], random);
  return { ...base(item, mode, prompt), kind: 'choice', options, answerIndex: options.indexOf(correct), sentence };
}

const DELEXICAL_VERBS = ['make', 'do', 'take', 'have', 'get', 'give', 'meet', 'reach', 'gain', 'pay', 'set', 'keep', 'catch', 'raise', 'run', 'hold', 'draw', 'break'];

export function buildExercise(item: VocabItem, mode: VocabMode, pool: VocabItem[], random: () => number): VocabExercise | null {
  switch (mode) {
    case 'flashcard':
      return { ...base(item, mode, 'Do you remember what this means?'), kind: 'flashcard', pos: item.pos, collocations: item.collocations.slice(0, 3) };

    case 'meaning':
      return choice(item, mode, `What does “${item.word}” mean?`, item.definition, distractors(item, pool, (v) => v.definition, 3, random), random);

    case 'word_from_definition':
      return choice(item, mode, item.definition, item.word, distractors(item, pool, (v) => v.word, 3, random), random);

    case 'translation': {
      if (!item.mongolian) return null;
      return choice(item, mode, `Which English word means “${item.mongolian}”?`, item.word, distractors(item, pool, (v) => v.word, 3, random), random);
    }

    case 'cloze': {
      const blank = blankSentence(item);
      if (!blank) return null;
      return choice(item, mode, 'Choose the word that fits the context.', item.word, distractors(item, pool, (v) => v.word, 3, random), random, blank.sentence);
    }

    case 'cloze_typed': {
      const blank = blankSentence(item);
      if (!blank) return null;
      const answers = [...new Set([blank.form, item.word])];
      return {
        ...base(item, mode, 'Type the missing word.'),
        kind: 'typed',
        answers,
        hint: `${blank.form[0]}${'_'.repeat(Math.max(0, blank.form.length - 1))} (${blank.form.length} letters) — ${item.definition}`,
        sentence: blank.sentence,
      };
    }

    case 'collocation': {
      const colloc = item.collocations.find((c) => findWordForm(c, item.word));
      if (!colloc) return null;
      const form = findWordForm(colloc, item.word)!;
      const rest = colloc.replace(form, '').trim();
      // If the word itself is a delexical verb, test the verb; otherwise test the word in its collocation.
      if (DELEXICAL_VERBS.includes(item.word.toLowerCase())) {
        const wrong = shuffle(DELEXICAL_VERBS.filter((v) => v !== item.word.toLowerCase()), random).slice(0, 3);
        return choice(item, mode, `Complete the collocation: ___ ${rest}`, item.word, wrong, random);
      }
      const leadingVerb = colloc.split(' ')[0].toLowerCase();
      if (DELEXICAL_VERBS.includes(leadingVerb) && form.toLowerCase() !== leadingVerb) {
        const wrong = shuffle(DELEXICAL_VERBS.filter((v) => v !== leadingVerb), random).slice(0, 3);
        return {
          ...choice(item, mode, `Which verb goes with “${colloc.replace(/^\S+\s*/, '')}”?`, leadingVerb, wrong, random)!,
          sentence: `___ ${colloc.replace(/^\S+\s*/, '')}`,
        };
      }
      return choice(item, mode, 'Complete the collocation.', item.word, distractors(item, pool, (v) => v.word, 3, random), random, colloc.replace(form, '_____'));
    }

    case 'synonym': {
      if (item.synonyms.length === 0) return null;
      const syn = item.synonyms[Math.floor(random() * item.synonyms.length)];
      return choice(item, mode, `Which word is closest in meaning to “${item.word}”?`, syn, distractors(item, pool, (v) => v.word, 3, random), random);
    }

    case 'antonym': {
      if (item.antonyms.length === 0) return null;
      const ant = item.antonyms[Math.floor(random() * item.antonyms.length)];
      const wrong = [...item.synonyms.slice(0, 1), ...distractors(item, pool, (v) => v.word, 3, random)];
      return choice(item, mode, `Which word is the opposite of “${item.word}”?`, ant, wrong, random);
    }

    case 'spelling': {
      if (/\s/.test(item.word)) return null;
      return {
        ...base(item, mode, 'Listen and type the word you hear.'),
        kind: 'typed',
        answers: [item.word],
        hint: item.definition,
        speak: item.word,
      };
    }

    case 'builder': {
      const w = item.word.replace(/\s+/g, ' ');
      if (w.length < 3 || w.length > 16) return null;
      let letters = shuffle(w.replace(/ /g, '').split(''), random);
      if (letters.join('') === w.replace(/ /g, '') && letters.length > 2) letters = [...letters.slice(1), letters[0]];
      return { ...base(item, mode, `Build the word: ${item.definition}`), kind: 'builder', letters, answer: w.replace(/ /g, '') };
    }
  }
}

const MODES_BY_DIMENSION: Record<Dimension, VocabMode[]> = {
  recognition: ['meaning', 'translation', 'synonym', 'antonym'],
  recall: ['flashcard', 'word_from_definition'],
  context: ['cloze', 'collocation'],
  production: ['cloze_typed', 'builder', 'spelling'],
};

/**
 * Build one exercise for a word, aimed at a given dimension, trying modes in a
 * random order and falling back to a flashcard (which always works).
 */
export function exerciseFor(item: VocabItem, dimension: Dimension, pool: VocabItem[], random: () => number, avoid: VocabMode[] = []): VocabExercise {
  const modes = shuffle(MODES_BY_DIMENSION[dimension], random).filter((m) => !avoid.includes(m));
  for (const mode of modes) {
    const ex = buildExercise(item, mode, pool, random);
    if (ex) return ex;
  }
  return buildExercise(item, 'flashcard', pool, random)!;
}

/** Interleave exercise modes so a review never becomes ten identical questions in a row. */
export function interleave<T extends { mode: string }>(items: T[]): T[] {
  const out: T[] = [];
  const rest = [...items];
  while (rest.length) {
    const lastMode = out[out.length - 1]?.mode;
    const idx = rest.findIndex((x) => x.mode !== lastMode);
    out.push(rest.splice(idx === -1 ? 0 : idx, 1)[0]);
  }
  return out;
}
