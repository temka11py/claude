import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Target } from 'lucide-react';
import { findWordForm } from '@shared/text';
import { api, get, post } from '../../lib/api';
import { useToast } from '../../lib/context';
import type { ActivityResult, Challenge } from '../../lib/types';
import { RecorderPanel } from './Speaking';
import { Badge, Button, Callout, Card, ErrorState, Input, Spinner, Textarea, clsx } from '../ui';

interface SubmitResult extends ActivityResult {
  success: boolean;
  result: Record<string, unknown>;
}

export function ChallengeActivity({ onComplete }: { onComplete: (r: { success: boolean }) => void }) {
  const q = useQuery({ queryKey: ['challenge'], queryFn: () => get<Challenge>('/challenge/today') });
  const [text, setText] = useState('');
  const [corrections, setCorrections] = useState<string[]>([]);
  const [res, setRes] = useState<SubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { reward } = useToast();
  const qc = useQueryClient();

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data as Challenge & { words?: { id: string; word: string }[]; items?: { wrong: string }[]; seconds?: number; title: string; instructions: string };

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await post<SubmitResult>('/challenge/today', body);
      setRes(r);
      reward(r);
      void qc.invalidateQueries({ queryKey: ['challenge'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <Card className="mb-4">
      <div className="flex items-center gap-2">
        <Target className="size-5 text-accent" />
        <h3 className="text-lg font-bold">{c.title}</h3>
        {c.status === 'done' && (
          <Badge tone="success">
            <CircleCheck className="size-3" /> Done
          </Badge>
        )}
      </div>
      <p className="mt-2 text-[16px]">{c.instructions}</p>
    </Card>
  );

  const result = res?.result as { message?: string; used?: { word: string; used: boolean }[]; items?: { wrong: string; given: string; correct: string; why: string; ok: boolean }[]; issues?: { original: string; improved: string; explanation: string }[] } | undefined;

  const resultView = res && (
    <div className="animate-pop mt-4 space-y-3">
      <Callout kind={res.success ? 'success' : 'tip'} title={res.success ? 'Challenge complete!' : 'Not quite yet'}>
        {result?.message}
      </Callout>
      {result?.items && (
        <ul className="space-y-2">
          {result.items.map((it, i) => (
            <li key={i} className={clsx('rounded-xl p-3 text-sm ring-1', it.ok ? 'bg-success-soft ring-success/30' : 'bg-danger-soft ring-danger/25')}>
              <div className="line-through opacity-70">{it.wrong}</div>
              <div className="font-semibold">✅ {it.correct}</div>
              {!it.ok && it.given && <div className="text-muted">You wrote: {it.given}</div>}
              <div className="mt-1 text-muted">{it.why}</div>
            </li>
          ))}
        </ul>
      )}
      {result?.issues && result.issues.length > 0 && (
        <Card>
          <h4 className="mb-2 font-semibold">Things to check</h4>
          {result.issues.map((i, k) => (
            <p key={k} className="text-sm">
              {i.original} → <strong>{i.improved}</strong> <span className="text-muted">({i.explanation})</span>
            </p>
          ))}
        </Card>
      )}
      <Button block size="lg" onClick={() => onComplete({ success: res.success })}>
        {res.success ? 'Continue' : 'Continue anyway'}
      </Button>
      {!res.success && (
        <Button block variant="ghost" onClick={() => setRes(null)}>
          Try again
        </Button>
      )}
    </div>
  );

  if (c.type === 'use_words') {
    const words = c.words ?? [];
    return (
      <div>
        {header}
        <div className="mb-3 flex flex-wrap gap-2">
          {words.map((w) => (
            <span key={w.id} className={clsx('rounded-lg px-3 py-1.5 font-semibold', findWordForm(text, w.word) ? 'bg-success-soft text-success line-through' : 'bg-primary-soft text-primary')}>
              {w.word}
            </span>
          ))}
        </div>
        {!res && (
          <>
            <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your paragraph…" aria-label="Your paragraph" />
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <Button className="mt-3" block size="lg" loading={busy} disabled={text.trim().split(/\s+/).length < 8} onClick={() => submit({ text })}>
              Submit
            </Button>
          </>
        )}
        {resultView}
      </div>
    );
  }

  if (c.type === 'speak') {
    return (
      <div>
        {header}
        {!res && (
          <RecorderPanel
            targetSeconds={c.seconds ?? 60}
            label="Start speaking"
            onDone={async (r) => {
              // Save the recording as a speaking attempt too, so it gets feedback and appears in history.
              if (r.blob || r.transcript) {
                const form = new FormData();
                if (r.blob) form.append('audio', r.blob, 'challenge.webm');
                form.append('context', 'challenge');
                form.append('prompt', c.instructions);
                form.append('durationSec', String(Math.round(r.durationSec)));
                if (r.transcript) form.append('transcript', r.transcript);
                void api('/speaking/submit', { method: 'POST', form }).catch(() => undefined);
              }
              await submit({ durationSec: r.durationSec });
            }}
          />
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {resultView}
      </div>
    );
  }

  const items = c.items ?? [];
  return (
    <div>
      {header}
      {!res && (
        <>
          <ol className="space-y-3">
            {items.map((it, i) => (
              <li key={i}>
                <div className="mb-1 text-[15px] text-danger">
                  {i + 1}. {it.wrong}
                </div>
                <Input
                  value={corrections[i] ?? ''}
                  onChange={(e) => setCorrections((prev) => {
                    const n = [...prev];
                    n[i] = e.target.value;
                    return n;
                  })}
                  placeholder="Correct sentence"
                  aria-label={`Correction ${i + 1}`}
                />
              </li>
            ))}
          </ol>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <Button className="mt-4" block size="lg" loading={busy} onClick={() => submit({ corrections })}>
            Check
          </Button>
        </>
      )}
      {resultView}
    </div>
  );
}
