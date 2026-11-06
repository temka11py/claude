import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Mic, Square, Volume2 } from 'lucide-react';
import type { PronunciationTopic } from '@shared/contentSchema';
import { diffWords } from '@shared/textDiff';
import { get, post } from '../../lib/api';
import { play, prepare, say, stopSpeaking } from '../../lib/tts';
import { useSpeechRecorder, type RecordingResult } from '../../lib/speech';
import { useToast } from '../../lib/context';
import type { ActivityResult, ShadowingSet } from '../../lib/types';
import { Button, Callout, Card, EmptyState, ErrorState, Mn, ProgressBar, SpeakButton, Spinner, clsx } from '../ui';
import { DiffView } from './Dictation';

export interface ShadowItem {
  text: string;
  stress: string | null;
  tip: string | null;
  difficult: string[];
}

/** Show stressed syllables (written in CAPITALS in the content) in bold. */
export function StressText({ text }: { text: string }) {
  return (
    <span>
      {text.split(/(\s+)/).map((w, i) => {
        const caps = w.replace(/[^A-Za-z]/g, '');
        const hasStress = /[A-Z]{2,}/.test(w) && caps !== caps.toLowerCase();
        if (!hasStress) return <span key={i}>{w}</span>;
        // Bold the capitalised part of the word.
        return (
          <span key={i}>
            {w.split(/([A-Z]{2,}[A-Z']*)/).map((part, j) =>
              /^[A-Z]{2,}/.test(part) ? (
                <strong key={j} className="text-primary">
                  {part.toLowerCase()}
                </strong>
              ) : (
                <span key={j}>{part}</span>
              ),
            )}
          </span>
        );
      })}
    </span>
  );
}

export function ShadowCard({ item, onDone }: { item: ShadowItem; onDone: (r: { accuracy: number | null }) => void }) {
  const rec = useSpeechRecorder();
  const [result, setResult] = useState<RecordingResult | null>(null);
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => prepare([{ text: item.text }]), [item.text]);
  const recording = rec.state === 'recording';
  const diff = result?.transcript ? diffWords(item.text, result.transcript) : null;

  return (
    <Card>
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-xl leading-relaxed">{item.stress ? <StressText text={item.stress} /> : item.text}</p>
        <SpeakButton text={item.text} label="Listen to the sentence" />
      </div>
      {item.tip && <p className="mt-2 text-sm text-muted">💡 {item.tip}</p>}
      {item.difficult.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.difficult.map((d) => (
            <button key={d} type="button" onClick={() => say(d, { rate: 0.8 })} className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1 text-sm font-medium text-accent">
              <Volume2 className="size-3.5" /> {d}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-sm text-muted">1. Listen. 2. Record yourself saying it the same way — copy the rhythm and the stressed words.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Volume2 className="size-4" />} onClick={() => play([{ text: item.text }], { rate: 0.9, waitMs: 15_000 })}>
          Listen
        </Button>
        {rec.canRecord || rec.canTranscribe ? (
          <Button
            variant={recording ? 'danger' : 'primary'}
            icon={recording ? <Square className="size-4" /> : <Mic className="size-4" />}
            onClick={() => (recording ? void rec.stop().then(setResult) : void rec.start())}
          >
            {recording ? `Stop (${Math.floor(rec.elapsed)}s)` : result ? 'Record again' : 'Record'}
          </Button>
        ) : (
          <span className="self-center text-sm text-muted">Recording isn't available in this browser — repeat out loud.</span>
        )}
      </div>
      {rec.error && <p className="mt-2 text-xs text-danger">{rec.error}</p>}
      {result && (
        <div className="animate-fade-in mt-4 space-y-3">
          {result.url && (
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">Your recording</div>
              <audio controls src={result.url} className="w-full" />
            </div>
          )}
          {diff ? (
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="mb-1 text-xs font-semibold text-muted">Speech recognition heard (not a pronunciation score):</div>
              <DiffView diff={diff} />
              <p className="mt-1 text-xs text-muted">Words marked in red or missing may need clearer pronunciation — or the recogniser simply misheard. Compare with the model.</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Listen to your recording and the model one after the other. Do they sound similar?</p>
          )}
        </div>
      )}
      <Button className="mt-4" block variant={result ? 'primary' : 'ghost'} onClick={() => onDone({ accuracy: diff ? diff.accuracy : null })} icon={<ArrowRight className="size-4" />}>
        {result ? 'Next' : 'Skip'}
      </Button>
    </Card>
  );
}

export function ShadowingActivity({ count = 4, items: given, onComplete }: { count?: number; items?: ShadowItem[]; onComplete: (r: { done: number }) => void }) {
  const q = useQuery({ queryKey: ['shadowing', count], queryFn: () => get<ShadowingSet>(`/practice/shadowing?count=${count}`), enabled: !given, staleTime: Infinity, gcTime: 0 });
  const items = given ?? q.data?.items ?? [];
  const [index, setIndex] = useState(0);
  const [started] = useState(Date.now());
  const { reward } = useToast();
  if (!given && q.isLoading) return <Spinner />;
  if (!given && q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!items.length) return <EmptyState title="Nothing to shadow yet" body="Shadowing uses sentences from your lessons. Complete a lesson first." action={<Button onClick={() => onComplete({ done: 0 })}>Continue</Button>} />;

  async function next() {
    if (index + 1 < items.length) {
      setIndex(index + 1);
      return;
    }
    try {
      reward(await post<ActivityResult>('/activity', { type: 'shadowing', minutes: Math.min(20, (Date.now() - started) / 60000), count: items.length }));
    } catch {
      /* not critical */
    }
    onComplete({ done: items.length });
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={index / items.length} size="sm" label="Shadowing progress" />
        <span className="shrink-0 text-xs font-semibold text-muted">
          {index + 1}/{items.length}
        </span>
      </div>
      <ShadowCard key={index} item={items[index]} onDone={next} />
    </div>
  );
}

export function PronunciationActivity({ topic, onComplete }: { topic: PronunciationTopic & { id: string }; onComplete: () => void }) {
  const [shadowing, setShadowing] = useState(false);
  const [started] = useState(Date.now());
  const { reward } = useToast();
  if (shadowing) {
    return (
      <ShadowingActivity
        items={topic.shadowing.map((s) => ({ text: s.text, stress: s.stress, tip: s.tip ?? null, difficult: s.difficult }))}
        onComplete={async () => {
          try {
            reward(await post<ActivityResult>('/activity', { type: 'pronunciation', ref: topic.id, minutes: Math.min(20, (Date.now() - started) / 60000) }));
          } catch {
            /* not critical */
          }
          onComplete();
        }}
      />
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{topic.category.replace('_', ' ')}</div>
        <h3 className="text-lg font-bold">{topic.title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed">{topic.explanation}</p>
        <Mn>{topic.explanationMn}</Mn>
      </Card>
      <div className="grid gap-2 sm:grid-cols-2">
        {topic.items.map((it) => (
          <button key={it.display} type="button" onClick={() => say(it.say, { rate: 0.85 })} className="flex items-start gap-3 rounded-xl bg-surface p-3 text-left ring-1 ring-border transition hover:ring-primary">
            <Volume2 className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="font-semibold">{it.display}</span>
              {it.tip && <span className="block text-sm text-muted">{it.tip}</span>}
            </span>
          </button>
        ))}
      </div>
      {topic.spokenForms.length > 0 && (
        <Card>
          <h4 className="mb-2 font-semibold">Written vs spoken</h4>
          <Callout kind="warning">Spoken forms like these are for informal speech. Don't use them in formal writing.</Callout>
          <ul className="mt-3 space-y-2">
            {topic.spokenForms.map((f) => (
              <li key={f.written} className="flex flex-wrap items-center gap-2 text-[15px]">
                <span className="font-semibold">{f.written}</span>→
                <button type="button" onClick={() => say(f.spoken)} className="rounded-lg bg-primary-soft px-2 py-0.5 font-semibold text-primary">
                  {f.spoken}
                </button>
                <span className="text-sm text-muted">{f.note}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Button block size="lg" onClick={() => setShadowing(true)}>
        Practise: shadow {topic.shadowing.length} sentences
      </Button>
    </div>
  );
}

export { clsx };
