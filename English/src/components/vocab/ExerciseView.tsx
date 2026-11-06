import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, CircleCheck, CircleX, Eye, Volume2 } from 'lucide-react';
import { levenshtein, normalizeAnswer, normalizeWord } from '@shared/text';
import { MODE_LABEL } from '@shared/vocabExercises';
import type { VocabExercise } from '../../lib/types';
import { say } from '../../lib/tts';
import { Button, Mn, SpeakButton, clsx } from '../ui';
import { PromptText } from '../QuestionView';
import { Highlighted } from './WordCard';

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface ExerciseResult {
  correct: boolean;
  grade: Grade;
  responseMs: number;
}

function Reveal({ ex, good }: { ex: VocabExercise; good: boolean | null }) {
  return (
    <div
      className={clsx(
        'animate-pop mt-5 rounded-2xl p-4 ring-1',
        good === null ? 'bg-surface-2 ring-border' : good ? 'bg-success-soft ring-success/30' : 'bg-danger-soft ring-danger/25',
      )}
      role="status"
    >
      {good !== null && (
        <div className={clsx('mb-2 flex items-center gap-2 font-semibold', good ? 'text-success' : 'text-danger')}>
          {good ? <CircleCheck className="size-5" /> : <CircleX className="size-5" />}
          {good ? 'Correct!' : "Not quite yet — let's remember this one."}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold">{ex.reveal.word}</span>
        {ex.reveal.ipa && <span className="font-mono text-xs text-muted">{ex.reveal.ipa}</span>}
        <SpeakButton text={ex.reveal.word} size="sm" />
      </div>
      <p className="mt-1 text-[15px]">{ex.reveal.definition}</p>
      <Mn>{ex.reveal.mongolian}</Mn>
      {ex.reveal.example && (
        <p className="mt-2 text-sm italic text-muted">
          <Highlighted text={ex.reveal.example} word={ex.reveal.word} />
        </p>
      )}
    </div>
  );
}

const GRADES: { grade: Grade; label: string; hint: string; cls: string }[] = [
  { grade: 'again', label: 'Again', hint: "I didn't know", cls: 'bg-danger-soft text-danger ring-danger/30' },
  { grade: 'hard', label: 'Hard', hint: 'With effort', cls: 'bg-warning-soft text-warning ring-warning/30' },
  { grade: 'good', label: 'Good', hint: 'I knew it', cls: 'bg-success-soft text-success ring-success/30' },
  { grade: 'easy', label: 'Easy', hint: 'Too easy', cls: 'bg-primary-soft text-primary ring-primary/30' },
];

function Flashcard({ ex, onDone }: { ex: Extract<VocabExercise, { kind: 'flashcard' }>; onDone: (g: Grade) => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ['1', '2', '3', '4'].includes(e.key)) onDone(GRADES[Number(e.key) - 1].grade);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  return (
    <div className="perspective">
      <div className="rounded-2xl bg-surface-2 px-5 py-8 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">What does it mean?</div>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className="text-3xl font-bold tracking-tight">{ex.word}</span>
          <SpeakButton text={ex.word} size="sm" />
        </div>
        {ex.pos && <div className="mt-1 text-sm italic text-muted">{ex.pos}</div>}
      </div>
      {!shown ? (
        <Button className="mt-5" block size="lg" variant="secondary" icon={<Eye className="size-5" />} onClick={() => setShown(true)}>
          Show answer
        </Button>
      ) : (
        <div className="animate-flip">
          <Reveal ex={ex} good={null} />
          {ex.collocations.length > 0 && <p className="mt-2 text-sm text-muted">Collocations: {ex.collocations.join(' · ')}</p>}
          <div className="mt-5 grid grid-cols-4 gap-2">
            {GRADES.map((g, i) => (
              <button key={g.grade} type="button" onClick={() => onDone(g.grade)} className={clsx('rounded-xl px-1 py-2.5 text-center ring-1 transition active:scale-95', g.cls)}>
                <div className="text-sm font-bold">{g.label}</div>
                <div className="hidden text-[11px] opacity-80 sm:block">{g.hint}</div>
                <span className="sr-only">(key {i + 1})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function checkTyped(given: string, answers: string[]): { correct: boolean; almost: boolean } {
  const g = normalizeAnswer(given);
  for (const a of answers) if (normalizeAnswer(a) === g) return { correct: true, almost: false };
  const best = Math.min(...answers.map((a) => levenshtein(normalizeWord(a), normalizeWord(given))));
  const len = Math.min(...answers.map((a) => a.length));
  return { correct: false, almost: len >= 5 && best <= 1 };
}

/** One vocabulary exercise. Calls onResult once, then the learner presses Continue (onNext). */
export function ExerciseView({ ex, onResult, onNext }: { ex: VocabExercise; onResult: (r: ExerciseResult) => void; onNext: () => void }) {
  const started = useRef(Date.now());
  const [done, setDone] = useState<null | { good: boolean; almost?: boolean; picked?: number }>(null);
  const [typed, setTyped] = useState('');
  const [built, setBuilt] = useState<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    started.current = Date.now();
    setDone(null);
    setTyped('');
    setBuilt([]);
    if (ex.kind === 'typed' && ex.speak) say(ex.speak, { rate: 0.85 });
  }, [ex]);

  const finish = (good: boolean, grade: Grade, extra: Partial<NonNullable<typeof done>> = {}) => {
    setDone({ good, ...extra });
    onResult({ correct: good, grade, responseMs: Date.now() - started.current });
  };

  const header = (
    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">{MODE_LABEL[ex.mode]}</div>
  );

  if (ex.kind === 'flashcard') {
    return (
      <div>
        {header}
        <Flashcard
          ex={ex}
          onDone={(g) => {
            onResult({ correct: g !== 'again', grade: g, responseMs: Date.now() - started.current });
            onNext();
          }}
        />
      </div>
    );
  }

  const continueBtn = done && (
    <Button className="mt-4" block size="lg" onClick={onNext} icon={<ArrowRight className="size-5" />} autoFocus>
      Continue
    </Button>
  );

  if (ex.kind === 'choice') {
    return (
      <div>
        {header}
        {ex.sentence && <PromptText text={ex.sentence.replace(/_{3,}/g, '___')} fill={done ? ex.options[ex.answerIndex] : null} className="mb-2" />}
        <p className={clsx(ex.sentence ? 'text-sm text-muted' : 'text-[17px] font-medium')}>{ex.prompt}</p>
        <div className="mt-4 space-y-2">
          {ex.options.map((o, i) => {
            const isAnswer = i === ex.answerIndex;
            const picked = done?.picked === i;
            return (
              <button
                key={i}
                type="button"
                disabled={!!done}
                onClick={() => finish(isAnswer, isAnswer ? 'good' : 'again', { picked: i })}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] ring-1 transition active:scale-[0.99]',
                  !done && 'bg-surface ring-border hover:ring-primary/60',
                  done && isAnswer && 'bg-success-soft ring-2 ring-success',
                  done && picked && !isAnswer && 'animate-shake bg-danger-soft ring-2 ring-danger',
                  done && !picked && !isAnswer && 'opacity-50 ring-border',
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-bold text-muted">{String.fromCharCode(65 + i)}</span>
                {o}
              </button>
            );
          })}
        </div>
        {done && <Reveal ex={ex} good={done.good} />}
        {continueBtn}
      </div>
    );
  }

  if (ex.kind === 'typed') {
    const submit = () => {
      if (!typed.trim() || done) return;
      const r = checkTyped(typed, ex.answers);
      if (r.correct) finish(true, 'good');
      else if (r.almost) finish(true, 'hard', { almost: true });
      else finish(false, 'again');
    };
    return (
      <div>
        {header}
        {ex.speak ? (
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => say(ex.speak!, { rate: 0.85 })} className="flex size-14 items-center justify-center rounded-2xl bg-primary text-on-primary" aria-label="Play the word again">
              <Volume2 className="size-6" />
            </button>
            <p className="text-[15px] text-muted">{ex.prompt}</p>
          </div>
        ) : (
          <>
            {ex.sentence && <PromptText text={ex.sentence.replace(/_{3,}/g, '___')} fill={done ? ex.answers[0] : null} />}
            <p className="mt-1 text-sm text-muted">{ex.prompt}</p>
          </>
        )}
        <p className="mt-3 text-sm text-muted">Hint: {ex.hint}</p>
        <div className="mt-3 flex gap-2">
          <input
            ref={inputRef}
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={!!done}
            aria-label="Type the word"
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            className={clsx(
              'h-12 min-w-0 flex-1 rounded-xl bg-surface px-4 text-[17px] ring-1 focus:ring-2 focus:ring-primary focus:outline-none',
              done ? (done.good ? 'ring-success' : 'ring-danger') : 'ring-border',
            )}
          />
          {!done && (
            <Button size="lg" onClick={submit} disabled={!typed.trim()} icon={<Check className="size-5" />}>
              Check
            </Button>
          )}
        </div>
        {done?.almost && <p className="mt-2 text-sm font-medium text-warning">Almost — check the spelling: {ex.answers[0]}</p>}
        {done && <Reveal ex={ex} good={done.good} />}
        {continueBtn}
      </div>
    );
  }

  // builder
  return <Builder ex={ex} built={built} setBuilt={setBuilt} done={done} finish={finish} header={header} continueBtn={continueBtn} />;
}

function Builder({
  ex,
  built,
  setBuilt,
  done,
  finish,
  header,
  continueBtn,
}: {
  ex: Extract<VocabExercise, { kind: 'builder' }>;
  built: number[];
  setBuilt: (v: number[]) => void;
  done: null | { good: boolean };
  finish: (good: boolean, grade: Grade) => void;
  header: React.ReactNode;
  continueBtn: React.ReactNode;
}) {
  const word = useMemo(() => built.map((i) => ex.letters[i]).join(''), [built, ex.letters]);
  useEffect(() => {
    if (!done && built.length === ex.letters.length) {
      const good = word.toLowerCase() === ex.answer.toLowerCase();
      finish(good, good ? 'good' : 'again');
    }
  }, [built.length, done, ex.answer, ex.letters.length, finish, word]);
  return (
    <div>
      {header}
      <p className="text-[16px]">{ex.prompt.replace(/^Build the word: /, '')}</p>
      <div className="mt-4 flex min-h-14 flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-surface-2 p-3" aria-live="polite">
        {built.length === 0 && <span className="text-sm text-muted">Tap the letters in order</span>}
        {built.map((li, pos) => (
          <button key={pos} type="button" disabled={!!done} onClick={() => setBuilt(built.filter((_, p) => p !== pos))} className="flex size-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-on-primary">
            {ex.letters[li]}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {ex.letters.map((l, i) => (
          <button
            key={i}
            type="button"
            disabled={built.includes(i) || !!done}
            onClick={() => setBuilt([...built, i])}
            className="flex size-11 items-center justify-center rounded-lg bg-surface text-lg font-bold ring-1 ring-border transition hover:ring-primary active:scale-95 disabled:opacity-20"
          >
            {l}
          </button>
        ))}
      </div>
      {!done && built.length > 0 && (
        <div className="mt-3 text-center">
          <button type="button" className="text-sm font-semibold text-muted hover:text-text" onClick={() => setBuilt([])}>
            Clear
          </button>
        </div>
      )}
      {done && <Reveal ex={ex} good={done.good} />}
      {continueBtn}
    </div>
  );
}
