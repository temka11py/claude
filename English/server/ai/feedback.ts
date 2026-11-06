// Writing and speaking feedback: AI-powered when available, rule-based otherwise.
// Rule-based feedback is labelled as automatic and never claims precision it
// doesn't have (e.g. pronunciation can't be judged from a transcript).

import * as z4 from 'zod/v4';
import { analyzeWriting, estimateWritingScore, type WritingAnalysis, type WritingIssue } from '@shared/writingChecker';
import { findWordForm, wordCount, words } from '@shared/text';
import type { AIProvider } from './provider';

export const CORRECTION_CATEGORIES = ['grammar', 'vocabulary', 'spelling', 'word_choice', 'collocation', 'sentence_structure', 'register', 'punctuation', 'coherence'] as const;

const correctionSchema = z4.object({
  original: z4.string().describe('The learner\'s original sentence or phrase, copied exactly'),
  improved: z4.string().describe('The corrected or improved version'),
  explanation: z4.string().describe('Why, in simple English at the learner\'s level'),
  explanationMn: z4.string().describe('The same explanation in Mongolian (Cyrillic), or an empty string if Mongolian is not wanted'),
  category: z4.enum(CORRECTION_CATEGORIES),
});

const writingSchema = z4.object({
  score: z4.number().describe('Overall 0-100 for this task at the target level'),
  levelEstimate: z4.string().describe('Rough CEFR band of this text, e.g. "B1" or "B1+/B2"'),
  summary: z4.string().describe('Two or three encouraging sentences summarising the feedback'),
  strengths: z4.array(z4.string()).describe('What the learner did well (2-4 items)'),
  improvements: z4.array(z4.string()).describe('The most important things to improve (2-4 items)'),
  corrections: z4.array(correctionSchema).describe('Up to 8 of the most useful corrections'),
  betterVersion: z4.string().describe('An improved version of the whole text at a slightly higher level, keeping the learner\'s ideas'),
  usefulVocabulary: z4.array(z4.object({ phrase: z4.string(), meaning: z4.string() })).describe('3-6 words or phrases that would lift the text'),
  criteria: z4.object({
    taskAchievement: z4.number().describe('1-5'),
    grammar: z4.number().describe('1-5'),
    vocabulary: z4.number().describe('1-5'),
    coherence: z4.number().describe('1-5: organisation and linking'),
    register: z4.number().describe('1-5: appropriate formality'),
  }),
});
export type AIWritingFeedback = z4.infer<typeof writingSchema>;

const speakingSchema = z4.object({
  score: z4.number().describe('Overall 0-100 for this task at the target level, judged from the transcript'),
  levelEstimate: z4.string(),
  summary: z4.string(),
  strengths: z4.array(z4.string()),
  improvements: z4.array(z4.string()),
  corrections: z4.array(correctionSchema).describe('Up to 6 corrections of grammar, word choice or phrasing'),
  betterVersion: z4.string().describe('A more natural version of what the learner said, at a slightly higher level'),
  usefulVocabulary: z4.array(z4.object({ phrase: z4.string(), meaning: z4.string() })),
  fluencyNote: z4.string().describe('Comment on fillers, repetition and length, based only on the transcript'),
  pronunciationNote: z4.string().describe('Only mention words that the speech recogniser clearly got wrong (which may suggest pronunciation difficulty). Say plainly that pronunciation cannot be judged precisely from a transcript.'),
  criteria: z4.object({
    taskAchievement: z4.number().describe('1-5'),
    grammar: z4.number().describe('1-5'),
    vocabulary: z4.number().describe('1-5'),
    fluency: z4.number().describe('1-5, from transcript length, fillers and repetition'),
    coherence: z4.number().describe('1-5'),
  }),
});
export type AISpeakingFeedback = z4.infer<typeof speakingSchema>;

export interface LearnerContext {
  level: string;
  explanationLanguage: 'en' | 'mn' | 'mixed';
}

function learnerLine(ctx: LearnerContext): string {
  const mn =
    ctx.explanationLanguage === 'en'
      ? 'Leave explanationMn empty.'
      : 'Also give each explanation in Mongolian (Cyrillic) in explanationMn.';
  return `The learner is an adult native speaker of Mongolian studying English at about ${ctx.level} level. Be warm, specific and honest. Never say "you failed"; prefer "not quite yet". Keep explanations short and simple. ${mn}`;
}

export interface WritingTaskInfo {
  prompt: string;
  type: string;
  register: string;
  minWords: number;
  maxWords: number;
  targetWords: string[];
  level: string;
}

export interface WritingFeedback {
  source: 'ai' | 'automatic';
  score: number;
  levelEstimate: string | null;
  summary: string;
  strengths: string[];
  improvements: string[];
  corrections: { original: string; improved: string; explanation: string; explanationMn?: string; category: string }[];
  betterVersion: string | null;
  usefulVocabulary: { phrase: string; meaning: string }[];
  criteria: Record<string, number> | null;
  analysis: WritingAnalysis;
  note: string | null;
}

function automaticWriting(text: string, task: WritingTaskInfo, analysis: WritingAnalysis): WritingFeedback {
  const score = estimateWritingScore(analysis, { minWords: task.minWords, targetCount: task.targetWords.length });
  const strengths: string[] = [];
  const improvements: string[] = [];
  if (analysis.lengthStatus === 'ok') strengths.push(`Good length: ${analysis.wordCount} words (target ${task.minWords}–${task.maxWords}).`);
  if (analysis.lengthStatus === 'too_short') improvements.push(`Write a little more: ${analysis.wordCount} words, the task asks for at least ${task.minWords}.`);
  if (analysis.lengthStatus === 'too_long') improvements.push(`Try to be more concise: the task asks for about ${task.maxWords} words.`);
  if (analysis.linkersUsed.length >= 3) strengths.push(`You connected your ideas with linkers: ${analysis.linkersUsed.map((l) => `“${l.phrase}”`).join(', ')}.`);
  else improvements.push('Use more linking words to connect ideas (however, because, as a result, for example).');
  if (analysis.targetWordsUsed.length) strengths.push(`You used new vocabulary: ${analysis.targetWordsUsed.join(', ')}.`);
  if (analysis.targetWordsMissing.length) improvements.push(`Try to include: ${analysis.targetWordsMissing.slice(0, 4).join(', ')}.`);
  if (analysis.repeatedWords.length) improvements.push(`Some words are repeated a lot (${analysis.repeatedWords.map((r) => `${r.word} ×${r.count}`).join(', ')}). Try synonyms.`);
  if (analysis.longSentences.length) improvements.push('Some sentences are very long. Split them to make your writing clearer.');
  if (!analysis.issues.length) strengths.push('No common learner errors were detected by the automatic checker.');
  return {
    source: 'automatic',
    score,
    levelEstimate: null,
    summary: analysis.issues.length
      ? `The automatic checker found ${analysis.issues.length} thing${analysis.issues.length === 1 ? '' : 's'} to look at. Read each correction and why it is better.`
      : 'The automatic checker did not find common errors. Compare your text with the model answer for ideas on style and range.',
    strengths,
    improvements,
    corrections: analysis.issues.slice(0, 12).map((i: WritingIssue) => ({
      original: i.sentence,
      improved: i.improvedSentence,
      explanation: i.explanation,
      explanationMn: i.explanationMn,
      category: i.category,
    })),
    betterVersion: null,
    usefulVocabulary: [],
    criteria: null,
    analysis,
    note: 'Automatic feedback: this checks length, linking, vocabulary use and frequent learner errors. It cannot judge every grammar or style issue. Add an AI key for detailed feedback.',
  };
}

export async function writingFeedback(ai: AIProvider, text: string, task: WritingTaskInfo, learner: LearnerContext): Promise<WritingFeedback> {
  const analysis = analyzeWriting(text, { register: task.register, minWords: task.minWords, maxWords: task.maxWords, targetWords: task.targetWords });
  if (!ai.available || wordCount(text) < 5) return automaticWriting(text, task, analysis);
  try {
    const fb = await ai.structured({
      schema: writingSchema,
      effort: 'medium',
      system: `You are an experienced English writing teacher and CEFR examiner. ${learnerLine(learner)}
Assess the text for grammar, vocabulary, coherence, cohesion, sentence structure, register, word choice and repetition.
Show corrections as original sentence → improved sentence and explain why. Judge against the task's target level (${task.level}), not against a native speaker.`,
      messages: [
        {
          role: 'user',
          content: `TASK (${task.type}, register: ${task.register}, ${task.minWords}-${task.maxWords} words):\n${task.prompt}\n\nTarget words to use: ${task.targetWords.join(', ') || 'none'}\n\nLEARNER'S TEXT (${analysis.wordCount} words):\n"""\n${text}\n"""`,
        },
      ],
    });
    return {
      source: 'ai',
      score: Math.round(Math.max(0, Math.min(100, fb.score))),
      levelEstimate: fb.levelEstimate,
      summary: fb.summary,
      strengths: fb.strengths,
      improvements: fb.improvements,
      corrections: fb.corrections.map((c) => ({ ...c, explanationMn: c.explanationMn || undefined })),
      betterVersion: fb.betterVersion,
      usefulVocabulary: fb.usefulVocabulary,
      criteria: fb.criteria,
      analysis,
      note: null,
    };
  } catch (err) {
    const auto = automaticWriting(text, task, analysis);
    return { ...auto, note: `AI feedback was not available (${(err as Error).message}). Showing automatic feedback instead.` };
  }
}

export interface SpeakingTaskInfo {
  prompt: string;
  type: string;
  points: string[];
  targetWords: string[];
  speakSeconds: number;
  level: string;
}

export interface SpeakingFeedback {
  source: 'ai' | 'automatic' | 'self';
  score: number | null;
  levelEstimate: string | null;
  summary: string;
  strengths: string[];
  improvements: string[];
  corrections: { original: string; improved: string; explanation: string; explanationMn?: string; category: string }[];
  betterVersion: string | null;
  usefulVocabulary: { phrase: string; meaning: string }[];
  criteria: Record<string, number> | null;
  fluencyNote: string | null;
  pronunciationNote: string | null;
  stats: { words: number; wordsPerMinute: number | null; fillers: { word: string; count: number }[]; targetWordsUsed: string[]; repeated: { word: string; count: number }[] } | null;
  note: string | null;
}

const FILLERS = ['um', 'uh', 'erm', 'er', 'like', 'you know', 'i mean', 'kind of', 'sort of', 'basically', 'actually'];

export function transcriptStats(transcript: string, durationSec: number | null, targetWords: string[]) {
  const ws = words(transcript);
  const lower = ` ${transcript.toLowerCase()} `;
  const fillers = FILLERS.map((f) => ({ word: f, count: (lower.match(new RegExp(`[^a-z]${f}[^a-z]`, 'g')) ?? []).length })).filter((f) => f.count > 0);
  const counts = new Map<string, number>();
  for (const w of ws) if (w.length > 3) counts.set(w, (counts.get(w) ?? 0) + 1);
  return {
    words: ws.length,
    wordsPerMinute: durationSec && durationSec > 5 ? Math.round((ws.length / durationSec) * 60) : null,
    fillers,
    targetWordsUsed: targetWords.filter((t) => findWordForm(transcript, t)),
    repeated: [...counts.entries()].filter(([, c]) => c >= 4).map(([word, count]) => ({ word, count })).slice(0, 5),
  };
}

export async function speakingFeedback(
  ai: AIProvider,
  input: { transcript: string | null; durationSec: number | null; selfRating?: number | null },
  task: SpeakingTaskInfo,
  learner: LearnerContext,
): Promise<SpeakingFeedback> {
  const transcript = input.transcript?.trim() || null;
  if (!transcript) {
    return {
      source: 'self',
      score: input.selfRating != null ? Math.round(input.selfRating * 100) : null,
      levelEstimate: null,
      summary: 'Your recording is saved. No transcript was available (speech recognition is not supported in this browser or was switched off), so listen back and rate yourself with the checklist.',
      strengths: [],
      improvements: [],
      corrections: [],
      betterVersion: null,
      usefulVocabulary: [],
      criteria: null,
      fluencyNote: null,
      pronunciationNote: null,
      stats: null,
      note: 'Self-assessed: no automatic judgement of your speaking was made.',
    };
  }
  const stats = transcriptStats(transcript, input.durationSec, task.targetWords);
  if (ai.available && stats.words >= 8) {
    try {
      const fb = await ai.structured({
        schema: speakingSchema,
        effort: 'medium',
        system: `You are an experienced English speaking coach and CEFR examiner. ${learnerLine(learner)}
You receive an automatic speech-recognition transcript of the learner's spoken answer, so punctuation is unreliable and recognition errors are possible. Evaluate grammar, vocabulary, fluency, coherence, word choice, repetition and filler words from the transcript only. Do not invent precise pronunciation scores. Judge against the target level (${task.level}).`,
        messages: [
          {
            role: 'user',
            content: `TASK (${task.type}): ${task.prompt}\nPoints to cover: ${task.points.join('; ') || '—'}\nTarget words: ${task.targetWords.join(', ') || '—'}\nSpeaking time: ${input.durationSec ? Math.round(input.durationSec) : 'unknown'} seconds (target ${task.speakSeconds}s)\n\nTRANSCRIPT:\n"""\n${transcript}\n"""`,
          },
        ],
      });
      return {
        source: 'ai',
        score: Math.round(Math.max(0, Math.min(100, fb.score))),
        levelEstimate: fb.levelEstimate,
        summary: fb.summary,
        strengths: fb.strengths,
        improvements: fb.improvements,
        corrections: fb.corrections.map((c) => ({ ...c, explanationMn: c.explanationMn || undefined })),
        betterVersion: fb.betterVersion,
        usefulVocabulary: fb.usefulVocabulary,
        criteria: fb.criteria,
        fluencyNote: fb.fluencyNote,
        pronunciationNote: fb.pronunciationNote,
        stats,
        note: null,
      };
    } catch (err) {
      return { ...automaticSpeaking(transcript, input, task, stats), note: `AI feedback was not available (${(err as Error).message}). Showing automatic feedback instead.` };
    }
  }
  return automaticSpeaking(transcript, input, task, stats);
}

function automaticSpeaking(
  transcript: string,
  input: { durationSec: number | null; selfRating?: number | null },
  task: SpeakingTaskInfo,
  stats: NonNullable<SpeakingFeedback['stats']>,
): SpeakingFeedback {
  const analysis = analyzeWriting(transcript, {});
  const grammarIssues = analysis.issues.filter((i) => !['punctuation', 'spelling'].includes(i.category));
  const strengths: string[] = [];
  const improvements: string[] = [];
  const duration = input.durationSec ?? 0;
  if (duration >= task.speakSeconds * 0.7) strengths.push(`You kept speaking for ${Math.round(duration)} seconds.`);
  else if (duration) improvements.push(`Try to speak for longer — about ${task.speakSeconds} seconds. Add examples and reasons.`);
  if (stats.targetWordsUsed.length) strengths.push(`You used target words: ${stats.targetWordsUsed.join(', ')}.`);
  const missing = task.targetWords.filter((w) => !stats.targetWordsUsed.includes(w));
  if (missing.length) improvements.push(`Next time, try to use: ${missing.slice(0, 4).join(', ')}.`);
  const fillerTotal = stats.fillers.reduce((a, f) => a + f.count, 0);
  if (fillerTotal >= 4) improvements.push(`You used filler words ${fillerTotal} times (${stats.fillers.map((f) => f.word).join(', ')}). A short pause is better than "um".`);
  if (stats.repeated.length) improvements.push(`Some words were repeated often: ${stats.repeated.map((r) => r.word).join(', ')}.`);
  if (stats.wordsPerMinute && stats.wordsPerMinute >= 90) strengths.push(`Good pace: about ${stats.wordsPerMinute} words per minute.`);
  const lengthScore = Math.min(1, duration / Math.max(20, task.speakSeconds));
  const targetScore = task.targetWords.length ? Math.min(1, stats.targetWordsUsed.length / Math.min(3, task.targetWords.length)) : 0.7;
  const accuracy = Math.max(0, 1 - grammarIssues.length / Math.max(3, stats.words / 12));
  const auto = Math.round((lengthScore * 0.35 + targetScore * 0.25 + accuracy * 0.4) * 100);
  const score = input.selfRating != null ? Math.round(auto * 0.6 + input.selfRating * 100 * 0.4) : auto;
  return {
    source: 'automatic',
    score,
    levelEstimate: null,
    summary: 'Here is automatic feedback based on the transcript of your recording. Listen to your recording and compare it with the model answer.',
    strengths,
    improvements,
    corrections: grammarIssues.slice(0, 6).map((i) => ({ original: i.sentence, improved: i.improvedSentence, explanation: i.explanation, explanationMn: i.explanationMn, category: i.category })),
    betterVersion: null,
    usefulVocabulary: [],
    criteria: null,
    fluencyNote: `${stats.words} words${stats.wordsPerMinute ? `, about ${stats.wordsPerMinute} words per minute` : ''}${fillerTotal ? `, ${fillerTotal} filler words` : ''}.`,
    pronunciationNote: 'Pronunciation is not scored: a transcript cannot show it reliably. If the transcript shows words you did not say, those words may need clearer pronunciation.',
    stats,
    note: 'Automatic feedback from the transcript. Add an AI key for detailed feedback on grammar, vocabulary and coherence.',
  };
}
