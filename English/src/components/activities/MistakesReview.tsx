import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, CircleCheck, CircleX, PartyPopper } from 'lucide-react';
import { get, post } from '../../lib/api';
import { useToast } from '../../lib/context';
import type { ActivityResult, ErrorExercise } from '../../lib/types';
import { Button, EmptyState, ErrorState, Mn, ProgressBar, Spinner, clsx } from '../ui';

interface ReviewResponse {
  correct: boolean;
  almost: boolean;
  expected: string;
  resolved: boolean;
  nextReviewAt: string | null;
  xp: number;
}

export function MistakesReview({ limit = 10, onComplete }: { limit?: number; onComplete: (r: { fixed: number; total: number }) => void }) {
  const q = useQuery({ queryKey: ['mistakes-review', limit], queryFn: () => get<{ items: ErrorExercise[] }>(`/mistakes/review?limit=${limit}`), staleTime: Infinity, gcTime: 0 });
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [res, setRes] = useState<ReviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const fixed = useRef(0);
  const started = useRef(Date.now());
  const { reward } = useToast();
  const qc = useQueryClient();

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data?.items ?? [];
  if (!items.length) {
    return (
      <EmptyState
        icon={<PartyPopper className="size-8" />}
        title="No mistakes to review today"
        body="Mistakes come back 2, 7 and 14 days after you make them, until you fix them three times."
        action={<Button onClick={() => onComplete({ fixed: 0, total: 0 })}>Continue</Button>}
      />
    );
  }
  const item = items[index];

  async function submit(body: { answer?: string; choiceCorrect?: boolean }) {
    setBusy(true);
    try {
      const r = await post<ReviewResponse>(`/mistakes/${item.id}/review`, body);
      setRes(r);
      if (r.correct) fixed.current++;
      if (r.xp) reward({ xp: r.xp });
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (index + 1 < items.length) {
      setIndex(index + 1);
      setAnswer('');
      setRes(null);
      return;
    }
    try {
      reward(await post<ActivityResult>('/activity', { type: 'mistakes', minutes: Math.min(20, (Date.now() - started.current) / 60000), score: fixed.current / items.length, count: items.length }));
    } catch {
      /* not critical */
    }
    void qc.invalidateQueries({ queryKey: ['mistakes'] });
    onComplete({ fixed: fixed.current, total: items.length });
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={index / items.length} size="sm" label="Mistakes review progress" />
        <span className="shrink-0 text-xs font-semibold text-muted">
          {index + 1}/{items.length}
        </span>
      </div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {item.category.replace('_', ' ')}
        {item.occurrences > 1 && <span className="rounded bg-danger-soft px-1.5 py-0.5 text-danger normal-case">repeated ×{item.occurrences}</span>}
      </div>
      <p className="text-[17px] font-medium">{item.prompt}</p>

      {item.kind === 'typed' ? (
        <>
          <div className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-[16px] text-danger">❌ {item.wrong}</div>
          <textarea
            className="mt-3 w-full rounded-xl bg-surface p-3.5 text-[16px] ring-1 ring-border focus:ring-2 focus:ring-primary focus:outline-none"
            rows={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), !res && answer.trim() && submit({ answer }))}
            placeholder="Write the correct version…"
            aria-label="Corrected sentence"
            disabled={!!res}
          />
          {!res && (
            <Button className="mt-3" block size="lg" loading={busy} disabled={!answer.trim()} onClick={() => submit({ answer })} icon={<Check className="size-5" />}>
              Check
            </Button>
          )}
        </>
      ) : (
        <div className="mt-3 space-y-2">
          {item.options.map((o, i) => (
            <button
              key={o}
              type="button"
              disabled={!!res || busy}
              onClick={() => submit({ choiceCorrect: i === item.answerIndex })}
              className={clsx('w-full rounded-xl px-4 py-3 text-left text-[15px] ring-1 transition', res ? (i === item.answerIndex ? 'bg-success-soft ring-success' : 'opacity-50 ring-border') : 'bg-surface ring-border hover:ring-primary')}
            >
              {o}
            </button>
          ))}
        </div>
      )}

      {res && (
        <div className={clsx('animate-pop mt-4 rounded-2xl p-4 ring-1', res.correct ? 'bg-success-soft ring-success/30' : 'bg-danger-soft ring-danger/25')} role="status">
          <div className={clsx('flex items-center gap-2 font-semibold', res.correct ? 'text-success' : 'text-danger')}>
            {res.correct ? <CircleCheck className="size-5" /> : <CircleX className="size-5" />}
            {res.correct ? (res.resolved ? 'Fixed for good — removed from your list!' : 'Correct!') : res.almost ? 'Very close!' : 'Not quite yet.'}
          </div>
          <p className="mt-1.5 text-[15px]">
            ✅ <strong>{res.expected}</strong>
          </p>
          {item.explanation && <p className="mt-1 text-sm">{item.explanation}</p>}
          <Mn>{item.explanationMn}</Mn>
          {!res.resolved && res.nextReviewAt && <p className="mt-2 text-xs text-muted">Review again on {new Date(res.nextReviewAt).toLocaleDateString()}.</p>}
          <Button className="mt-3" block onClick={next} icon={<ArrowRight className="size-4" />} autoFocus>
            {index + 1 < items.length ? 'Next' : 'Finish'}
          </Button>
        </div>
      )}
    </div>
  );
}
