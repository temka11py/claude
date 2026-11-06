import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, CircleX, Target, X } from 'lucide-react';
import { post } from '../lib/api';
import { useToast } from '../lib/context';
import type { Paper, TestResult } from '../lib/types';
import { PaperRunner, type PaperSubmission } from '../components/PaperRunner';
import { FeedbackView } from '../components/activities/Feedback';
import { Badge, Button, ButtonLink, Callout, Card, ErrorState, ProgressBar, Ring, Spinner, clsx, useDocumentTitle } from '../components/ui';

export function TestResultView({ r, onRetry }: { r: TestResult; onRetry?: () => void }) {
  const [showMistakes, setShowMistakes] = useState(false);
  return (
    <div className="animate-slide-up space-y-4">
      <Card className="text-center">
        <Ring value={r.percent} size={120} stroke={10} color={r.passed ? 'var(--success)' : 'var(--accent)'} label={`Score ${Math.round(r.percent * 100)}%`}>
          <div className="text-3xl font-bold">{Math.round(r.percent * 100)}%</div>
        </Ring>
        <h2 className="mt-3 text-2xl font-bold">{r.passed ? (r.kind === 'level_exam' ? 'Level passed!' : 'Module passed!') : 'Not quite yet'}</h2>
        <p className="mx-auto mt-2 max-w-xl text-[15px]">{r.message}</p>
        {r.recommendation && (
          <div className="mt-3">
            <Badge tone={r.passed ? 'success' : 'accent'}>{r.recommendation}</Badge>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">Pass mark: {Math.round(r.passMark * 100)}%{r.kind === 'level_exam' ? ' overall and at least 55% in every skill' : ''}.</p>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Results by skill</h3>
        <div className="space-y-3">
          {r.sections.map((s) => (
            <div key={s.skill}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">
                  {s.title} <span className="text-xs text-muted">({s.weight}%)</span>
                  {s.note && <span className="ml-2 text-xs text-muted">· {s.note}</span>}
                </span>
                <span className="font-semibold tabular-nums">{s.percent === null ? '—' : `${Math.round(s.percent * 100)}%`}</span>
              </div>
              <ProgressBar value={s.percent ?? 0} color={s.percent === null ? 'bg-surface-2' : s.percent >= 0.8 ? 'bg-success' : s.percent >= 0.6 ? 'bg-primary' : 'bg-accent'} label={s.title} />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-success">Strong areas</div>
            <div className="text-sm">{r.strong.length ? r.strong.join(', ') : '—'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Needs work</div>
            <div className="text-sm">{r.weak.length ? r.weak.join(', ') : '—'}</div>
          </div>
        </div>
      </Card>

      {r.objectives.length > 0 && (
        <Card>
          <h3 className="mb-3 font-semibold">Module objectives</h3>
          <ul className="space-y-2">
            {r.objectives.map((o) => (
              <li key={o.text} className="flex items-start gap-2 text-[15px]">
                {o.achieved ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" /> : <CircleX className="mt-0.5 size-5 shrink-0 text-accent" />}
                <span>
                  {o.text} <span className="text-xs text-muted">({o.achieved ? 'achieved' : 'not yet'})</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {r.recommendations.length > 0 && (
        <Card>
          <h3 className="mb-3 font-semibold">Recommended review</h3>
          <ul className="space-y-2">
            {r.recommendations.map((rec, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
                <div>
                  <div className="font-medium">{rec.title}</div>
                  <div className="text-sm text-muted">{rec.reason}</div>
                </div>
                {rec.type === 'lesson' && rec.id && (
                  <ButtonLink to={`/lesson/${rec.id}`} size="sm" variant="soft">
                    Review
                  </ButtonLink>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {r.mistakes.length > 0 && (
        <Card>
          <button type="button" onClick={() => setShowMistakes(!showMistakes)} className="flex w-full items-center justify-between font-semibold" aria-expanded={showMistakes}>
            Your mistakes ({r.mistakes.length})
            <span className="text-sm text-primary">{showMistakes ? 'Hide' : 'Show'}</span>
          </button>
          {showMistakes && (
            <ul className="mt-3 space-y-2">
              {r.mistakes.map((m, i) => (
                <li key={i} className="rounded-xl bg-surface-2 p-3 text-sm">
                  <div className="text-xs font-semibold text-muted">{m.section}</div>
                  <div className="mt-0.5 whitespace-pre-line">{m.prompt}</div>
                  <div className="mt-1 text-danger">Your answer: {m.yourAnswer}</div>
                  <div className="font-semibold text-success">Correct: {m.correctAnswer}</div>
                  {m.explanation && <div className="mt-1 text-muted">{m.explanation}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {r.writingFeedback && (
        <div>
          <h3 className="mb-2 text-lg font-semibold">Writing feedback</h3>
          <FeedbackView feedback={r.writingFeedback} />
        </div>
      )}
      {r.speakingFeedback && (
        <div>
          <h3 className="mb-2 text-lg font-semibold">Speaking feedback</h3>
          <FeedbackView feedback={r.speakingFeedback} />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <ButtonLink to="/" size="lg" icon={<ArrowRight className="size-5" />}>
          Back to Today
        </ButtonLink>
        {r.kind === 'module_test' && (
          <ButtonLink to={`/module/${r.refId}`} size="lg" variant="secondary">
            Module overview
          </ButtonLink>
        )}
        {!r.passed && onRetry && (
          <Button size="lg" variant="ghost" onClick={onRetry}>
            Try a new version
          </Button>
        )}
      </div>
    </div>
  );
}

/** Intro → paper → result. Used by the test page and inside the daily session. */
export function TestFlow({ kind, id, onDone, onTitle }: { kind: 'module' | 'level'; id: string; onDone?: (r: TestResult) => void; onTitle?: (t: string) => void }) {
  const qc = useQueryClient();
  const { reward } = useToast();
  const [fresh, setFresh] = useState(0);
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const path = kind === 'level' ? `/levels/${encodeURIComponent(id)}/exam` : `/modules/${id}/test`;

  const paper = useQuery({
    queryKey: ['paper', kind, id, fresh],
    queryFn: () => post<Paper>(path, { fresh: fresh > 0 }),
    enabled: started,
    staleTime: Infinity,
    gcTime: 0,
  });
  useEffect(() => {
    if (paper.data) onTitle?.(paper.data.title);
  }, [paper.data, onTitle]);
  const submit = useMutation({
    mutationFn: (s: PaperSubmission) => post<TestResult>(`/tests/${paper.data!.attemptId}/submit`, s),
    onSuccess: (r) => {
      setResult(r);
      reward(r);
      void qc.invalidateQueries();
      window.scrollTo({ top: 0 });
    },
  });

  if (result) {
    return (
      <>
        <TestResultView
          r={result}
          onRetry={() => {
            setResult(null);
            setFresh((f) => f + 1);
          }}
        />
        {onDone && (
          <Button className="mt-4" block size="lg" onClick={() => onDone(result)}>
            Continue session
          </Button>
        )}
      </>
    );
  }
  if (!started) {
    return (
      <Card className="mx-auto max-w-xl">
        <Target className="size-8 text-primary" />
        <h2 className="mt-2 text-xl font-bold">{kind === 'level' ? `The ${id} level exam` : 'Ready for the module test?'}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[15px]">
          <li>Grammar, vocabulary, reading, listening, writing and speaking.</li>
          <li>About {kind === 'level' ? '60–75' : '25–30'} minutes. You can leave and come back — your answers are saved.</li>
          <li>Listening clips can be played twice. No transcripts in tests.</li>
          <li>{kind === 'level' ? 'To move on you need 70% overall and at least 55% in every skill.' : 'You need 60% to complete the module. Questions change each time.'}</li>
        </ul>
        <div className="mt-3">
          <Callout kind="info">Without an AI key, writing and speaking are scored with an automatic estimate and your self-check. This is shown clearly in the results.</Callout>
        </div>
        <Button className="mt-4" block size="lg" onClick={() => setStarted(true)}>
          Start
        </Button>
      </Card>
    );
  }
  if (paper.isLoading) return <Spinner label="Preparing your test…" />;
  if (paper.error || !paper.data) return <ErrorState error={paper.error} onRetry={() => paper.refetch()} />;
  return (
    <>
      <PaperRunner paper={paper.data} onSubmit={(s) => submit.mutate(s)} submitting={submit.isPending} />
      {submit.error && <p className={clsx('mt-3 text-sm text-danger')}>{(submit.error as Error).message}</p>}
    </>
  );
}

export default function TestRunner() {
  const { kind, id } = useParams<{ kind: 'module' | 'level'; id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState<string | null>(null);
  useDocumentTitle(kind === 'level' ? `${id} level exam` : 'Module test');
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-4 sm:px-6">
      <header className="mb-5 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-2" aria-label="Leave the test (answers are saved)">
          <X className="size-5" />
        </button>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{kind === 'level' ? 'Level exam' : 'Module test'}</div>
          <h1 className="truncate text-lg font-bold">{title ?? (kind === 'level' ? `${id} exam` : 'Module test')}</h1>
        </div>
      </header>
      <TestFlow kind={kind!} id={id!} onTitle={setTitle} />
    </div>
  );
}
