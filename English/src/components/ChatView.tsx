import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Bot, Mic, Send, Square, User } from 'lucide-react';
import { useSpeechRecorder } from '../lib/speech';
import { say } from '../lib/tts';
import { Button, SpeakButton, clsx } from './ui';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Minimal, safe Markdown: **bold**, _italic_, bullet lines. Text is rendered as text nodes (no HTML injection). */
export function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const inline = (s: string, key: string) =>
    s.split(/(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)/g).map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>;
      if (/^(_[^_]+_|\*[^*]+\*)$/.test(part)) return <em key={`${key}-${i}`}>{part.slice(1, -1)}</em>;
      return <span key={`${key}-${i}`}>{part}</span>;
    });
  const flush = (i: number) => {
    if (list.length) {
      out.push(
        <ul key={`ul${i}`} className="my-1 list-disc space-y-0.5 pl-5">
          {list}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((line, i) => {
    const m = /^\s*[-•*]\s+(.*)$/.exec(line);
    if (m) {
      list.push(<li key={i}>{inline(m[1], `l${i}`)}</li>);
      return;
    }
    flush(i);
    if (/^#{1,3}\s/.test(line)) out.push(<p key={i} className="mt-2 font-semibold">{inline(line.replace(/^#+\s/, ''), `h${i}`)}</p>);
    else if (line.trim()) out.push(<p key={i} className="my-1">{inline(line, `p${i}`)}</p>);
  });
  flush(lines.length);
  return <div className="text-[15px] leading-relaxed">{out}</div>;
}

export function ChatView({
  messages,
  streaming,
  onSend,
  busy,
  placeholder = 'Type a message…',
  footer,
  voice,
  disabled,
}: {
  messages: ChatMessage[];
  streaming?: string | null;
  onSend: (text: string) => void;
  busy: boolean;
  placeholder?: string;
  footer?: ReactNode;
  voice?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const rec = useSpeechRecorder();
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streaming]);
  useEffect(() => {
    if (rec.state === 'recording') setText([rec.transcript, rec.interim].filter(Boolean).join(' '));
  }, [rec.transcript, rec.interim, rec.state]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy || disabled) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="flex flex-col">
      <div className="space-y-3" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={clsx('flex gap-2', m.role === 'user' && 'flex-row-reverse')}>
            <span className={clsx('flex size-8 shrink-0 items-center justify-center rounded-full', m.role === 'user' ? 'bg-primary text-on-primary' : 'bg-surface-2 text-primary')}>
              {m.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
            </span>
            <div className={clsx('max-w-[85%] rounded-2xl px-4 py-2.5', m.role === 'user' ? 'bg-primary-soft' : 'bg-surface ring-1 ring-border')}>
              {m.role === 'assistant' ? <RichText text={m.content} /> : <p className="whitespace-pre-line text-[15px]">{m.content}</p>}
              {m.role === 'assistant' && voice && m.content.length < 600 && (
                <div className="mt-1 flex justify-end">
                  <SpeakButton text={m.content.replace(/[*_#]/g, '')} size="sm" label="Listen to this message" />
                </div>
              )}
            </div>
          </div>
        ))}
        {streaming !== null && streaming !== undefined && (
          <div className="flex gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
              <Bot className="size-4" />
            </span>
            <div className="max-w-[85%] rounded-2xl bg-surface px-4 py-2.5 ring-1 ring-border">
              {streaming ? <RichText text={streaming} /> : <span className="inline-flex gap-1 py-2" aria-label="Thinking"><span className="size-2 animate-bounce rounded-full bg-muted" /><span className="size-2 animate-bounce rounded-full bg-muted [animation-delay:120ms]" /><span className="size-2 animate-bounce rounded-full bg-muted [animation-delay:240ms]" /></span>}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      {footer}
      <form onSubmit={submit} className="sticky bottom-20 mt-4 flex items-end gap-2 rounded-2xl bg-surface p-2 ring-1 ring-border lg:bottom-4">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] focus:outline-none"
        />
        {voice && rec.canTranscribe && (
          <button
            type="button"
            onClick={() => (rec.state === 'recording' ? void rec.stop() : void rec.start())}
            className={clsx('flex size-11 shrink-0 items-center justify-center rounded-xl', rec.state === 'recording' ? 'bg-danger text-white' : 'bg-surface-2 text-muted hover:text-text')}
            aria-label={rec.state === 'recording' ? 'Stop dictating' : 'Speak your message'}
          >
            {rec.state === 'recording' ? <Square className="size-4" /> : <Mic className="size-5" />}
          </button>
        )}
        <Button type="submit" size="md" loading={busy} disabled={!text.trim() || disabled} aria-label="Send" icon={<Send className="size-4" />} />
      </form>
    </div>
  );
}

export { say };
