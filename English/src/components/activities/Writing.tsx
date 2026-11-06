import { useEffect, useMemo, useState } from 'react';
import type { WritingTask } from '@shared/contentSchema';
import { findWordForm, wordCount } from '@shared/text';
import { post } from '../../lib/api';
import { useToast } from '../../lib/context';
import type { ActivityResult, WritingFeedback } from '../../lib/types';
import { FeedbackView } from './Feedback';
import { Badge, Button, Card, Mn, Textarea, clsx } from '../ui';

type Task = WritingTask & { id: string; level?: string };

function draftKey(id: string) {
  return `fp-draft:${id}`;
}

export function WritingActivity({
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
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draftKey(task.id)) ?? '';
    } catch {
      return '';
    }
  });
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useMemo(() => Date.now(), []);
  const { reward } = useToast();

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey(task.id), text);
      } catch {
        /* ignore */
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [text, task.id]);

  const wc = wordCount(text);
  const used = task.targetWords.filter((w) => findWordForm(text, w));
  const status = wc < task.minWords ? 'short' : wc > task.maxWords * 1.25 ? 'long' : 'ok';

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await post<ActivityResult & { feedback: WritingFeedback }>('/writing/submit', {
        taskId: task.id,
        text,
        context,
        minutes: Math.min(90, (Date.now() - started) / 60000),
      });
      setFeedback(res.feedback);
      reward(res);
      try {
        localStorage.removeItem(draftKey(task.id));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (feedback) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="mb-1 text-sm font-semibold text-muted">Your text</div>
          <p className="whitespace-pre-line text-[15px] leading-relaxed">{text}</p>
        </Card>
        <FeedbackView feedback={feedback} sample={task.sample} />
        <Button block size="lg" onClick={() => onComplete({ score: feedback.score / 100 })}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex flex-wrap gap-2">
          <Badge tone="primary">{task.type.replace('_', ' ')}</Badge>
          <Badge>{task.register}</Badge>
          <Badge>
            {task.minWords}–{task.maxWords} words
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
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Useful phrases (tap to add)</div>
            <div className="flex flex-wrap gap-1.5">
              {task.phrases.map((p) => (
                <button key={p} type="button" onClick={() => setText((t) => `${t}${t && !t.endsWith(' ') && !t.endsWith('\n') ? ' ' : ''}${p} `)} className="rounded-lg bg-surface-2 px-2.5 py-1 text-sm hover:bg-primary-soft">
                  {p}
                </button>
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

      <div>
        <label htmlFor={`w-${task.id}`} className="sr-only">
          Your text
        </label>
        <Textarea id={`w-${task.id}`} rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Start writing here… Your draft is saved automatically." />
        <div className="mt-1.5 flex justify-between text-xs font-semibold">
          <span className={clsx(status === 'ok' ? 'text-success' : status === 'short' ? 'text-muted' : 'text-warning')}>
            {wc} words {status === 'short' ? `(at least ${task.minWords})` : status === 'long' ? '(a bit long)' : '✓'}
          </span>
          <span className="text-muted">
            {used.length}/{task.targetWords.length} target words
          </span>
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button block size="lg" loading={busy} disabled={wc < 3} onClick={submit}>
        Get feedback
      </Button>
      {allowSkip && (
        <div className="text-center">
          <button type="button" className="text-sm font-semibold text-muted hover:text-text" onClick={() => onComplete({ score: null, skipped: true })}>
            Skip writing for now
          </button>
        </div>
      )}
    </div>
  );
}
