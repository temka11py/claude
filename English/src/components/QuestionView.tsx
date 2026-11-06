import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, CircleCheck, CircleX } from 'lucide-react';
import { checkAnswer, type AnswerValue, type CheckResult } from '@shared/scoring';
import { seededRandom, shuffle } from '@shared/text';
import type { Question } from '@shared/contentSchema';
import { Button, Mn, clsx } from './ui';

/** A question as used in the browser: full (practice) or with answers stripped (tests). */
export type AnyQuestion = Question & { id: string; skill?: string; level?: string } & Record<string, unknown>;

export interface Answered {
  value: AnswerValue;
  result: CheckResult;
}

// ------------------------------------------------------------------ prompt text

/** Render a prompt, turning ___ into a visible blank (optionally filled). */
export function PromptText({ text, fill, className }: { text: string; fill?: string | null; className?: string }) {
  const lines = text.split('\n');
  return (
    <div className={clsx('text-[17px] leading-relaxed font-medium', className)}>
      {lines.map((line, li) => (
        <p key={li} className={li > 0 ? 'mt-1 text-[15px] font-normal text-muted' : ''}>
          {line.split(/(_{3,})/).map((part, i) =>
            /^_{3,}$/.test(part) ? (
              <span key={i} className={clsx('mx-1 inline-block min-w-16 border-b-2 px-1 text-center', fill ? 'border-primary text-primary' : 'border-muted/60')}>
                {fill || ' '}
              </span>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ tiles (words & order)

function TileBuilder({ tiles, value, onChange, disabled, vertical }: { tiles: string[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean; vertical?: boolean }) {
  // Track by index so repeated words work.
  const [used, setUsed] = useState<number[]>([]);
  useEffect(() => {
    if (value.length === 0) setUsed([]);
  }, [value.length]);
  const add = (i: number) => {
    if (disabled || used.includes(i)) return;
    const nu = [...used, i];
    setUsed(nu);
    onChange(nu.map((x) => tiles[x]));
  };
  const remove = (pos: number) => {
    if (disabled) return;
    const nu = used.filter((_, p) => p !== pos);
    setUsed(nu);
    onChange(nu.map((x) => tiles[x]));
  };
  const tileCls = 'rounded-xl bg-surface px-3 py-2 text-[15px] font-medium ring-1 ring-border transition hover:ring-primary active:scale-95 text-left';
  return (
    <div className="space-y-3">
      <div
        className={clsx('min-h-14 rounded-2xl border-2 border-dashed border-border p-2', vertical ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2')}
        aria-label="Your answer"
      >
        {used.length === 0 && <span className="self-center px-2 text-sm text-muted">Tap the {vertical ? 'items in the right order' : 'words to build the sentence'}</span>}
        {used.map((ti, pos) => (
          <button key={`${ti}-${pos}`} type="button" onClick={() => remove(pos)} className={clsx(tileCls, 'bg-primary-soft ring-primary/40')} aria-label={`Remove ${tiles[ti]}`}>
            {vertical && <span className="mr-2 font-bold text-primary">{pos + 1}.</span>}
            {tiles[ti]}
          </button>
        ))}
      </div>
      <div className={clsx(vertical ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2')}>
        {tiles.map((t, i) =>
          used.includes(i) ? (
            <span key={i} className={clsx(tileCls, 'opacity-25')} aria-hidden>
              {t}
            </span>
          ) : (
            <button key={i} type="button" onClick={() => add(i)} className={tileCls} disabled={disabled}>
              {t}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ matching

function MatchBoard({ left, right, value, onChange, disabled, result }: { left: string[]; right: string[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean; result?: boolean[] }) {
  const [active, setActive] = useState<number | null>(null);
  const pairOf = (r: string) => value.findIndex((v) => v === r);
  const colors = ['bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500'];
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      <div className="space-y-2">
        {left.map((l, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => setActive(active === i ? null : i)}
            className={clsx(
              'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[15px] ring-1 transition',
              active === i ? 'bg-primary-soft ring-2 ring-primary' : 'bg-surface ring-border hover:ring-primary/60',
              result && (result[i] ? 'ring-success' : 'ring-danger'),
            )}
            aria-pressed={active === i}
          >
            {value[i] && <span className={clsx('size-2.5 shrink-0 rounded-full', colors[i % colors.length])} aria-hidden />}
            <span>{l}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {right.map((r, j) => {
          const p = pairOf(r);
          return (
            <button
              key={j}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (active === null) {
                  if (p >= 0) onChange(value.map((v, k) => (k === p ? '' : v)));
                  return;
                }
                const next = value.map((v) => (v === r ? '' : v));
                next[active] = r;
                onChange(next);
                setActive(null);
              }}
              className={clsx('flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[15px] ring-1 transition', p >= 0 ? 'bg-surface-2 ring-border' : 'bg-surface ring-border hover:ring-primary/60')}
            >
              {p >= 0 && <span className={clsx('size-2.5 shrink-0 rounded-full', colors[p % colors.length])} aria-hidden />}
              <span>{r}</span>
            </button>
          );
        })}
      </div>
      <p className="col-span-2 text-xs text-muted">Tap an item on the left, then its match on the right.</p>
    </div>
  );
}

// ------------------------------------------------------------------ main view

function optionKey(i: number) {
  return String.fromCharCode(65 + i);
}

// Choices are shown in a shuffled order (stable for one page load) so the right answer
// isn't always in the same place. Answers keep their original indexes everywhere else.
const CHOICE_SALT = Math.random().toString(36).slice(2);

function needsSubmit(q: AnyQuestion): boolean {
  return !(q.type === 'mcq' || q.type === 'tfng' || q.type === 'error' || (q.type === 'gap' && Array.isArray(q.options)));
}

export interface QuestionViewProps {
  question: AnyQuestion;
  mode: 'practice' | 'test';
  value?: AnswerValue;
  onChange?: (v: AnswerValue) => void;
  onAnswered?: (a: Answered) => void;
  footer?: ReactNode;
}

export function QuestionView({ question: q, mode, value: controlled, onChange, onAnswered, footer }: QuestionViewProps) {
  const [local, setLocal] = useState<AnswerValue>(q.type === 'correct' ? (q.sentence as string) : null);
  const value = controlled !== undefined ? controlled : local;
  const [result, setResult] = useState<CheckResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const random = useMemo(() => seededRandom(q.id), [q.id]);

  useEffect(() => {
    setResult(null);
    setLocal(q.type === 'correct' ? (q.sentence as string) : null);
  }, [q.id, q.type, q.sentence]);

  const orderItems = useMemo(() => (q.type === 'order' ? shuffle(q.items as string[], random) : []), [q, random]);
  const wordTiles = useMemo(() => {
    if (q.type !== 'words') return [];
    const tiles = (q.tiles as string[] | undefined) ?? [...String(q.answer).split(/\s+/), ...((q.distractors as string[] | undefined) ?? [])];
    return shuffle(tiles, random);
  }, [q, random]);
  const matchLeft = useMemo(() => (q.type === 'match' ? ((q.left as string[] | undefined) ?? (q.pairs as [string, string][]).map((p) => p[0])) : []), [q]);
  const matchRight = useMemo(() => (q.type === 'match' ? shuffle((q.right as string[] | undefined) ?? (q.pairs as [string, string][]).map((p) => p[1]), random) : []), [q, random]);
  const choiceOrder = useMemo(() => {
    const n = Array.isArray(q.options) ? q.options.length : 0;
    return shuffle(Array.from({ length: n }, (_, i) => i), seededRandom(`${q.id}:${CHOICE_SALT}`));
  }, [q.id, q.options]);

  const done = result !== null;
  const set = (v: AnswerValue, autoCheck = false) => {
    if (done) return;
    if (controlled === undefined) setLocal(v);
    onChange?.(v);
    if (autoCheck && mode === 'practice') check(v);
  };

  function check(v: AnswerValue = value) {
    if (mode !== 'practice' || done) return;
    const r = checkAnswer(q as Question, v);
    setResult(r);
    onAnswered?.({ value: v, result: r });
  }

  // Keyboard shortcuts for choices: 1–6.
  useEffect(() => {
    if (done) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      const n = Number(e.key);
      if (!n) return;
      if (q.type === 'mcq' && n <= choiceOrder.length) set(choiceOrder[n - 1], true);
      if (q.type === 'tfng') set((['true', 'false', 'not_given'] as const)[n - 1] ?? null, true);
      if (q.type === 'gap' && Array.isArray(q.options) && n <= choiceOrder.length) set((q.options as string[])[choiceOrder[n - 1]], true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const choiceCls = (selected: boolean, i: number, correctIndex?: number) =>
    clsx(
      'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] ring-1 transition active:scale-[0.99]',
      !done && (selected ? 'bg-primary-soft ring-2 ring-primary' : 'bg-surface ring-border hover:ring-primary/60'),
      done && correctIndex === i && 'bg-success-soft ring-2 ring-success',
      done && selected && correctIndex !== i && 'bg-danger-soft ring-2 ring-danger animate-shake',
      done && !selected && correctIndex !== i && 'bg-surface opacity-60 ring-border',
    );

  const correctIndexFor = (): number | undefined => {
    if (!done) return undefined;
    if (q.type === 'mcq') return q.answer as number;
    if (q.type === 'tfng') return ['true', 'false', 'not_given'].indexOf(q.answer as string);
    if (q.type === 'gap' && Array.isArray(q.options)) return (q.options as string[]).findIndex((o) => (q.answers as string[]).some((a) => a.toLowerCase() === o.toLowerCase()));
    if (q.type === 'error') return q.wrongIndex as number;
    return undefined;
  };

  let body: ReactNode;
  switch (q.type) {
    case 'mcq':
      body = (
        <>
          <PromptText text={q.prompt} fill={done && typeof value === 'number' ? (q.options as string[])[value] : null} />
          <div className="mt-4 space-y-2" role="radiogroup">
            {choiceOrder.map((i, pos) => (
              <button key={i} type="button" role="radio" aria-checked={value === i} className={choiceCls(value === i, i, correctIndexFor())} onClick={() => set(i, true)} disabled={done}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-bold text-muted">{optionKey(pos)}</span>
                <span>{(q.options as string[])[i]}</span>
              </button>
            ))}
          </div>
        </>
      );
      break;
    case 'tfng': {
      const opts = q.notGiven === false ? (['true', 'false'] as const) : (['true', 'false', 'not_given'] as const);
      body = (
        <>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">True, false{q.notGiven === false ? '' : ' or not given'}?</div>
          <PromptText text={q.prompt} />
          <div className={clsx('mt-4 grid gap-2', opts.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {opts.map((o, i) => (
              <button key={o} type="button" className={clsx(choiceCls(value === o, i, correctIndexFor()), 'justify-center font-semibold')} onClick={() => set(o, true)} disabled={done}>
                {o === 'not_given' ? 'Not given' : o === 'true' ? 'True' : 'False'}
              </button>
            ))}
          </div>
        </>
      );
      break;
    }
    case 'gap':
      if (Array.isArray(q.options)) {
        body = (
          <>
            <PromptText text={q.prompt} fill={typeof value === 'string' ? value : null} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {choiceOrder.map((i) => {
                const o = (q.options as string[])[i];
                return (
                  <button key={i} type="button" className={clsx(choiceCls(value === o, i, correctIndexFor()), 'justify-center')} onClick={() => set(o, true)} disabled={done}>
                    {o}
                  </button>
                );
              })}
            </div>
          </>
        );
      } else {
        body = (
          <>
            <PromptText text={q.prompt} fill={typeof value === 'string' && value ? value : null} />
            <input
              ref={inputRef}
              className="mt-4 h-12 w-full rounded-xl bg-surface px-4 text-[17px] ring-1 ring-border focus:ring-2 focus:ring-primary focus:outline-none"
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => set(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && typeof value === 'string' && value.trim() && check()}
              placeholder="Type the missing word(s)"
              aria-label="Your answer"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              disabled={done}
            />
          </>
        );
      }
      break;
    case 'short':
      body = (
        <>
          <PromptText text={q.prompt} />
          <input
            className="mt-4 h-12 w-full rounded-xl bg-surface px-4 text-[16px] ring-1 ring-border focus:ring-2 focus:ring-primary focus:outline-none"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => set(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && typeof value === 'string' && value.trim() && check()}
            placeholder="Your answer"
            aria-label="Your answer"
            disabled={done}
          />
        </>
      );
      break;
    case 'correct':
    case 'transform':
      body = (
        <>
          <PromptText text={q.prompt} />
          <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-[16px]">
            {q.type === 'correct' ? <span className="text-danger">✗ </span> : null}
            {q.sentence as string}
          </div>
          {q.type === 'transform' && q.keyword && (
            <div className="mt-2 text-sm text-muted">
              Use: <span className="rounded bg-accent-soft px-2 py-0.5 font-bold uppercase text-accent">{q.keyword as string}</span>
            </div>
          )}
          <textarea
            className="mt-3 w-full rounded-xl bg-surface p-3.5 text-[16px] ring-1 ring-border focus:ring-2 focus:ring-primary focus:outline-none"
            rows={2}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => set(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), typeof value === 'string' && value.trim() && check())}
            aria-label="Your rewritten sentence"
            disabled={done}
          />
        </>
      );
      break;
    case 'order':
      body = (
        <>
          <PromptText text={q.prompt} />
          <div className="mt-4">
            <TileBuilder tiles={orderItems} value={Array.isArray(value) ? value : []} onChange={(v) => set(v)} disabled={done} vertical />
          </div>
        </>
      );
      break;
    case 'words':
      body = (
        <>
          <PromptText text={q.prompt} />
          <div className="mt-4">
            <TileBuilder tiles={wordTiles} value={Array.isArray(value) ? value : []} onChange={(v) => set(v)} disabled={done} />
          </div>
        </>
      );
      break;
    case 'match': {
      const v = Array.isArray(value) ? value : new Array(matchLeft.length).fill('');
      const pairs = q.pairs as [string, string][] | undefined;
      body = (
        <>
          <PromptText text={q.prompt} />
          <div className="mt-4">
            <MatchBoard left={matchLeft} right={matchRight} value={v} onChange={(nv) => set(nv)} disabled={done} result={done && pairs ? pairs.map(([, r], i) => v[i] === r) : undefined} />
          </div>
        </>
      );
      break;
    }
    case 'error':
      body = (
        <>
          <PromptText text={q.prompt} />
          <div className="mt-4 flex flex-wrap gap-2">
            {(q.segments as string[]).map((s, i) => (
              <button key={i} type="button" className={clsx(choiceCls(value === i, i, correctIndexFor()), 'w-auto')} onClick={() => set(i, true)} disabled={done}>
                {s}
              </button>
            ))}
          </div>
          {done && q.correction && (
            <p className="mt-3 text-sm">
              Correct version: <strong>{q.correction as string}</strong>
            </p>
          )}
        </>
      );
      break;
    case 'summary': {
      const parts = String(q.text).split(/(\{\d+\})/);
      const gaps = parts.filter((p) => /^\{\d+\}$/.test(p)).length;
      const v = Array.isArray(value) ? value : new Array(gaps).fill('');
      body = (
        <>
          <PromptText text={q.prompt} className="text-[15px]" />
          <div className="mt-3 rounded-xl bg-surface-2 p-4 text-[16px] leading-[2.4]">
            {parts.map((p, i) => {
              const m = /^\{(\d+)\}$/.exec(p);
              if (!m) return <span key={i}>{p}</span>;
              const gi = Number(m[1]) - 1;
              const ok = done && q.answers ? String(v[gi] ?? '').toLowerCase() === String((q.answers as string[])[gi]).toLowerCase() : null;
              return (
                <select
                  key={i}
                  value={v[gi] ?? ''}
                  onChange={(e) => {
                    const nv = [...v];
                    nv[gi] = e.target.value;
                    set(nv);
                  }}
                  disabled={done}
                  aria-label={`Gap ${gi + 1}`}
                  className={clsx('mx-1 rounded-lg bg-surface px-2 py-1 text-[15px] ring-1', ok === null ? 'ring-border' : ok ? 'ring-2 ring-success' : 'ring-2 ring-danger')}
                >
                  <option value="">({gi + 1}) choose…</option>
                  {(q.bank as string[]).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              );
            })}
          </div>
        </>
      );
      break;
    }
  }

  const hasValue = value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.every((x) => !x));

  return (
    <div className="animate-fade-in">
      {body}
      {mode === 'practice' && !done && needsSubmit(q) && (
        <div className="mt-5">
          <Button onClick={() => check()} disabled={!hasValue} block size="lg" icon={<Check className="size-5" />}>
            Check
          </Button>
        </div>
      )}
      {done && result && <Feedback result={result} question={q} />}
      {footer}
    </div>
  );
}

export function Feedback({ result, question }: { result: CheckResult; question: AnyQuestion }) {
  const good = result.correct;
  const partial = !good && result.score > 0;
  return (
    <div
      className={clsx('animate-pop mt-5 rounded-2xl p-4 ring-1', good ? 'bg-success-soft ring-success/30' : partial ? 'bg-warning-soft ring-warning/30' : 'bg-danger-soft ring-danger/25')}
      role="status"
    >
      <div className={clsx('flex items-center gap-2 font-semibold', good ? 'text-success' : partial ? 'text-warning' : 'text-danger')}>
        {good ? <CircleCheck className="size-5" /> : partial ? <CircleCheck className="size-5" /> : <CircleX className="size-5" />}
        {good ? 'Correct!' : result.feedback === 'almost' ? 'Almost — check the spelling.' : partial ? `Partly right (${Math.round(result.score * 100)}%)` : 'Not quite yet.'}
      </div>
      {!good && (
        <p className="mt-1.5 text-[15px]">
          Answer: <strong>{result.expected}</strong>
        </p>
      )}
      {question.explanation && <p className="mt-1.5 text-sm">{question.explanation as string}</p>}
      <Mn>{question.explanationMn as string | undefined}</Mn>
    </div>
  );
}

