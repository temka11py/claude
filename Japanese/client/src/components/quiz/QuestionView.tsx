import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import type { Question } from '../../api/types';
import { useI18n } from '../../i18n';
import { useAuth } from '../../hooks/useAuth';
import { playSource, stopAudio, ttsSupported } from '../../lib/speech';
import { categoryLabel } from '../../lib/labels';
import { Badge, cx } from '../ui';

const CHOICE_TYPES = new Set(['multiple_choice', 'kanji_reading', 'listening', 'fill_blank', 'ja_to_mn', 'mn_to_ja']);

export function isChoice(q: Question) {
  return CHOICE_TYPES.has(q.type) && Array.isArray(q.options) && q.options.length > 0;
}

export function isAnswered(q: Question, value: string | undefined) {
  if (!value) return false;
  if (q.type === 'matching') {
    try {
      return (JSON.parse(value) as string[]).every(Boolean);
    } catch {
      return false;
    }
  }
  return value.trim().length > 0;
}

export function AudioPrompt({ text, audioUrl, autoPlay }: { text: string; audioUrl?: string | null; autoPlay?: boolean }) {
  const { settings } = useAuth();
  const { L } = useI18n();
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const play = async () => {
    setPlaying(true);
    setPlays((p) => p + 1);
    await playSource({ audioUrl, text }, settings.speechRate);
    setPlaying(false);
  };
  useEffect(() => {
    if (autoPlay && settings.autoplayAudio) void play();
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  if (!ttsSupported && !audioUrl) {
    return <p className="rounded-xl bg-yamabuki-soft p-3 text-sm text-yamabuki">{L('Энэ хөтөч дуу гаргах (Speech Synthesis) боломжгүй байна. Chrome эсвэл Edge ашиглана уу.', 'This browser cannot play synthesized audio. Please use Chrome or Edge.')}</p>;
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-ai-soft p-3">
      <button onClick={play} disabled={playing} className="grid size-12 place-items-center rounded-full bg-ai text-white shadow-sm transition-opacity disabled:opacity-60" aria-label={L('Тоглуулах', 'Play')}>
        {plays > 0 && !playing ? <RotateCcw className="size-5" /> : <Play className="ml-0.5 size-5" />}
      </button>
      <div className="text-sm">
        <p className="font-medium text-ai">{playing ? L('Тоглуулж байна…', 'Playing…') : plays ? L('Дахин сонсох', 'Play again') : L('Сонсох', 'Listen')}</p>
        <p className="text-xs text-muted">{L(`${plays} удаа сонссон`, `Played ${plays}×`)}</p>
      </div>
    </div>
  );
}

function instruction(q: Question, L: (mn: string, en: string) => string) {
  switch (q.type) {
    case 'fill_blank':
      return L('（　）-д тохирох хариултыг сонгоно уу.', 'Choose the word that fits the blank.');
    case 'true_false':
      return L('Үнэн үү, худал уу?', 'True or false?');
    case 'typing':
      return L('Хариултаа бичнэ үү.', 'Type your answer.');
    case 'listening':
      return L('Сонсоод зөв хариултыг сонгоно уу.', 'Listen and choose the correct answer.');
    case 'ja_to_mn':
      return isChoice(q) ? L('Зөв утгыг сонгоно уу.', 'Choose the correct meaning.') : L('Монгол хэл рүү орчуулна уу.', 'Translate into Mongolian.');
    case 'mn_to_ja':
      return isChoice(q) ? L('Зөв хариултыг сонгоно уу.', 'Choose the correct answer.') : L('Япон хэл рүү орчуулна уу.', 'Translate into Japanese.');
    default:
      return L('Зөв хариултыг сонгоно уу.', 'Choose the correct answer.');
  }
}

function Choices({ q, value, onChange, disabled }: { q: Question; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const options = q.options as string[];
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) onChange(options[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options, onChange, disabled]);
  const long = options.some((o) => o.length > 18);
  return (
    <div className={cx('grid gap-2.5', !long && 'sm:grid-cols-2')} role="radiogroup">
      {options.map((opt, i) => (
        <button
          key={opt}
          role="radio"
          aria-checked={value === opt}
          disabled={disabled}
          onClick={() => onChange(opt)}
          className={cx(
            'flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3 text-left text-base transition-colors',
            value === opt ? 'border-shu bg-shu-soft text-ink' : 'border-line bg-surface hover:border-ink-2/40 hover:bg-surface-2',
          )}
        >
          <span className={cx('grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold', value === opt ? 'bg-shu text-white' : 'bg-surface-2 text-muted')}>{i + 1}</span>
          <span className="min-w-0 break-words">{opt}</span>
        </button>
      ))}
    </div>
  );
}

function TrueFalse({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { L } = useI18n();
  const opts: [string, string][] = [
    ['true', L('Үнэн', 'True')],
    ['false', L('Худал', 'False')],
  ];
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup">
      {opts.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cx('h-14 rounded-xl border text-base font-medium transition-colors', value === v ? 'border-shu bg-shu-soft text-shu' : 'border-line bg-surface hover:bg-surface-2')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Matching({ q, value, onChange, disabled }: { q: Question; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { L } = useI18n();
  const { left, right } = q.options as { left: string[]; right: string[] };
  const pairs: string[] = useMemo(() => {
    try {
      const parsed = JSON.parse(value) as string[];
      return left.map((_, i) => parsed[i] ?? '');
    } catch {
      return left.map(() => '');
    }
  }, [value, left]);
  const [active, setActive] = useState(0);
  const assign = (r: string) => {
    const next = pairs.map((p) => (p === r ? '' : p));
    next[active] = r;
    onChange(JSON.stringify(next));
    const empty = next.findIndex((p, i) => !p && i !== active);
    if (empty >= 0) setActive(empty);
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        {left.map((l, i) => (
          <button
            key={l}
            disabled={disabled}
            onClick={() => setActive(i)}
            className={cx('flex min-h-12 items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left transition-colors', active === i ? 'border-ai bg-ai-soft' : 'border-line bg-surface hover:bg-surface-2')}
          >
            <span className="jp text-lg">{l}</span>
            <span className={cx('text-right text-sm', pairs[i] ? 'text-ink' : 'text-muted')}>{pairs[i] || L('сонгоно уу', 'choose')}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">{L('Зүүн талын үгийг сонгоод, утгыг нь дарна уу:', 'Select a word on the left, then tap its meaning:')}</p>
        {right.map((r) => {
          const used = pairs.includes(r);
          return (
            <button
              key={r}
              disabled={disabled}
              onClick={() => assign(r)}
              className={cx('min-h-11 rounded-xl border px-4 py-2 text-left text-sm transition-colors', used ? 'border-line bg-surface-2 text-muted' : 'border-line bg-surface hover:border-ai hover:bg-ai-soft')}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FreeText({ q, value, onChange, disabled, onEnter }: { q: Question; value: string; onChange: (v: string) => void; disabled?: boolean; onEnter?: () => void }) {
  const { L } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [q.id]);
  const placeholder =
    q.type === 'typing'
      ? L('ромаджиар бичнэ үү (жишээ нь: ka)', 'type in romaji (e.g. ka)')
      : q.type === 'ja_to_mn'
        ? L('Монгол орчуулгаа бичнэ үү…', 'Write the Mongolian translation…')
        : L('Япон хэлээр бичнэ үү (хирагана, ханз)…', 'Write in Japanese (kana or kanji)…');
  return (
    <textarea
      ref={ref}
      value={value}
      disabled={disabled}
      rows={q.type === 'typing' ? 1 : 3}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter?.();
        }
      }}
      placeholder={placeholder}
      lang={q.type === 'mn_to_ja' ? 'ja' : undefined}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      className={cx('w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-lg text-ink outline-none transition-colors focus:border-shu', q.type === 'mn_to_ja' && 'jp')}
    />
  );
}

export default function QuestionView({
  q,
  value,
  onChange,
  disabled,
  showAudio = true,
  onEnter,
}: {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  showAudio?: boolean;
  onEnter?: () => void;
}) {
  const { L, lang } = useI18n();
  const freeText = !isChoice(q) && q.type !== 'true_false' && q.type !== 'matching';
  const bigPrompt = q.prompt.length <= 30 && /[぀-ヿ一-龯]/.test(q.prompt) && (freeText || q.type === 'ja_to_mn');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="ai">{categoryLabel(q.category, lang)}</Badge>
        <span className="text-xs text-muted">{instruction(q, L)}</span>
      </div>
      {q.audioText && showAudio && <AudioPrompt key={q.id} text={q.audioText} audioUrl={q.audioUrl} autoPlay />}
      {q.passage && <div className="jp whitespace-pre-line rounded-2xl border border-line bg-surface-2 p-4 text-[15px] leading-8 text-ink">{q.passage}</div>}
      <p className={cx('break-words text-ink', bigPrompt ? 'jp text-2xl font-medium leading-relaxed sm:text-3xl' : 'text-lg font-medium leading-relaxed')}>{q.prompt}</p>
      {q.type === 'true_false' ? (
        <TrueFalse value={value} onChange={onChange} disabled={disabled} />
      ) : q.type === 'matching' ? (
        <Matching q={q} value={value} onChange={onChange} disabled={disabled} />
      ) : isChoice(q) ? (
        <Choices q={q} value={value} onChange={onChange} disabled={disabled} />
      ) : (
        <FreeText q={q} value={value} onChange={onChange} disabled={disabled} onEnter={onEnter} />
      )}
    </div>
  );
}
