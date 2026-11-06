// Authoring format for course content (content/modules/**/*.json and friends).
// The importer validates every file against these schemas before it touches
// the database, so malformed content fails loudly with a precise path.

import { z } from 'zod';

export const levelCode = z.enum(['B1', 'B1+', 'B2', 'B2+', 'C1']);
/** Levels used to tag individual items (placement covers A2–C1). */
export const itemLevel = z.enum(['A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C1+']);
export const skill = z.enum([
  'grammar',
  'vocabulary',
  'reading',
  'listening',
  'speaking',
  'writing',
  'pronunciation',
]);
export const register = z.enum(['informal', 'neutral', 'formal', 'spoken', 'academic', 'professional', 'slang']);

const text = z.string().trim().min(1);
const optText = z.string().trim().min(1).optional();

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const questionBase = {
  id: optText,
  skill: skill.optional(),
  /** Sub-skill or objective tag, e.g. "main_idea", "inference", "tone", "collocation". */
  tag: optText,
  difficulty: z.number().int().min(1).max(5).optional(),
  level: itemLevel.optional(),
  explanation: optText,
  explanationMn: optText,
};

export const mcqQuestion = z.object({
  ...questionBase,
  type: z.literal('mcq'),
  prompt: text,
  options: z.array(text).min(2).max(6),
  answer: z.number().int().min(0),
});

/** Gap fill. Use "___" in the prompt. With `options` it is a dropdown/choice, otherwise typed. */
export const gapQuestion = z.object({
  ...questionBase,
  type: z.literal('gap'),
  prompt: text.refine((p) => p.includes('___'), 'gap prompt must contain ___'),
  answers: z.array(text).min(1),
  options: z.array(text).min(2).max(6).optional(),
});

export const tfngQuestion = z.object({
  ...questionBase,
  type: z.literal('tfng'),
  prompt: text,
  answer: z.enum(['true', 'false', 'not_given']),
  /** Set to false for plain true/false questions without "not given". */
  notGiven: z.boolean().optional(),
});

/** Short free answer checked against accepted answers / keywords. */
export const shortQuestion = z.object({
  ...questionBase,
  type: z.literal('short'),
  prompt: text,
  answers: z.array(text).min(1),
  /** "exact": answer must match one accepted answer; "keywords": all keywords of one accepted answer must appear. */
  match: z.enum(['exact', 'keywords']).optional(),
});

/** Put items (sentences, paragraphs, events) in the correct order. Items are listed in the correct order. */
export const orderQuestion = z.object({
  ...questionBase,
  type: z.literal('order'),
  prompt: text,
  items: z.array(text).min(3).max(8),
});

/** Build a sentence from word tiles. */
export const wordsQuestion = z.object({
  ...questionBase,
  type: z.literal('words'),
  prompt: text,
  answer: text,
  /** Other accepted word orders. */
  alternatives: z.array(text).optional(),
  distractors: z.array(text).optional(),
});

export const matchQuestion = z.object({
  ...questionBase,
  type: z.literal('match'),
  prompt: text,
  pairs: z.array(z.tuple([text, text])).min(3).max(8),
});

/** Rewrite the incorrect sentence correctly. */
export const correctQuestion = z.object({
  ...questionBase,
  type: z.literal('correct'),
  prompt: text,
  sentence: text,
  answers: z.array(text).min(1),
});

/** Sentence transformation, optionally with a keyword that must be used. */
export const transformQuestion = z.object({
  ...questionBase,
  type: z.literal('transform'),
  prompt: text,
  sentence: text,
  keyword: optText,
  answers: z.array(text).min(1),
});

/** Tap the part of the sentence that contains the mistake. */
export const errorQuestion = z.object({
  ...questionBase,
  type: z.literal('error'),
  prompt: text,
  segments: z.array(text).min(2).max(8),
  wrongIndex: z.number().int().min(0),
  correction: text,
});

/** Summary/gapped text completion with a word bank. Gaps are written {1}, {2}, ... */
export const summaryQuestion = z.object({
  ...questionBase,
  type: z.literal('summary'),
  prompt: text,
  text: text,
  bank: z.array(text).min(2),
  answers: z.array(text).min(1),
});

export const question = z
  .discriminatedUnion('type', [
    mcqQuestion,
    gapQuestion,
    tfngQuestion,
    shortQuestion,
    orderQuestion,
    wordsQuestion,
    matchQuestion,
    correctQuestion,
    transformQuestion,
    errorQuestion,
    summaryQuestion,
  ])
  .superRefine((q, ctx) => {
    if (q.type === 'mcq' && q.answer >= q.options.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'mcq answer index out of range', path: ['answer'] });
    }
    if (q.type === 'error' && q.wrongIndex >= q.segments.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'wrongIndex out of range', path: ['wrongIndex'] });
    }
    if (q.type === 'summary') {
      const gaps = q.text.match(/\{\d+\}/g) ?? [];
      if (gaps.length !== q.answers.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'summary gaps and answers differ in number', path: ['answers'] });
      }
      for (const a of q.answers) {
        if (!q.bank.includes(a)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `summary answer "${a}" is missing from bank`, path: ['bank'] });
        }
      }
    }
    if (q.type === 'gap' && q.options) {
      const opts = q.options.map((o) => o.toLowerCase());
      if (!q.answers.some((a) => opts.includes(a.toLowerCase()))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'gap options must include an accepted answer', path: ['options'] });
      }
    }
  });

export type Question = z.infer<typeof question>;
export type QuestionType = Question['type'];

// ---------------------------------------------------------------------------
// Vocabulary, phrases, grammar, pronunciation
// ---------------------------------------------------------------------------

export const vocabEntry = z.object({
  word: text,
  pos: text,
  ipa: optText,
  definition: text,
  /** Mongolian translation. */
  mn: text,
  /** At least one natural example sentence that contains the word. */
  examples: z.array(text).min(1).max(4),
  collocations: z.array(text).default([]),
  synonyms: z.array(text).default([]),
  antonyms: z.array(text).default([]),
  /** Common learner mistake with this word. */
  mistake: optText,
  /** Usage / register note: when the word is natural to use. */
  note: optText,
  level: itemLevel,
  difficulty: z.number().int().min(1).max(5).default(3),
});
export type VocabEntry = z.infer<typeof vocabEntry>;

/** Real-life phrases, discourse markers, idioms, phrasal verbs. */
export const phraseEntry = z.object({
  phrase: text,
  meaning: text,
  mn: optText,
  register: register,
  /** When the phrase is natural to use — and when it is not. */
  whenToUse: text,
  example: text,
});
export type PhraseEntry = z.infer<typeof phraseEntry>;

export const grammarTopic = z.object({
  id: text,
  title: text,
  level: itemLevel,
  /** One or two sentences in simple English. */
  summary: text,
  summaryMn: optText,
  structure: z.array(text).min(1),
  usage: z.array(z.object({ use: text, example: text, useMn: optText })).min(1),
  examples: z.array(z.object({ en: text, note: optText })).min(2),
  contrast: z
    .object({
      with: text,
      pairs: z.array(z.object({ a: text, b: text, why: text, whyMn: optText })).min(1),
    })
    .optional(),
  mistakes: z.array(z.object({ wrong: text, right: text, why: text, whyMn: optText })).min(1),
  /** Guided practice (recognition). */
  guided: z.array(question).min(3),
  /** Free practice (production). */
  free: z.array(question).min(2),
  prerequisites: z.array(text).default([]),
});
export type GrammarTopic = z.infer<typeof grammarTopic>;

export const pronunciationTopic = z.object({
  id: text,
  title: text,
  category: z.enum([
    'sounds',
    'word_stress',
    'sentence_stress',
    'intonation',
    'connected_speech',
    'contractions',
    'weak_forms',
  ]),
  explanation: text,
  explanationMn: optText,
  items: z
    .array(
      z.object({
        /** What to show, e.g. "PHO-to-graph" or "ship /ɪ/ vs sheep /iː/". */
        display: text,
        /** Plain text the speech engine reads aloud. */
        say: text,
        tip: optText,
      }),
    )
    .min(3),
  shadowing: z
    .array(
      z.object({
        text: text,
        /** Same sentence with stressed syllables in CAPITALS. */
        stress: text,
        tip: optText,
        difficult: z.array(text).default([]),
      }),
    )
    .min(2),
  /** Written vs natural spoken forms (e.g. going to → gonna). */
  spokenForms: z.array(z.object({ written: text, spoken: text, note: text })).default([]),
});
export type PronunciationTopic = z.infer<typeof pronunciationTopic>;

// ---------------------------------------------------------------------------
// Skills materials
// ---------------------------------------------------------------------------

export const readingMaterial = z.object({
  id: text,
  title: text,
  genre: z.enum([
    'article',
    'blog',
    'opinion',
    'news',
    'academic',
    'email',
    'story',
    'report',
    'editorial',
    'review',
    'interview',
    'guide',
    'letter',
  ]),
  /** Paragraphs. */
  text: z.array(text).min(2),
  source: optText,
  glossary: z.array(z.object({ term: text, meaning: text, mn: optText })).default([]),
  questions: z.array(question).min(3),
});
export type ReadingMaterial = z.infer<typeof readingMaterial>;

export const listeningMaterial = z
  .object({
    id: text,
    title: text,
    kind: z.enum([
      'conversation',
      'monologue',
      'interview',
      'podcast',
      'lecture',
      'debate',
      'announcement',
      'voicemail',
      'news',
      'meeting',
    ]),
    /** One sentence setting the scene, shown before listening. */
    context: text,
    speakers: z
      .array(
        z.object({
          name: text,
          voice: z.enum(['female', 'male']),
          accent: z.enum(['en-GB', 'en-US', 'en-AU', 'en-IE', 'en-IN', 'en-CA']).default('en-GB'),
        }),
      )
      .min(1),
    lines: z.array(z.object({ speaker: text, text: text })).min(2),
    /** First listen: general understanding. */
    gist: z.array(question).min(1),
    /** Second listen: detail. */
    detail: z.array(question).min(2),
    /** Third listen: expressions to notice in the transcript. */
    expressions: z.array(z.object({ phrase: text, meaning: text, mn: optText })).default([]),
  })
  .superRefine((m, ctx) => {
    const names = new Set(m.speakers.map((s) => s.name));
    m.lines.forEach((line, i) => {
      if (!names.has(line.speaker)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown speaker "${line.speaker}"`, path: ['lines', i] });
      }
    });
  });
export type ListeningMaterial = z.infer<typeof listeningMaterial>;

export const speakingTask = z.object({
  id: text,
  type: z.enum(['describe', 'opinion', 'story', 'roleplay', 'discussion', 'presentation', 'debate', 'compare']),
  prompt: text,
  promptMn: optText,
  /** Points to cover. */
  points: z.array(text).default([]),
  /** Useful phrases for this task. */
  phrases: z.array(text).default([]),
  /** Words the learner should try to use; defaults to the lesson vocabulary. */
  targetWords: z.array(text).default([]),
  prepSeconds: z.number().int().min(0).max(300).default(30),
  speakSeconds: z.number().int().min(20).max(600).default(90),
  /** A model answer the learner can compare with. */
  sample: text,
});
export type SpeakingTask = z.infer<typeof speakingTask>;

export const writingTask = z.object({
  id: text,
  type: z.enum([
    'message',
    'email_informal',
    'email_formal',
    'paragraph',
    'description',
    'story',
    'review',
    'essay_opinion',
    'essay_argument',
    'report',
    'summary',
    'letter_formal',
    'proposal',
    'synthesis',
    'article',
  ]),
  prompt: text,
  promptMn: optText,
  register: register,
  minWords: z.number().int().min(10),
  maxWords: z.number().int().min(20),
  points: z.array(text).default([]),
  phrases: z.array(text).default([]),
  targetWords: z.array(text).default([]),
  sample: text,
});
export type WritingTask = z.infer<typeof writingTask>;

// ---------------------------------------------------------------------------
// Lessons & modules
// ---------------------------------------------------------------------------

export const lessonFocus = z.enum(['vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'pronunciation']);

export const lesson = z.object({
  id: text,
  title: text,
  focus: lessonFocus,
  difficulty: z.number().int().min(1).max(10),
  minutes: z.number().int().min(5).max(90),
  /** "By the end of this lesson you will be able to ..." — 2 to 4 objectives. */
  objectives: z.array(text).min(2).max(4),
  warmup: z.object({ intro: text, questions: z.array(question).min(1).max(4) }),
  vocabulary: z.array(vocabEntry).max(15).default([]),
  phrases: z.array(phraseEntry).default([]),
  /** Id of a grammar topic defined in the module's `grammar` list. */
  grammar: optText,
  /** Id of a pronunciation topic defined in the module's `pronunciation` list. */
  pronunciation: optText,
  reading: readingMaterial.optional(),
  listening: listeningMaterial.optional(),
  speaking: speakingTask.optional(),
  writing: writingTask.optional(),
  /** End-of-lesson questions (vocabulary questions are also generated automatically). */
  quiz: z.array(question).default([]),
});
export type Lesson = z.infer<typeof lesson>;

export const moduleTest = z.object({
  reading: readingMaterial,
  listening: listeningMaterial,
  writing: writingTask,
  speaking: speakingTask,
  /** Unseen grammar and vocabulary items used only in the test. */
  questions: z.array(question).min(6),
});
export type ModuleTest = z.infer<typeof moduleTest>;

export const moduleDoc = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'module id must be kebab-case'),
    level: levelCode,
    order: z.number().int().min(1),
    title: text,
    topic: text,
    description: text,
    descriptionMn: optText,
    /** Module objectives, each linked to the skills that show whether it was achieved in the module test. */
    objectives: z.array(z.object({ text: text, skills: z.array(skill).min(1) })).min(2).max(8),
    targets: z.object({
      grammar: z.array(text).default([]),
      vocabulary: z.array(text).default([]),
      reading: optText,
      listening: optText,
      speaking: optText,
      writing: optText,
      pronunciation: optText,
    }),
    status: z.enum(['draft', 'published']).default('published'),
    grammar: z.array(grammarTopic).default([]),
    pronunciation: z.array(pronunciationTopic).default([]),
    lessons: z.array(lesson).min(1),
    test: moduleTest.optional(),
  })
  .superRefine((m, ctx) => {
    const grammarIds = new Set(m.grammar.map((g) => g.id));
    const pronIds = new Set(m.pronunciation.map((p) => p.id));
    const lessonIds = new Set<string>();
    m.lessons.forEach((l, i) => {
      if (lessonIds.has(l.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate lesson id ${l.id}`, path: ['lessons', i, 'id'] });
      lessonIds.add(l.id);
      if (!l.id.startsWith(`${m.id}-`)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `lesson id must start with "${m.id}-"`, path: ['lessons', i, 'id'] });
      }
      if (l.grammar && !grammarIds.has(l.grammar)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown grammar topic ${l.grammar}`, path: ['lessons', i, 'grammar'] });
      }
      if (l.pronunciation && !pronIds.has(l.pronunciation)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown pronunciation topic ${l.pronunciation}`, path: ['lessons', i, 'pronunciation'] });
      }
    });
  });
export type ModuleDoc = z.infer<typeof moduleDoc>;

// ---------------------------------------------------------------------------
// Levels, exams, placement, scenarios
// ---------------------------------------------------------------------------

export const levelsDoc = z.object({
  levels: z
    .array(
      z.object({
        code: levelCode,
        title: text,
        description: text,
        descriptionMn: optText,
        canDo: z.array(text).min(3),
      }),
    )
    .length(5),
  /** Outline of every planned module, including ones whose full content is not written yet. */
  outline: z
    .array(
      z.object({
        id: text,
        level: levelCode,
        order: z.number().int().min(1),
        title: text,
        topic: text,
        description: text,
        grammar: z.array(text).default([]),
        vocabulary: z.array(text).default([]),
      }),
    )
    .default([]),
});
export type LevelsDoc = z.infer<typeof levelsDoc>;

export const levelExamDoc = z.object({
  level: levelCode,
  title: text,
  reading: z.array(readingMaterial).min(1),
  listening: z.array(listeningMaterial).min(1),
  writing: writingTask,
  speaking: speakingTask,
  questions: z.array(question).min(10),
});
export type LevelExamDoc = z.infer<typeof levelExamDoc>;

export const placementDoc = z.object({
  grammar: z.array(question).min(20),
  vocabulary: z.array(question).min(20),
  reading: z.array(readingMaterial.extend({ level: itemLevel })).min(2),
  listening: z.array(listeningMaterial.and(z.object({ level: itemLevel }))).min(2),
  writing: writingTask,
  speaking: speakingTask,
});
export type PlacementDoc = z.infer<typeof placementDoc>;

export const scenarioDoc = z.object({
  scenarios: z
    .array(
      z.object({
        id: text,
        title: text,
        minLevel: levelCode,
        category: text,
        description: text,
        /** The role the AI (or guided script) plays. */
        partnerRole: text,
        learnerGoal: text,
        opening: text,
        /** Scripted prompts used in guided mode when AI is unavailable. */
        guidedTurns: z.array(z.object({ prompt: text, hint: optText, sample: text })).min(3),
        phrases: z.array(text).min(3),
      }),
    )
    .min(1),
});
export type ScenarioDoc = z.infer<typeof scenarioDoc>;
