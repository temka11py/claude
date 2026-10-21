import { useState, type ReactNode } from 'react';
import { post } from '../../api/client';
import type { Attempt, Question, Quiz } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import { EmptyState, ErrorState, Spinner } from '../ui';
import QuizEngine, { type SubmitResult } from './QuizEngine';

export const submitQuiz = (quizId: number, answers: Record<string, string>, durationSec: number) =>
  post<SubmitResult>('/quiz/submit', { quizId, answers, durationSec });

export const submitPractice = (questionIds: number[], answers: Record<string, string>, durationSec: number, kind: string, title: string) =>
  post<SubmitResult>('/quiz/submit', { questionIds, answers, durationSec, kind, title });

/** Loads a stored quiz (lesson quiz, module test, mock exam…) and runs it. */
export function QuizRunner({
  quizId,
  mode = 'paged',
  showAudio,
  disclaimer,
  onFinished,
  resultExtra,
  header,
}: {
  quizId: number;
  mode?: 'paged' | 'exam';
  showAudio?: boolean;
  disclaimer?: string;
  onFinished?: (a: Attempt) => void;
  resultExtra?: (a: Attempt) => ReactNode;
  header?: (quiz: Quiz) => ReactNode;
}) {
  const { data, error, loading, reload } = useApi<{ quiz: Quiz }>(`/quizzes/${quizId}`);
  const [run, setRun] = useState(0);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const { quiz } = data;
  return (
    <QuizEngine
      key={run}
      questions={quiz.questions}
      mode={mode}
      timeLimitSec={mode === 'exam' ? quiz.timeLimitSec : null}
      showAudio={showAudio}
      disclaimer={disclaimer}
      header={header?.(quiz)}
      submit={(answers, duration) => submitQuiz(quiz.id, answers, duration)}
      onFinished={onFinished}
      resultExtra={resultExtra}
      onRetry={() => setRun((r) => r + 1)}
    />
  );
}

/** Builds an ad-hoc practice set from the question bank. */
export function PracticeRunner({ query, kind = 'practice', title, header }: { query: string; kind?: string; title: string; header?: ReactNode }) {
  const { L } = useI18n();
  const [run, setRun] = useState(0);
  const { data, error, loading, reload } = useApi<{ questions: Question[]; available: number }>(`/quiz/practice?${query}&_=${run}`);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  if (data.questions.length === 0) return <EmptyState title={L('Асуулт олдсонгүй', 'No questions found')} body={L('Өөр сонголт хийж үзнэ үү.', 'Try a different selection.')} />;
  const ids = data.questions.map((q) => q.id);
  return (
    <QuizEngine
      key={run}
      header={header}
      questions={data.questions}
      submit={(answers, duration) => submitPractice(ids, answers, duration, kind, title)}
      onRetry={() => setRun((r) => r + 1)}
    />
  );
}
