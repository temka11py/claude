import { useQuery } from '@tanstack/react-query';
import { get, post } from '../../lib/api';
import { useToast } from '../../lib/context';
import type { ActivityResult, QuestionDTO } from '../../lib/types';
import { QuestionSequence } from '../QuestionSequence';
import { Button, EmptyState, ErrorState, Spinner } from '../ui';

export function GrammarReview({ count = 8, onComplete }: { count?: number; onComplete: (r: { score: number }) => void }) {
  const q = useQuery({ queryKey: ['grammar-review', count], queryFn: () => get<{ questions: QuestionDTO[] }>(`/practice/grammar?count=${count}`), staleTime: Infinity, gcTime: 0 });
  const { reward } = useToast();
  const started = Date.now();
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const questions = q.data?.questions ?? [];
  if (!questions.length) {
    return <EmptyState title="No grammar to review yet" body="Grammar review uses topics from lessons you have completed." action={<Button onClick={() => onComplete({ score: 0 })}>Continue</Button>} />;
  }
  return (
    <QuestionSequence
      questions={questions}
      context={{ type: 'grammar_review' }}
      finishLabel="Finish"
      onComplete={async (r) => {
        try {
          reward(await post<ActivityResult>('/activity', { type: 'grammar_review', minutes: Math.min(20, (Date.now() - started) / 60000), score: r.score, count: r.total, level: questions[0]?.level }));
        } catch {
          /* not critical */
        }
        onComplete({ score: r.score });
      }}
    />
  );
}
