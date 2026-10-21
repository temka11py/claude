export interface Settings {
  language: 'mn' | 'en';
  showRomaji: boolean;
  showFurigana: boolean;
  dailyGoalMinutes: number;
  autoplayAudio: boolean;
  speechRate: number;
  theme: 'light' | 'dark';
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  createdAt: string;
  streak: number;
  settings: Settings | null;
}

export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface LessonSummary {
  id: number;
  slug: string;
  order: number;
  globalOrder: number;
  title: string;
  titleJa: string;
  summary: string;
  minutes: number;
  status: LessonStatus;
  sectionsDone: string[];
  quizScore: number | null;
}

export interface ModuleSummary {
  id: number;
  order: number;
  slug: string;
  title: string;
  titleJa: string;
  description: string;
  lessons: LessonSummary[];
  completed: number;
  total: number;
  test: { id: number; title: string; available: boolean; best: number | null; passed: boolean } | null;
}

export interface Kana {
  id: number;
  char: string;
  romaji: string;
  script: 'hiragana' | 'katakana';
  group: string;
  row: string;
  order: number;
  example: string;
  exampleReading: string;
  exampleMeaning: string;
  note: string;
  state?: string | null;
}

export interface Vocab {
  id: number;
  word: string;
  kana: string;
  romaji: string;
  meaning: string;
  meaningEn: string;
  partOfSpeech: string;
  example: string;
  exampleMn: string;
  difficulty: number;
  topic: string;
  lessonId: number | null;
  lesson?: { id: number; title: string } | null;
  kanji?: { id: number; char: string; meaning: string }[];
  state?: string | null;
  favorite?: boolean;
}

export interface KanjiExample {
  word: string;
  reading: string;
  meaning: string;
}

export interface Kanji {
  id: number;
  char: string;
  meaning: string;
  meaningEn: string;
  onyomi: string;
  kunyomi: string;
  strokes: number;
  examples: KanjiExample[];
  sentences: { ja: string; mn: string }[];
  order: number;
  lessonId: number | null;
  lesson?: { id: number; title: string } | null;
  vocabulary?: { id: number; word: string; kana: string; meaning: string }[];
  state?: string | null;
  favorite?: boolean;
}

export interface GrammarSummary {
  id: number;
  slug: string;
  title: string;
  meaning: string;
  structure: string;
  category: string;
  order: number;
  lesson: { id: number; title: string; module: { order: number } } | null;
  _count: { questions: number };
  state: string | null;
}

export interface Grammar {
  id: number;
  slug: string;
  title: string;
  meaning: string;
  structure: string;
  explanation: string;
  category: string;
  examples: { ja: string; mn: string }[];
  mistakes: { wrong: string; right: string; note: string }[];
  lesson: { id: number; title: string } | null;
  _count: { questions: number };
  state: string | null;
}

export interface LessonContent {
  intro: string;
  examples: { ja: string; mn: string; reading?: string }[];
  dialogue: { speaker: string; ja: string; mn: string }[] | null;
  tips: string[];
  links: { label: string; to: string }[];
}

export type SectionKey = 'kana' | 'vocabulary' | 'grammar' | 'kanji' | 'examples' | 'practice' | 'quiz' | 'review';

export interface LessonDetail {
  lesson: {
    id: number;
    slug: string;
    order: number;
    globalOrder: number;
    title: string;
    titleJa: string;
    summary: string;
    minutes: number;
    objectives: string[];
    content: LessonContent;
    module: { id: number; order: number; title: string; titleJa: string };
    kana: Kana[];
    vocabulary: Vocab[];
    kanji: Kanji[];
    grammar: Grammar[];
    stories: { id: number; slug: string; title: string; titleJa: string }[];
    quiz: { id: number; title: string; questionCount: number } | null;
  };
  sections: SectionKey[];
  status: LessonStatus;
  sectionsDone: string[];
  quizScore: number | null;
  prev: { id: number; slug: string; title: string; status?: LessonStatus } | null;
  next: { id: number; slug: string; title: string; status?: LessonStatus } | null;
}

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

export interface Question {
  id: number;
  type: QuestionType;
  category: string;
  section: string;
  prompt: string;
  passage: string | null;
  audioText: string | null;
  audioUrl: string | null;
  options: string[] | { left: string[]; right: string[] };
  difficulty: number;
  lessonId: number | null;
}

export interface Quiz {
  id: number;
  slug: string;
  title: string;
  description: string;
  kind: string;
  passingScore: number;
  timeLimitSec: number | null;
  moduleId: number | null;
  lessonId: number | null;
  questions: Question[];
  module?: { id: number; order: number; title: string } | null;
  lesson?: { id: number; title: string } | null;
}

export interface QuizListItem {
  id: number;
  slug: string;
  title: string;
  description: string;
  kind: string;
  passingScore: number;
  timeLimitSec: number | null;
  moduleId: number | null;
  questionCount: number;
  attempts: number;
  best: number | null;
  passed: boolean;
  lastAttemptId: string | null;
}

export interface Feedback {
  matched: string[];
  missing: string[];
  ratio: number;
}

export interface AttemptResult {
  question: Question;
  answer: string;
  correct: boolean;
  expected: string;
  feedback?: Feedback;
  explanation: string;
}

export interface Attempt {
  id: string;
  title: string;
  kind: string;
  correct: number;
  total: number;
  percent: number;
  passed: boolean;
  durationSec: number;
  createdAt: string;
  passingScore: number;
  sectionScores: Record<string, { correct: number; total: number }>;
  results: AttemptResult[];
  weakCategories: { category: string; correct: number; total: number; accuracy: number }[];
  recommendedLessons: { id: number; slug: string; title: string }[];
  quiz: { id: number; slug: string; kind: string; passingScore: number; moduleId: number | null; lessonId: number | null } | null;
}

export interface Achievement {
  code: string;
  title: string;
  titleEn: string;
  description: string;
  icon: string;
  unlockedAt?: string | null;
}

export interface ReviewCard {
  id: number;
  key: string;
  itemType: 'vocab' | 'kanji' | 'grammar' | 'kana';
  itemId: number;
  state: string;
  dueAt: string;
  intervalDays: number;
  front: string;
  reading: string;
  romaji: string;
  meaning: string;
  meaningEn: string;
  extra: string;
  example: string;
  exampleMn: string;
  speak: string;
  preview?: Record<'again' | 'hard' | 'good' | 'easy', number>;
}

export interface StoryToken {
  s: string;
  r?: string;
  ro?: string;
  vocabId?: number;
  gloss?: string;
}

export interface StoryDetail {
  id: number;
  slug: string;
  title: string;
  titleJa: string;
  topic: string;
  summary: string;
  sentences: { tokens: StoryToken[]; mn: string }[];
  grammarNotes: { point: string; explanation: string }[];
  vocabulary: { id: number; word: string; kana: string; romaji: string; meaning: string; meaningEn: string; partOfSpeech: string }[];
  kanji: { id: number; char: string; meaning: string; onyomi: string; kunyomi: string }[];
  quizId: number | null;
  completed: boolean;
  lesson: { id: number; title: string } | null;
}

export interface ScriptLine {
  speaker: string;
  ja: string;
  mn: string;
}

// ───────────── daily program ─────────────

export type StepKind = 'review' | 'kana' | 'words' | 'kanji' | 'grammar' | 'dialogue' | 'reading' | 'listening' | 'speaking' | 'game' | 'quiz';

export interface DayStepSummary {
  key: string;
  kind: StepKind;
  title: string;
  minutes: number;
  optional: boolean;
  done: boolean;
  score: number | null;
}

export interface DaySummary {
  id: number;
  number: number;
  slug: string;
  level: string;
  unit: number;
  unitTitle: string;
  unitTitleJa: string;
  title: string;
  titleJa: string;
  goal: string;
  kind: 'kana' | 'lesson' | 'review' | 'exam';
  ready: boolean;
  outline: string[];
  minutes: number;
  stepsTotal: number;
  stepsDone: number;
  completed: boolean;
  completedOn: string | null;
  started: boolean;
  xp: number;
  steps: DayStepSummary[];
}

export interface Sentence {
  ja: string;
  mn: string;
  speaker?: string;
}

export interface StepContent {
  key: string;
  kind: StepKind;
  title: string;
  minutes: number;
  optional?: boolean;
  kanaIds?: number[];
  vocabIds?: number[];
  kanjiIds?: number[];
  grammarIds?: number[];
  storyId?: number;
  passages?: string[];
  sentences?: Sentence[];
  listeningIds?: number[];
  speakingId?: number;
  questions?: Question[];
  game?: 'sudoku' | 'match';
  sudoku?: { size: 4 | 6 | 9; symbols: string[]; hints: string[] };
}

export interface ListeningItem {
  id: number;
  slug: string;
  title: string;
  type: string;
  context: string;
  script: ScriptLine[];
  vocabulary: { word: string; reading: string; meaning: string }[];
  grammarNote: string;
}

export interface SpeakingItem {
  id: number;
  slug: string;
  title: string;
  prompt: string;
  promptMn: string;
  hint: string;
  expected: string[];
  keywords: { ja: string; alts?: string[]; mn: string }[];
}

export interface DayContent {
  steps: StepContent[];
  kana: Kana[];
  vocab: Vocab[];
  kanji: Kanji[];
  grammar: Grammar[];
  stories: { id: number; slug: string; title: string; titleJa: string; summary: string }[];
  listening: ListeningItem[];
  speaking: SpeakingItem[];
}

export interface DayDetail {
  day: DaySummary;
  content: DayContent;
  prev: { number: number; title: string; ready: boolean } | null;
  next: { number: number; title: string; ready: boolean } | null;
}

export interface StepCompleteResult {
  xp: number;
  xpToday: number;
  dayCompleted: boolean;
  stepsDone: string[];
  nextStep: string | null;
  reviewItemsAdded: number;
  achievements: Achievement[];
}
