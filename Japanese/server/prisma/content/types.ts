// Shape of the hand-written educational content used by the seed script.

export interface ExampleSentence {
  ja: string;
  mn: string;
  reading?: string;
}

export interface DialogueLine {
  speaker: string;
  ja: string;
  mn: string;
}

export interface LessonDef {
  key: string; // "1.2" — module.lesson
  slug: string;
  title: string;
  titleJa: string;
  summary: string;
  objectives: string[];
  intro: string;
  examples?: ExampleSentence[];
  dialogue?: DialogueLine[];
  tips?: string[];
  links?: { label: string; to: string }[];
  minutes?: number;
}

export interface ModuleDef {
  order: number;
  slug: string;
  title: string;
  titleJa: string;
  description: string;
  lessons: LessonDef[];
}

/** [word, kana, mongolian, english, partOfSpeech, example, exampleMn] */
export type VocabTuple = [string, string, string, string, string, string, string];

export interface KanjiDef {
  char: string;
  meaning: string;
  en: string;
  on: string;
  kun: string;
  strokes: number;
  examples: [string, string, string][]; // word, reading, meaning
  sentence: [string, string]; // ja, mn
}

export interface QuestionDef {
  type: 'multiple_choice' | 'true_false' | 'fill_blank' | 'matching' | 'ja_to_mn' | 'mn_to_ja' | 'kanji_reading' | 'listening' | 'typing';
  prompt: string;
  options?: string[];
  answer: string;
  explanation: string;
  passage?: string;
  audioText?: string;
  difficulty?: number;
  category?: string;
  section?: string;
}

export interface GrammarDef {
  slug: string;
  lesson: string; // lesson key
  title: string;
  meaning: string;
  structure: string;
  category: 'particles' | 'verbs' | 'adjectives' | 'grammar' | 'numbers' | 'expressions';
  explanation: string;
  examples: [string, string][]; // ja, mn
  mistakes: { wrong: string; right: string; note: string }[];
  questions: QuestionDef[];
}

export interface StoryDef {
  slug: string;
  lesson: string;
  title: string;
  titleJa: string;
  topic: string;
  summary: string;
  /** Tokens separated by spaces: surface/reading/lemma/gloss (all but surface optional). */
  sentences: [string, string][];
  grammarNotes: { point: string; explanation: string }[];
  questions: QuestionDef[];
}

export interface ListeningDef {
  slug: string;
  lesson?: string;
  title: string;
  type: 'numbers' | 'task' | 'point' | 'utterance' | 'response';
  context: string;
  script: { speaker: string; ja: string; mn: string }[];
  vocabulary: [string, string, string][];
  grammarNote: string;
  questions: QuestionDef[];
}

export interface SpeakingDef {
  slug: string;
  title: string;
  prompt: string;
  promptMn: string;
  hint: string;
  expected: string[];
  keywords: { ja: string; alts?: string[]; mn: string }[];
}

export interface TranslationDef {
  ja: string;
  mn: string;
  /** Japanese answers accepted verbatim (after normalisation). */
  jaAccepted: string[];
  /** Keyword groups (alternatives) that must appear in a Japanese answer. */
  jaKeywords: string[][];
  /** Mongolian stems that must appear in a Mongolian answer. */
  mnKeywords: string[][];
  lesson?: string;
}
