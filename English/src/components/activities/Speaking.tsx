import { useEffect, useState } from 'react';
import { Mic, RotateCcw, Square, Timer } from 'lucide-react';
import type { SpeakingTask } from '@shared/contentSchema';
import { findWordForm } from '@shared/text';
import { api } from '../../lib/api';
import { useSpeechRecorder, type RecordingResult } from '../../lib/speech';
import { useToast } from '../../lib/context';
import type { ActivityResult, SpeakingFeedback } from '../../lib/types';
import { FeedbackView } from './Feedback';
import { Badge, Button, Callout, Card, Mn, Textarea, clsx } from '../ui';

const SELF_CHECKS = ['I spoke for most of the time', 'I covered the points in the task', 'I used some new words or phrases', 'I spoke clearly and corrected myself when needed'];

/** Big record button with timer and live transcript. */
export function RecorderPanel({
  targetSeconds,
  onDone,
  label = 'Record your answer',
}: {
  targetSeconds: number;
  onDone: (r: RecordingResult) => void;
  label?: string;
}) {
  const rec = useSpeechRecorder();
  const recording = rec.state === 'recording';
  const pct = Math.min(1, rec.elapsed / targetSeconds);

  useEffect(() => {
    // Stop automatically at twice the target time.
    if (recording && rec.elapsed > targetSeconds * 2) void rec.stop().then(onDone);
  }, [rec, recording, targetSeconds, onDone]);

  if (!rec.canRecord && !rec.canTranscribe) {
    return (
      <Callout kind="warning" title="Recording isn't available">
        This browser can't use the microphone. You can still practise: say your answer out loud, then use the self-check below.
      </Callout>
    );
  }

  return (
    <div className="rounded-2xl bg-surface-2 p-4 text-center">
      <button
        type="button"
        onClick={() => (recording ? void rec.stop().then(onDone) : void rec.start())}
        className={clsx(
          'mx-auto flex size-20 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95',
          recording ? 'bg-danger' : 'bg-primary',
        )}
        aria-label={recording ? 'Stop recording' : label}
      >
        {recording ? <Square className="size-7" /> : <Mic className="size-8" />}
      </button>
      <div className="mt-3 text-sm font-semibold">{recording ? 'Recording… tap to stop' : label}</div>
      <div className="mx-auto mt-2 max-w-xs">
        <div className="h-2 overflow-hidden rounded-full bg-surface">
          <div className={clsx('h-full rounded-full transition-all', pct >= 1 ? 'bg-success' : 'bg-primary')} style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
          <span>{Math.floor(rec.elapsed)}s</span>
          <span>target {targetSeconds}s</span>
        </div>
      </div>
      {recording && (rec.transcript || rec.interim) && (
        <p className="mx-auto mt-3 max-w-lg text-left text-sm text-muted" aria-live="polite">
          {rec.transcript} <span className="opacity-60">{rec.interim}</span>
        </p>
      )}
      {!rec.canTranscribe && <p className="mt-2 text-xs text-muted">Live transcription isn't supported in this browser (it works in Chrome and Edge). Your recording is still saved.</p>}
      {rec.error && <p className="mt-2 text-xs text-danger">{rec.error}</p>}
    </div>
  );
}

type Task = SpeakingTask & { id: string; level?: string };

export function SpeakingActivity({
  task,
  context,
  onComplete,
  allowSkip = true,
}: {
  task: Task;
  context: string;
  onComplete: (r: { score: number | null; skipped?: boolean }) => void;
  allowSkip?: boolean;
}) {
  const [phase, setPhase] = useState<'prepare' | 'record' | 'review' | 'feedback'>('prepare');
  const [prepLeft, setPrepLeft] = useState<number | null>(null);
  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [transcript, setTranscript] = useState('');
  const [checks, setChecks] = useState<boolean[]>(SELF_CHECKS.map(() => false));
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { reward } = useToast();

  useEffect(() => {
    if (prepLeft === null) return;
    if (prepLeft <= 0) {
      setPhase('record');
      setPrepLeft(null);
      return;
    }
    const t = window.setTimeout(() => setPrepLeft(prepLeft - 1), 1000);
    return () => window.clearTimeout(t);
  }, [prepLeft]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (recording?.blob) form.append('audio', recording.blob, 'answer.webm');
      form.append('taskId', task.id);
      form.append('context', context);
      form.append('durationSec', String(Math.round(recording?.durationSec ?? 0)));
      if (transcript.trim()) form.append('transcript', transcript.trim());
      form.append('selfRating', String(checks.filter(Boolean).length / checks.length));
      const res = await api<ActivityResult & { feedback: SpeakingFeedback }>('/speaking/submit', { method: 'POST', form });
      setFeedback(res.feedback);
      reward(res);
      setPhase('feedback');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const used = task.targetWords.filter((w) => transcript && findWordForm(transcript, w));

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex flex-wrap gap-2">
          <Badge tone="primary">{task.type}</Badge>
          <Badge>
            <Timer className="size-3" /> about {task.speakSeconds}s
          </Badge>
        </div>
        <p className="text-[17px] font-medium leading-relaxed">{task.prompt}</p>
        <Mn>{task.promptMn}</Mn>
        {task.points.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[15px]">
            {task.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {task.phrases.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Useful phrases</div>
            <div className="flex flex-wrap gap-1.5">
              {task.phrases.map((p) => (
                <span key={p} className="rounded-lg bg-surface-2 px-2.5 py-1 text-sm">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
        {task.targetWords.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Try to use</div>
            <div className="flex flex-wrap gap-1.5">
              {task.targetWords.map((w) => (
                <span key={w} className={clsx('rounded-lg px-2.5 py-1 text-sm font-medium', used.includes(w) ? 'bg-success-soft text-success line-through' : 'bg-primary-soft text-primary')}>
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {phase === 'prepare' && (
        <div className="flex flex-wrap gap-2">
          {prepLeft === null ? (
            <>
              <Button size="lg" onClick={() => setPrepLeft(task.prepSeconds)} icon={<Timer className="size-5" />}>
                Prepare ({task.prepSeconds}s)
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setPhase('record')}>
                I'm ready — record now
              </Button>
            </>
          ) : (
            <div className="w-full rounded-2xl bg-accent-soft p-4 text-center">
              <div className="text-3xl font-bold tabular-nums text-accent">{prepLeft}</div>
              <div className="text-sm">Think about what you will say. Make short notes if you like.</div>
              <Button className="mt-2" variant="ghost" size="sm" onClick={() => setPrepLeft(0)}>
                Start now
              </Button>
            </div>
          )}
        </div>
      )}

      {phase === 'record' && (
        <RecorderPanel
          targetSeconds={task.speakSeconds}
          onDone={(r) => {
            setRecording(r);
            setTranscript(r.transcript);
            setPhase('review');
          }}
        />
      )}

      {phase === 'review' && (
        <Card className="space-y-4">
          {recording?.url && (
            <div>
              <div className="mb-1 text-sm font-semibold">Listen to yourself</div>
              <audio controls src={recording.url} className="w-full" />
            </div>
          )}
          <div>
            <label htmlFor="transcript" className="text-sm font-semibold">
              Transcript
            </label>
            <p className="mb-1 text-xs text-muted">
              {recording?.transcript
                ? 'This is what the speech recogniser heard. Fix obvious recognition errors if needed — feedback is based on this text.'
                : 'No automatic transcript. You can type what you said (optional) for feedback on grammar and vocabulary.'}
            </p>
            <Textarea id="transcript" rows={4} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="What you said…" />
          </div>
          <fieldset>
            <legend className="text-sm font-semibold">Self-check</legend>
            <div className="mt-1 space-y-1.5">
              {SELF_CHECKS.map((c, i) => (
                <label key={c} className="flex items-center gap-2 text-[15px]">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={checks[i]} onChange={(e) => setChecks(checks.map((x, j) => (j === i ? e.target.checked : x)))} />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="lg" loading={busy} onClick={submit}>
              Get feedback
            </Button>
            <Button size="lg" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setPhase('record')}>
              Record again
            </Button>
          </div>
        </Card>
      )}

      {phase === 'feedback' && feedback && (
        <>
          <FeedbackView feedback={feedback} sample={task.sample} />
          <Button block size="lg" onClick={() => onComplete({ score: feedback.score !== null ? feedback.score / 100 : null })}>
            Continue
          </Button>
        </>
      )}

      {allowSkip && phase !== 'feedback' && (
        <div className="text-center">
          <button type="button" className="text-sm font-semibold text-muted hover:text-text" onClick={() => onComplete({ score: null, skipped: true })}>
            Skip speaking for now
          </button>
        </div>
      )}
    </div>
  );
}
