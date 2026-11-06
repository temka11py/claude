import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Flag, Lightbulb, Lock, MessagesSquare } from 'lucide-react';
import { COURSE_LEVELS } from '@shared/cefr';
import type { ScenarioDoc } from '@shared/contentSchema';
import { get, post, postStream } from '../lib/api';
import { useSettings, useToast } from '../lib/context';
import type { ActivityResult, Thread } from '../lib/types';
import { ChatView, type ChatMessage } from '../components/ChatView';
import { Badge, Button, Callout, Card, EmptyState, ErrorState, LevelBadge, PageHeader, Spinner, clsx, useDocumentTitle } from '../components/ui';

type Scenario = ScenarioDoc['scenarios'][number];

interface Feedback {
  source: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  corrections: { original: string; improved: string; explanation: string }[];
  usefulPhrases: { phrase: string; meaning: string }[];
  samples?: { prompt: string; sample: string }[];
  goalAchieved?: boolean;
  score?: number;
  note?: string;
}

function FeedbackPanel({ f }: { f: Feedback }) {
  return (
    <div className="animate-slide-up mt-5 space-y-3">
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Badge tone={f.source === 'ai' ? 'primary' : 'accent'}>{f.source === 'ai' ? 'AI feedback' : 'Automatic feedback'}</Badge>
          {f.goalAchieved !== undefined && <Badge tone={f.goalAchieved ? 'success' : 'neutral'}>{f.goalAchieved ? 'Goal achieved' : 'Goal not reached yet'}</Badge>}
        </div>
        <p className="text-[15px]">{f.summary}</p>
        {f.note && <p className="mt-2 text-xs text-muted">{f.note}</p>}
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {f.strengths.length > 0 && (
          <Card>
            <h4 className="mb-1 font-semibold text-success">What you did well</h4>
            <ul className="list-disc pl-5 text-sm">
              {f.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Card>
        )}
        {f.improvements.length > 0 && (
          <Card>
            <h4 className="mb-1 font-semibold text-accent">What to improve</h4>
            <ul className="list-disc pl-5 text-sm">
              {f.improvements.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      {f.corrections.length > 0 && (
        <Card>
          <h4 className="mb-2 font-semibold">Better ways to say it</h4>
          <ul className="space-y-2 text-sm">
            {f.corrections.map((c, i) => (
              <li key={i} className="rounded-xl bg-surface-2 p-3">
                <div className="text-danger line-through decoration-danger/40">{c.original}</div>
                <div className="font-semibold text-success">→ {c.improved}</div>
                <div className="text-muted">{c.explanation}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {f.samples && (
        <Card>
          <h4 className="mb-2 font-semibold">Sample answers</h4>
          <ul className="space-y-2 text-sm">
            {f.samples.map((s) => (
              <li key={s.prompt}>
                <div className="text-muted">{s.prompt}</div>
                <div className="font-medium">{s.sample}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {f.usefulPhrases.length > 0 && (
        <Card>
          <h4 className="mb-2 font-semibold">Useful phrases</h4>
          <div className="flex flex-wrap gap-1.5">
            {f.usefulPhrases.map((p) => (
              <span key={p.phrase} className="rounded-lg bg-primary-soft px-2.5 py-1 text-sm text-primary" title={p.meaning}>
                {p.phrase}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function Conversation() {
  const { settings } = useSettings();
  const qc = useQueryClient();
  const { reward } = useToast();
  const q = useQuery({ queryKey: ['scenarios'], queryFn: () => get<{ scenarios: Scenario[]; ai: boolean }>('/conversation/scenarios') });
  const [active, setActive] = useState<{ thread: Thread; scenario: Scenario } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle('Conversation practice');

  const levelIdx = COURSE_LEVELS.indexOf(settings?.courseLevel ?? 'B1');

  async function start(s: Scenario) {
    setError(null);
    const r = await post<{ thread: Thread; scenario: Scenario }>('/conversation/start', { scenarioId: s.id });
    setActive(r);
    setMessages(r.thread.messages.map((m) => ({ role: m.role, content: m.content })));
    // Each guided hint belongs to the prompt it follows; the opening line gets a general one.
    setHint(r.thread.guided ? 'Answer in one or two full sentences. There is no single right answer.' : null);
    setDone(false);
    setFeedback(null);
  }

  async function send(text: string) {
    if (!active) return;
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setStreaming('');
    try {
      const r = await postStream<{ reply: string; done: boolean; hint: string | null }>(`/conversation/${active.thread.id}/message`, { message: text }, (d) => setStreaming((s) => (s ?? '') + d));
      setMessages((m) => [...m, { role: 'assistant', content: r.reply }]);
      setHint(r.hint);
      if (r.done) setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStreaming(null);
    }
  }

  async function finish() {
    if (!active) return;
    setFinishing(true);
    try {
      const r = await post<ActivityResult & { feedback: Feedback }>(`/conversation/${active.thread.id}/finish`);
      setFeedback(r.feedback);
      reward(r);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFinishing(false);
    }
  }

  if (active) {
    const s = active.scenario;
    return (
      <div className="mx-auto max-w-3xl">
        <button type="button" onClick={() => setActive(null)} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-text">
          <ArrowLeft className="size-4" /> All scenarios
        </button>
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold">{s.title}</h1>
            <LevelBadge level={s.minLevel} />
            {active.thread.guided && <Badge tone="accent">Guided mode</Badge>}
          </div>
          <p className="mt-1 text-sm">{s.description}</p>
          <p className="mt-2 text-sm">
            <strong>Your goal:</strong> {s.learnerGoal}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {s.phrases.map((p) => (
              <span key={p} className="rounded-lg bg-surface-2 px-2 py-0.5 text-xs">
                {p}
              </span>
            ))}
          </div>
        </Card>
        {active.thread.guided && (
          <div className="mb-3">
            <Callout kind="info">Guided mode (no AI): your partner follows a script. Answer naturally in full sentences — feedback comes at the end.</Callout>
          </div>
        )}
        <ChatView
          messages={messages}
          streaming={streaming}
          onSend={send}
          busy={streaming !== null}
          voice
          disabled={!!feedback}
          placeholder="Your reply… (or tap the mic to speak)"
          footer={
            <>
              {hint && !feedback && (
                <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" /> {hint}
                </p>
              )}
              {!feedback && messages.some((m) => m.role === 'user') && (
                <div className="mt-3 text-right">
                  <Button variant={done ? 'primary' : 'secondary'} size="sm" icon={<Flag className="size-4" />} loading={finishing} onClick={finish}>
                    Finish & get feedback
                  </Button>
                </div>
              )}
            </>
          }
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {feedback && <FeedbackPanel f={feedback} />}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Conversation practice" subtitle="Role-play real situations. Your partner speaks at your level — feedback comes at the end, not in the middle." />
      {q.isLoading ? (
        <Spinner />
      ) : q.error || !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.scenarios.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="size-8" />} title="No scenarios installed" body="Add content/scenarios.json and restart the app." />
      ) : (
        <>
          {!q.data.ai && (
            <div className="mb-4">
              <Callout kind="info" title="Guided mode">
                Without an AI key, conversations follow a script with sample answers. Add an API key for free, adaptive conversations.
              </Callout>
            </div>
          )}
          <ul className="grid gap-3 sm:grid-cols-2">
            {q.data.scenarios.map((s) => {
              const above = COURSE_LEVELS.indexOf(s.minLevel) > levelIdx + 1;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => void start(s)}
                    className={clsx('flex h-full w-full flex-col items-start rounded-2xl bg-surface p-4 text-left ring-1 ring-border transition hover:ring-primary/60', above && 'opacity-70')}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="font-semibold">{s.title}</span>
                      <span className="flex items-center gap-1">
                        {above && <Lock className="size-3.5 text-muted" aria-label="Above your level" />}
                        <LevelBadge level={s.minLevel} />
                      </span>
                    </div>
                    <span className="mt-1 text-sm text-muted">{s.description}</span>
                    <span className="mt-2 text-xs font-semibold text-muted">{s.category}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
