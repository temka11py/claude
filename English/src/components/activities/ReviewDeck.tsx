import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, PartyPopper, RotateCcw } from 'lucide-react';
import { get, post } from '../../lib/api';
import { postOrQueue } from '../../lib/offline';
import { useToast } from '../../lib/context';
import type { ActivityResult, ReviewItem, VocabCounts } from '../../lib/types';
import { ExerciseView, type ExerciseResult } from '../vocab/ExerciseView';
import { Button, EmptyState, ErrorState, ProgressBar, Spinner } from '../ui';

export interface ReviewSummary {
  reviewed: number;
  remembered: number;
  again: string[];
}

export function ReviewDeck({
  limit = 20,
  mode = 'mixed',
  ids,
  source = 'review',
  onComplete,
  compact,
}: {
  limit?: number;
  mode?: 'mixed' | 'flashcards';
  ids?: string[];
  source?: 'review' | 'session' | 'lesson';
  onComplete?: (s: ReviewSummary) => void;
  compact?: boolean;
}) {
  const [round, setRound] = useState(0);
  const q = useQuery({
    queryKey: ['review-queue', limit, mode, ids?.join(','), round],
    queryFn: () => get<{ items: ReviewItem[]; stats: VocabCounts }>(`/review/queue?limit=${limit}&mode=${mode}${ids?.length ? `&ids=${ids.join(',')}` : ''}`),
    staleTime: Infinity,
    gcTime: 0,
  });
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<ReviewSummary | null>(null);
  const results = useRef<{ word: string; correct: boolean }[]>([]);
  const started = useRef(Date.now());
  const { reward } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    setIndex(0);
    setDone(null);
    results.current = [];
    started.current = Date.now();
  }, [q.data]);

  if (q.isLoading) return <Spinner label="Preparing your review…" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data?.items ?? [];

  if (!items.length && !done) {
    return (
      <EmptyState
        icon={<PartyPopper className="size-8" />}
        title="No words to review right now"
        body="Everything is scheduled for later. Reviews come back at the right time — same day, then after 2, 7, 14 and 30 days."
        action={onComplete && <Button onClick={() => onComplete({ reviewed: 0, remembered: 0, again: [] })}>Continue</Button>}
      />
    );
  }

  async function finish() {
    const r = results.current;
    const summary: ReviewSummary = {
      reviewed: r.length,
      remembered: r.filter((x) => x.correct).length,
      again: [...new Set(r.filter((x) => !x.correct).map((x) => x.word))],
    };
    setDone(summary);
    const minutes = Math.min(45, (Date.now() - started.current) / 60000);
    try {
      const act = await post<ActivityResult>('/activity', { type: 'review', minutes, count: r.length, score: r.length ? summary.remembered / r.length : null });
      reward({ ...act, xp: act.xp + r.length * 2 });
    } catch {
      /* offline: the grades are queued; activity time is not critical */
    }
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['vocab'] });
  }

  if (done) {
    const moreDue = (q.data?.stats.due ?? 0) - done.reviewed;
    return (
      <div className="animate-pop text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-success-soft text-success">
          <Brain className="size-7" />
        </div>
        <h2 className="text-xl font-bold">Review complete</h2>
        <p className="mt-1 text-muted">
          You remembered {done.remembered} of {done.reviewed} words.
        </p>
        {done.again.length > 0 && (
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            These will come back soon: <strong className="text-text">{done.again.join(', ')}</strong>
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onComplete && <Button onClick={() => onComplete(done)}>Continue</Button>}
          {!onComplete && moreDue > 0 && (
            <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setRound(round + 1)}>
              Review {Math.min(limit, moreDue)} more
            </Button>
          )}
        </div>
      </div>
    );
  }

  const item = items[index];
  function onResult(r: ExerciseResult) {
    results.current.push({ word: item.word.word, correct: r.correct });
    void postOrQueue('/review/grade', {
      vocabId: item.exercise.vocabId,
      grade: r.grade,
      mode: item.exercise.mode,
      responseMs: r.responseMs,
      source: source === 'session' ? 'session' : source,
    });
  }
  function next() {
    if (index + 1 >= items.length) void finish();
    else setIndex(index + 1);
  }

  return (
    <div>
      <div className={compact ? 'mb-3' : 'mb-5'}>
        <div className="mb-1.5 flex justify-between text-xs font-semibold text-muted">
          <span>
            Word {index + 1} of {items.length}
          </span>
          <span>{results.current.filter((r) => r.correct).length} remembered</span>
        </div>
        <ProgressBar value={index / items.length} size="sm" label="Review progress" />
      </div>
      <ExerciseView key={`${item.exercise.id}-${index}`} ex={item.exercise} onResult={onResult} onNext={next} />
    </div>
  );
}
