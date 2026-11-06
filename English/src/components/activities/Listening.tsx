import { useEffect, useMemo, useRef, useState } from 'react';
import { Captions, CaptionsOff, Pause, Play, RotateCcw } from 'lucide-react';
import { play, prepare, stopSpeaking, ttsAvailable, type Playback, type Segment } from '../../lib/tts';
import type { ListeningMaterial } from '@shared/contentSchema';
import type { QuestionDTO } from '../../lib/types';
import { QuestionSequence, type SequenceResult } from '../QuestionSequence';
import { Button, Callout, Card, Mn, SpeakButton, clsx } from '../ui';

type Material = Omit<ListeningMaterial, 'gist' | 'detail'> & { id?: string; level?: string };

const SPEEDS = [0.75, 1, 1.25, 1.5];

/** Audio player for a script: play/pause, replay, speed and transcript, with the current line highlighted. */
export function ListeningPlayer({
  material,
  baseRate = 1,
  transcript: transcriptProp,
  allowTranscript = true,
  maxPlays,
  onPlayed,
}: {
  material: Material;
  baseRate?: number;
  transcript?: boolean;
  allowTranscript?: boolean;
  maxPlays?: number;
  onPlayed?: () => void;
}) {
  const [speed, setSpeed] = useState(1);
  const [state, setState] = useState<'idle' | 'playing' | 'paused' | 'ended'>('idle');
  const [current, setCurrent] = useState<number | null>(null);
  const [showTranscript, setShowTranscript] = useState(!!transcriptProp);
  const [plays, setPlays] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const pb = useRef<Playback | null>(null);

  useEffect(() => setShowTranscript(!!transcriptProp), [transcriptProp]);
  useEffect(() => () => pb.current?.stop(), []);

  const segments: Segment[] = useMemo(
    () =>
      material.lines.map((l) => {
        const sp = material.speakers.find((s) => s.name === l.speaker);
        return { text: l.text, speaker: l.speaker, voice: sp?.voice, accent: sp?.accent };
      }),
    [material],
  );
  useEffect(() => prepare(segments), [segments]);

  const limitReached = maxPlays !== undefined && plays >= maxPlays && state !== 'playing' && state !== 'paused';

  function playFrom(from: number, rate: number) {
    pb.current?.stop();
    setError(null);
    pb.current = play(segments, {
      rate,
      startAt: from,
      onSegment: (i) => setCurrent(i),
      onWaiting: setPreparing,
      onEnd: () => {
        setState('ended');
        setCurrent(null);
        onPlayed?.();
      },
      onError: (m) => setError(m),
    });
    setState('playing');
  }

  function start(from = 0) {
    if (from === 0) setPlays((p) => p + 1);
    playFrom(from, baseRate * speed);
  }

  function toggle() {
    if (state === 'playing') {
      pb.current?.pause();
      setState('paused');
    } else if (state === 'paused') {
      pb.current?.resume();
      setState('playing');
    } else if (!limitReached) {
      start(0);
    }
  }

  const speakerColor = (name: string) => {
    const i = material.speakers.findIndex((s) => s.name === name);
    return ['text-sky-600 dark:text-sky-400', 'text-rose-600 dark:text-rose-400', 'text-amber-600 dark:text-amber-400', 'text-emerald-600 dark:text-emerald-400'][i % 4];
  };

  if (!ttsAvailable()) {
    return (
      <Callout kind="warning" title="Audio is not available">
        This browser has no speech engine, so the recording can't be played. Use Chrome, Edge or Safari — or read the transcript below.
        <div className="mt-3 space-y-1">
          {material.lines.map((l, i) => (
            <p key={i}>
              <strong>{l.speaker}:</strong> {l.text}
            </p>
          ))}
        </div>
      </Callout>
    );
  }

  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={limitReached}
          className="flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-md transition active:scale-95 disabled:opacity-40"
          aria-label={state === 'playing' ? 'Pause' : 'Play'}
        >
          {state === 'playing' ? <Pause className="size-6" /> : <Play className="ml-0.5 size-6" />}
        </button>
        <button
          type="button"
          onClick={() => !limitReached && start(0)}
          disabled={limitReached || state === 'idle'}
          className="flex size-11 items-center justify-center rounded-full bg-surface ring-1 ring-border disabled:opacity-40"
          aria-label="Replay from the start"
        >
          <RotateCcw className="size-5" />
        </button>
        <div className="flex rounded-xl bg-surface p-1 ring-1 ring-border" role="radiogroup" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={speed === s}
              onClick={() => {
                setSpeed(s);
                if (state === 'playing') playFrom(pb.current?.index ?? 0, baseRate * s);
              }}
              className={clsx('rounded-lg px-2.5 py-1.5 text-sm font-semibold tabular-nums', speed === s ? 'bg-primary text-on-primary' : 'text-muted')}
            >
              {s}×
            </button>
          ))}
        </div>
        {allowTranscript && (
          <button
            type="button"
            onClick={() => setShowTranscript(!showTranscript)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-semibold ring-1 ring-border"
            aria-pressed={showTranscript}
          >
            {showTranscript ? <CaptionsOff className="size-4" /> : <Captions className="size-4" />}
            {showTranscript ? 'Hide' : 'Show'} transcript
          </button>
        )}
      </div>
      <div className="mt-2 text-xs text-muted">
        {state === 'playing' && preparing
          ? 'Preparing natural voices… (only the first time)'
          : state === 'playing' && current !== null
            ? `Line ${current + 1} of ${segments.length}`
            : state === 'ended'
              ? 'Finished — play again or answer the questions.'
              : 'Press play to listen.'}
        {maxPlays !== undefined && ` · Plays left: ${Math.max(0, maxPlays - plays)}`}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {showTranscript && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {material.lines.map((l, i) => (
            <div key={i} className={clsx('flex items-start gap-2 rounded-lg px-2 py-1 transition', current === i && 'bg-primary-soft')}>
              <p className="min-w-0 flex-1 text-[15px] leading-relaxed">
                <span className={clsx('font-semibold', speakerColor(l.speaker))}>{l.speaker}: </span>
                {l.text}
              </p>
              <button type="button" className="shrink-0 text-xs font-semibold text-primary" onClick={() => start(i)} aria-label={`Play from line ${i + 1}`}>
                ▶
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Three-stage listening: gist → detail → transcript and expressions. */
export function ListeningActivity({
  material,
  gist,
  detail,
  rate,
  onComplete,
  context,
}: {
  material: Material & { expressions: ListeningMaterial['expressions'] };
  gist: QuestionDTO[];
  detail: QuestionDTO[];
  rate: number;
  onComplete: (r: SequenceResult) => void;
  context: { type: string; id?: string | null };
}) {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [played, setPlayed] = useState(false);
  const results = useRef<SequenceResult[]>([]);
  useEffect(() => () => stopSpeaking(), []);

  const merge = (): SequenceResult => {
    const all = results.current;
    const total = all.reduce((a, r) => a + r.total, 0);
    const sum = all.reduce((a, r) => a + r.score * r.total, 0);
    return { correct: all.reduce((a, r) => a + r.correct, 0), total, score: total ? sum / total : 1, bySkill: { listening: { sum, n: total } } };
  };

  const stages = ['First listen', 'Second listen', 'Transcript'];
  return (
    <div>
      <ol className="mb-4 flex gap-2 text-xs font-semibold">
        {stages.map((s, i) => (
          <li key={s} className={clsx('flex-1 rounded-lg px-2 py-1.5 text-center', stage === i + 1 ? 'bg-primary text-on-primary' : stage > i + 1 ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted')}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <Card className="mb-4">
        <div className="text-sm font-semibold text-muted">{material.kind}</div>
        <h3 className="text-lg font-bold">{material.title}</h3>
        <p className="mt-1 text-[15px]">{material.context}</p>
      </Card>

      {stage === 1 && (
        <>
          <p className="mb-3 text-sm text-muted">Listen once for the general idea. Try it without the transcript.</p>
          <ListeningPlayer material={material} baseRate={rate} onPlayed={() => setPlayed(true)} />
          <div className="mt-5">
            {played ? (
              <QuestionSequence
                questions={gist}
                context={context}
                onComplete={(r) => {
                  results.current.push(r);
                  setStage(2);
                  setPlayed(false);
                }}
              />
            ) : (
              <p className="text-center text-sm text-muted">The questions appear after you listen.</p>
            )}
          </div>
        </>
      )}
      {stage === 2 && (
        <>
          <p className="mb-3 text-sm text-muted">Listen again for the details. You can pause and replay.</p>
          <ListeningPlayer material={material} baseRate={rate} onPlayed={() => setPlayed(true)} />
          <div className="mt-5">
            <QuestionSequence
              questions={detail}
              context={context}
              onComplete={(r) => {
                results.current.push(r);
                setStage(3);
              }}
            />
          </div>
        </>
      )}
      {stage === 3 && (
        <>
          <p className="mb-3 text-sm text-muted">Now read along. Tap ▶ next to a line to hear it again.</p>
          <ListeningPlayer material={material} baseRate={rate} transcript />
          {material.expressions.length > 0 && (
            <Card className="mt-4">
              <h4 className="mb-2 font-semibold">Useful expressions</h4>
              <ul className="space-y-2">
                {material.expressions.map((e) => (
                  <li key={e.phrase} className="flex items-start gap-2">
                    <SpeakButton text={e.phrase} size="sm" />
                    <div>
                      <div className="font-semibold">{e.phrase}</div>
                      <div className="text-sm text-muted">{e.meaning}</div>
                      <Mn>{e.mn}</Mn>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Button className="mt-5" block size="lg" onClick={() => onComplete(merge())}>
            Continue
          </Button>
        </>
      )}
    </div>
  );
}
