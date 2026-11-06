import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Plus, Trash } from 'lucide-react';
import { del, get, postStream } from '../lib/api';
import { useAuth } from '../lib/context';
import type { Thread } from '../lib/types';
import { ChatView, type ChatMessage } from '../components/ChatView';
import { Button, Callout, PageHeader, clsx, useDocumentTitle } from '../components/ui';

const SUGGESTIONS = [
  'What does "significant" mean? Give me examples.',
  'Why is "I am agree" wrong?',
  'Can you explain the present perfect in Mongolian?',
  'Give me another example of the second conditional.',
  'Correct my paragraph: ',
  'Ask me B2 questions about work, one at a time.',
  "Let's practise speaking about my weekend.",
];

interface ThreadSummary {
  id: number;
  title: string;
  updatedAt: string;
}

export default function Tutor() {
  const { status } = useAuth();
  const qc = useQueryClient();
  const threads = useQuery({ queryKey: ['tutor-threads'], queryFn: () => get<ThreadSummary[]>('/tutor/threads') });
  const [threadId, setThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<string | null>(null);
  useDocumentTitle('AI tutor');
  const aiOn = status?.ai.available;

  async function open(id: number) {
    const t = await get<Thread>(`/tutor/threads/${id}`);
    setThreadId(id);
    setMessages(t.messages.map((m) => ({ role: m.role, content: m.content })));
  }

  async function send(text: string) {
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setStreaming('');
    try {
      const res = await postStream<{ threadId: number; reply: string }>('/tutor/message', { threadId, message: text }, (delta) => setStreaming((s) => (s ?? '') + delta));
      setThreadId(res.threadId);
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
      void qc.invalidateQueries({ queryKey: ['tutor-threads'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStreaming(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
      <div>
        <PageHeader title="AI tutor" subtitle="Ask about words, grammar, your writing — or practise. The tutor knows your level and your recent mistakes." />
        {!aiOn && (
          <div className="mb-4">
            <Callout kind="warning" title="Offline mode">
              No AI key is configured, so the tutor can look up course words, check sentences for common mistakes and show grammar topics. Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> for full
              conversations.
            </Callout>
          </div>
        )}
        {messages.length === 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => (s.endsWith(': ') ? setPrefill(s) : void send(s))} className="rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-border hover:ring-primary">
                {s}
              </button>
            ))}
          </div>
        )}
        {prefill && messages.length === 0 && <Callout kind="tip">Paste your paragraph after “Correct my paragraph:” in the box below.</Callout>}
        <ChatView
          key={`${threadId}-${prefill}`}
          messages={messages}
          streaming={streaming}
          onSend={send}
          busy={streaming !== null}
          voice
          placeholder={prefill ?? 'Ask anything about English…'}
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
      <aside className="space-y-2">
        <Button
          block
          variant="secondary"
          icon={<Plus className="size-4" />}
          onClick={() => {
            setThreadId(null);
            setMessages([]);
            setPrefill(null);
          }}
        >
          New chat
        </Button>
        <ul className="space-y-1">
          {(threads.data ?? []).map((t) => (
            <li key={t.id} className="group flex items-center gap-1">
              <button type="button" onClick={() => void open(t.id)} className={clsx('flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2', t.id === threadId && 'bg-surface-2 font-semibold')}>
                <MessageSquare className="size-3.5 shrink-0 text-muted" />
                <span className="truncate">{t.title}</span>
              </button>
              <button
                type="button"
                aria-label={`Delete chat: ${t.title}`}
                className="rounded p-1.5 text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
                onClick={async () => {
                  await del(`/tutor/threads/${t.id}`);
                  if (t.id === threadId) {
                    setThreadId(null);
                    setMessages([]);
                  }
                  void qc.invalidateQueries({ queryKey: ['tutor-threads'] });
                }}
              >
                <Trash className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
