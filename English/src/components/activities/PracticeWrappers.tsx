// Practice activities that load their own material by id — used by the daily
// session runner and the practice pages.

import { useQuery } from '@tanstack/react-query';
import type { ListeningMaterial, PronunciationTopic, ReadingMaterial, SpeakingTask, WritingTask } from '@shared/contentSchema';
import { get, post } from '../../lib/api';
import { useToast } from '../../lib/context';
import type { ActivityResult, QuestionDTO } from '../../lib/types';
import { ErrorState, Spinner } from '../ui';
import { ListeningActivity } from './Listening';
import { ReadingActivity } from './Reading';
import { SpeakingActivity } from './Speaking';
import { WritingActivity } from './Writing';
import { PronunciationActivity } from './Shadowing';

type ListeningPayload = { material: Omit<ListeningMaterial, 'gist' | 'detail'> & { id: string; level: string; gist: QuestionDTO[]; detail: QuestionDTO[] }; rate: number };
type ReadingPayload = { material: Omit<ReadingMaterial, 'questions'> & { id: string; level: string; questions: QuestionDTO[] } };

export function ListeningPractice({ id, onDone }: { id: string; onDone: (score: number) => void }) {
  const q = useQuery({ queryKey: ['practice-listening', id], queryFn: () => get<ListeningPayload>(`/practice/listening/${id}`) });
  const { reward } = useToast();
  const started = Date.now();
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const m = q.data.material;
  return (
    <ListeningActivity
      material={m}
      gist={m.gist}
      detail={m.detail}
      rate={q.data.rate}
      context={{ type: 'listening_practice', id }}
      onComplete={async (r) => {
        try {
          reward(await post<ActivityResult>('/activity', { type: 'listening', ref: id, skill: 'listening', score: r.score, level: m.level, minutes: Math.min(30, (Date.now() - started) / 60000) }));
        } catch {
          /* not critical */
        }
        onDone(r.score);
      }}
    />
  );
}

export function ReadingPractice({ id, onDone }: { id: string; onDone: (score: number) => void }) {
  const q = useQuery({ queryKey: ['practice-reading', id], queryFn: () => get<ReadingPayload>(`/practice/reading/${id}`) });
  const { reward } = useToast();
  const started = Date.now();
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const m = q.data.material;
  return (
    <ReadingActivity
      material={m}
      questions={m.questions}
      context={{ type: 'reading_practice', id }}
      onComplete={async (r) => {
        try {
          reward(await post<ActivityResult>('/activity', { type: 'reading', ref: id, skill: 'reading', score: r.score, level: m.level, minutes: Math.min(40, (Date.now() - started) / 60000) }));
        } catch {
          /* not critical */
        }
        onDone(r.score);
      }}
    />
  );
}

export function SpeakingPractice({ id, onDone }: { id: string; onDone: () => void }) {
  const q = useQuery({ queryKey: ['practice-speaking', id], queryFn: () => get<{ task: SpeakingTask & { id: string; level: string } }>(`/practice/speaking/${id}`) });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <SpeakingActivity task={q.data.task} context="practice" onComplete={onDone} />;
}

export function WritingPractice({ id, onDone }: { id: string; onDone: () => void }) {
  const q = useQuery({ queryKey: ['practice-writing', id], queryFn: () => get<{ task: WritingTask & { id: string; level: string } }>(`/practice/writing/${id}`) });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <WritingActivity task={q.data.task} context="practice" onComplete={onDone} />;
}

export function PronunciationPractice({ id, onDone }: { id: string; onDone: () => void }) {
  const q = useQuery({ queryKey: ['practice-pron', id], queryFn: () => get<{ topic: PronunciationTopic & { id: string } }>(`/practice/pronunciation/${id}`) });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <PronunciationActivity topic={q.data.topic} onComplete={onDone} />;
}
