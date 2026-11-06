import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Wrench } from 'lucide-react';
import { get, post } from '../lib/api';
import type { ErrorRow } from '../lib/types';
import { Badge, ButtonLink, Card, EmptyState, ErrorState, Mn, PageHeader, Spinner, Tabs, useDocumentTitle } from '../components/ui';

const CATEGORIES = ['all', 'grammar', 'vocabulary', 'spelling', 'pronunciation', 'word_choice', 'collocation', 'sentence_structure', 'register', 'punctuation'] as const;

export default function Mistakes() {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const qc = useQueryClient();
  useDocumentTitle('My mistakes');
  const q = useQuery({
    queryKey: ['mistakes', status, category],
    queryFn: () => get<{ errors: ErrorRow[]; stats: { byCategory: { category: string; count: number; occurrences: number }[]; resolved: number } }>(`/mistakes?status=${status}${category !== 'all' ? `&category=${category}` : ''}`),
  });
  const dismiss = useMutation({
    mutationFn: (id: number) => post(`/mistakes/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mistakes'] }),
  });
  const due = (q.data?.errors ?? []).filter((e) => new Date(e.nextReviewAt) <= new Date()).length;

  return (
    <div>
      <PageHeader
        title="My mistakes"
        subtitle="Collected automatically from your answers, writing and speaking. Fix each one three times and it's gone."
        actions={
          <ButtonLink to="/practice/mistakes" icon={<Wrench className="size-4" />}>
            Review now{due ? ` (${due})` : ''}
          </ButtonLink>
        }
      />
      {q.data && q.data.stats.byCategory.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {q.data.stats.byCategory.map((c) => (
            <Badge key={c.category} tone="neutral">
              {c.category.replace('_', ' ')}: {c.count}
            </Badge>
          ))}
          <Badge tone="success">
            <CircleCheck className="size-3" /> fixed: {q.data.stats.resolved}
          </Badge>
        </div>
      )}
      <Tabs
        tabs={[
          { value: 'open', label: 'To fix' },
          { value: 'resolved', label: 'Fixed' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${category === c ? 'bg-primary text-on-primary' : 'bg-surface-2 text-muted'}`}
          >
            {c.replace('_', ' ')}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.errors.length ? (
        <EmptyState
          icon={<CircleCheck className="size-8" />}
          title={status === 'open' ? 'No mistakes to fix' : 'Nothing fixed yet'}
          body={status === 'open' ? 'When you make a mistake in a lesson, test or text, it appears here with an explanation.' : 'Fixed mistakes appear here.'}
        />
      ) : (
        <ul className="space-y-3">
          {q.data.errors.map((e) => (
            <li key={e.id}>
              <Card>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge>{e.category.replace('_', ' ')}</Badge>
                  {e.occurrences > 1 && <Badge tone="danger">Repeated ×{e.occurrences}</Badge>}
                  <span className="text-xs text-muted">from {e.source.replace('_', ' ')}</span>
                </div>
                <div className="text-[15px] text-danger">❌ {e.wrong}</div>
                <div className="mt-1 text-[15px] font-semibold text-success">✅ {e.correct}</div>
                {e.explanation && <p className="mt-2 text-sm">{e.explanation}</p>}
                <Mn>{e.explanationMn}</Mn>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {e.resolvedAt
                      ? `Fixed on ${new Date(e.resolvedAt).toLocaleDateString()}`
                      : `Correct ${e.correctReviews}/3 · next review ${new Date(e.nextReviewAt).toLocaleDateString()}`}
                  </span>
                  {!e.resolvedAt && (
                    <button type="button" className="font-semibold hover:text-text" onClick={() => dismiss.mutate(e.id)}>
                      This isn't a mistake — remove
                    </button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
