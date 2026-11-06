import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Compass } from 'lucide-react';
import { COURSE_LEVELS } from '@shared/cefr';
import { get, post } from '../lib/api';
import { useToast } from '../lib/context';
import type { Paper, PlacementResult } from '../lib/types';
import { PaperRunner, type PaperSubmission } from '../components/PaperRunner';
import { FeedbackView } from '../components/activities/Feedback';
import { Badge, Button, Callout, Card, ErrorState, Segmented, SKILL_COLOR, Spinner, useDocumentTitle } from '../components/ui';

const SKILLS = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'] as const;

export default function Placement() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { reward } = useToast();
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [start, setStart] = useState<string | null>(null);
  useDocumentTitle('Placement test');

  const paper = useQuery({ queryKey: ['placement-paper'], queryFn: () => get<Paper>('/placement'), staleTime: Infinity, gcTime: 0, enabled: !result });
  const submit = useMutation({
    mutationFn: (s: PaperSubmission) => post<PlacementResult>(`/placement/${paper.data!.attemptId}/submit`, s),
    onSuccess: (r) => {
      setResult(r);
      setStart(r.recommendedStart);
      reward({ xp: 50 });
      window.scrollTo({ top: 0 });
    },
  });
  const accept = useMutation({
    mutationFn: () => post('/placement/accept', { level: start }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      navigate('/');
    },
  });

  if (result) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <Compass className="size-8 text-primary" />
        <h1 className="mt-2 text-2xl font-bold">Your English profile</h1>
        <p className="mt-1 text-muted">An estimate from this test — it will keep updating as you learn.</p>

        <Card className="mt-5">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Overall</span>
            <span className="text-3xl font-bold text-primary">{result.overallLabel}</span>
          </div>
          <div className="mt-4 space-y-3">
            {SKILLS.map((s) => {
              const v = result.skills[s] ?? 0;
              const provisional = result.provisional.includes(s);
              return (
                <div key={s}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium capitalize">
                      {s} {provisional && <span className="text-xs text-muted">(not tested — estimated)</span>}
                    </span>
                    <span className="font-bold">{result.labels[s]}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (v / 5) * 100)}%`, background: SKILL_COLOR[s], opacity: provisional ? 0.45 : 1 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-between text-[11px] text-muted">
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </Card>

        {result.sectionAccuracy.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {result.sectionAccuracy.map((s) => (
              <Badge key={s.skill}>
                {s.skill}: {s.correct}/{s.total}
              </Badge>
            ))}
          </div>
        )}

        {result.notes.length > 0 && (
          <div className="mt-4 space-y-2">
            {result.notes.map((n) => (
              <Callout key={n} kind="info">
                {n}
              </Callout>
            ))}
          </div>
        )}

        {result.writingFeedback && (
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold">Writing feedback</summary>
            <div className="mt-3">
              <FeedbackView feedback={result.writingFeedback} />
            </div>
          </details>
        )}

        <Card className="mt-5">
          <h2 className="text-lg font-bold">Where do you want to start?</h2>
          <p className="mb-3 text-sm text-muted">
            Recommended: <strong>{result.recommendedStart}</strong>. Earlier levels stay open for review but are optional.
          </p>
          <Segmented label="Starting level" value={start ?? result.recommendedStart} onChange={setStart} options={COURSE_LEVELS.map((l) => ({ value: l, label: l, hint: l === result.recommendedStart ? 'Recommended' : undefined }))} />
          <Button className="mt-5" block size="lg" loading={accept.isPending} onClick={() => accept.mutate()} icon={<ArrowRight className="size-5" />}>
            Start at {start}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
      <h1 className="text-2xl font-bold">Placement test</h1>
      <p className="mb-5 mt-1 text-muted">Take your time. Your answers are saved if you leave and come back.</p>
      {paper.isLoading ? (
        <Spinner label="Preparing the test…" />
      ) : paper.error || !paper.data ? (
        <ErrorState error={paper.error} onRetry={() => paper.refetch()} />
      ) : (
        <PaperRunner paper={paper.data} onSubmit={(s) => submit.mutate(s)} submitting={submit.isPending} optionalSections={['speaking']} />
      )}
      {submit.error && <p className="mt-3 text-sm text-danger">{(submit.error as Error).message}</p>}
    </div>
  );
}
