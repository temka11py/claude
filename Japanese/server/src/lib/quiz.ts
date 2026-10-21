import type { Question } from '@prisma/client';
import { parseJson } from './json.js';
import { gradeAnswer, type GradeResult } from './grading.js';

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const FREE_TEXT = new Set(['typing', 'ja_to_mn', 'mn_to_ja', 'fill_blank']);

/** A question as sent to the learner — never includes the answer or keyword lists. */
export function publicQuestion(q: Question) {
  let options: unknown = parseJson<unknown>(q.options, []);
  if (q.type === 'matching') {
    const m = options as { left: string[]; right: string[] };
    options = { left: m.left, right: shuffle(m.right) };
  } else if (q.type === 'true_false') {
    options = ['true', 'false'];
  } else if (FREE_TEXT.has(q.type) && !Array.isArray(options)) {
    options = [];
  }
  return {
    id: q.id,
    type: q.type,
    category: q.category,
    section: q.section,
    prompt: q.prompt,
    passage: q.passage,
    audioText: q.audioText,
    audioUrl: q.audioUrl,
    options,
    difficulty: q.difficulty,
    lessonId: q.lessonId,
  };
}

export interface QuestionResult extends GradeResult {
  questionId: number;
  answer: string;
  explanation: string;
  category: string;
  section: string;
  lessonId: number | null;
  prompt: string;
}

export function gradeQuestions(questions: Question[], answers: Record<string, string | undefined>): QuestionResult[] {
  return questions.map((q) => {
    const answer = answers[String(q.id)] ?? '';
    const result = gradeAnswer(q, answer);
    return {
      ...result,
      questionId: q.id,
      answer,
      explanation: q.explanation,
      category: q.category,
      section: q.section || q.category,
      lessonId: q.lessonId,
      prompt: q.prompt,
    };
  });
}

export function summarize(results: QuestionResult[]) {
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const sections: Record<string, { correct: number; total: number }> = {};
  const categories: Record<string, { correct: number; total: number }> = {};
  for (const r of results) {
    sections[r.section] ??= { correct: 0, total: 0 };
    categories[r.category] ??= { correct: 0, total: 0 };
    sections[r.section].total++;
    categories[r.category].total++;
    if (r.correct) {
      sections[r.section].correct++;
      categories[r.category].correct++;
    }
  }
  return { correct, total, percent: total ? Math.round((correct / total) * 100) : 0, sections, categories };
}
