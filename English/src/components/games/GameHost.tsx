import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Heart, RotateCcw, Swords, Timer, Trophy, Volume2 } from 'lucide-react';
import { checkAnswer } from '@shared/scoring';
import { normalizeAnswer, seededRandom, shuffle, tokenize } from '@shared/text';
import { get, post } from '../../lib/api';
import { useToast } from '../../lib/context';
import { play, stopSpeaking } from '../../lib/tts';
import type { ActivityResult, QuestionDTO, VocabExercise } from '../../lib/types';
import { ExerciseView } from '../vocab/ExerciseView';
import { QuestionView, type AnyQuestion } from '../QuestionView';
import { MatchGame } from './MatchGame';
import { Button, EmptyState, ErrorState, ProgressBar, Ring, Spinner, clsx } from '../ui';

type Choice = Extract<VocabExercise, { kind: 'choice' }>;
interface WordResult {
  vocabId: string;
  correct: boolean;
}
interface GrammarResult {
  questionId: string;
  correct: boolean;
  qtype: string;
}
interface Outcome {
  correct: number;
  total: number;
  words?: WordResult[];
  grammar?: GrammarResult[];
  won?: boolean;
  note?: string;
}

// ------------------------------------------------------------------ timed quiz (speed / race)

function TimedQuiz({ items, seconds, race, onEnd }: { items: Choice[]; seconds: number; race?: boolean; onEnd: (o: Outcome) => void }) {
  const [left, setLeft] = useState(seconds);
  const [i, setI] = useState(0);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  const words = useRef<WordResult[]>([]);
  const ended = useRef(false);
  const finish = () => {
    if (ended.current) return;
    ended.current = true;
    const c = words.current.filter((w) => w.correct).length;
    onEnd({ correct: c, total: Math.max(1, words.current.length), words: words.current });
  };
  useEffect(() => {
    if (left <= 0) {
      finish();
      return;
    }
    const t = window.setTimeout(() => setLeft(left - 1), 1000);
    return () => window.clearTimeout(t);
  });
  const item = items[i % items.length];
  const answer = (k: number) => {
    const ok = k === item.answerIndex;
    words.current.push({ vocabId: item.vocabId, correct: ok });
    setFlash(ok ? 'good' : 'bad');
    window.setTimeout(() => setFlash(null), 250);
    if (i + 1 >= items.length) finish();
    else setI(i + 1);
  };
  const correct = words.current.filter((w) => w.correct).length;
  const pace = Math.round(((seconds - left) / seconds) * items.length * 0.5);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className={clsx('inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold tabular-nums', left <= 10 ? 'bg-danger-soft text-danger' : 'bg-surface-2')}>
          <Timer className="size-4" /> {left}s
        </span>
        <span className="text-sm font-semibold">✓ {correct}</span>
      </div>
      {race && (
        <div className="mb-4 space-y-1.5" aria-label="Race track">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-10 font-semibold">You</span>
            <ProgressBar value={correct / items.length} size="sm" color="bg-primary" label="Your progress" />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="w-10">Pace</span>
            <ProgressBar value={pace / items.length} size="sm" color="bg-muted" label="Target pace" />
          </div>
        </div>
      )}
      <div className={clsx('rounded-2xl p-1 transition', flash === 'good' && 'bg-success-soft', flash === 'bad' && 'bg-danger-soft')}>
        <p className="mb-3 text-[17px] font-medium">{item.prompt}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {item.options.map((o, k) => (
            <button key={`${i}-${k}`} type="button" onClick={() => answer(k)} className="rounded-xl bg-surface px-4 py-3 text-left text-[15px] ring-1 ring-border transition hover:ring-primary active:scale-[0.98]">
              {o}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ exercise sequence with optional HP

function ExerciseRun({ items, hp, onEnd, speakFirst }: { items: (VocabExercise & { speak?: string })[]; hp?: number; onEnd: (o: Outcome) => void; speakFirst?: boolean }) {
  const [i, setI] = useState(0);
  const [lives, setLives] = useState(hp ?? Infinity);
  const words = useRef<WordResult[]>([]);
  const item = items[i];
  useEffect(() => {
    if (speakFirst && item?.speak) play([{ text: item.speak }], { rate: 0.9 });
    return () => stopSpeaking();
  }, [i, item, speakFirst]);
  const end = () => onEnd({ correct: words.current.filter((w) => w.correct).length, total: Math.max(1, words.current.length), words: words.current, won: lives > 0 });
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <ProgressBar value={i / items.length} size="sm" label="Game progress" />
        {hp !== undefined && (
          <span className="flex shrink-0 gap-0.5" aria-label={`${lives} lives left`}>
            {Array.from({ length: hp }).map((_, k) => (
              <Heart key={k} className={clsx('size-4', k < lives ? 'fill-danger text-danger' : 'text-muted')} />
            ))}
          </span>
        )}
      </div>
      {speakFirst && item.speak && (
        <Button className="mb-3" variant="secondary" icon={<Volume2 className="size-4" />} onClick={() => play([{ text: item.speak! }], { rate: 0.9 })}>
          Play the sentence
        </Button>
      )}
      <ExerciseView
        key={`${item.id}-${i}`}
        ex={item}
        onResult={(r) => {
          words.current.push({ vocabId: item.vocabId, correct: r.correct });
          if (!r.correct && hp !== undefined) setLives((l) => l - 1);
        }}
        onNext={() => {
          if (i + 1 >= items.length || (hp !== undefined && lives <= 0)) end();
          else setI(i + 1);
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ memory cards

function Memory({ pairs, onEnd }: { pairs: { vocabId: string; left: string; right: string }[]; onEnd: (o: Outcome) => void }) {
  const cards = useMemo(() => shuffle(pairs.flatMap((p) => [{ id: p.vocabId, text: p.left, side: 'en' }, { id: p.vocabId, text: p.right, side: 'mn' }]), seededRandom(pairs.map((p) => p.vocabId).join())), [pairs]);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const misses = useRef<Record<string, boolean>>({});
  function flip(k: number) {
    if (open.length === 2 || open.includes(k) || matched.includes(cards[k].id)) return;
    const next = [...open, k];
    setOpen(next);
    if (next.length === 2) {
      setMoves(moves + 1);
      const [a, b] = next.map((x) => cards[x]);
      window.setTimeout(() => {
        if (a.id === b.id && a.side !== b.side) {
          const m = [...matched, a.id];
          setMatched(m);
          if (m.length === pairs.length) {
            const words = pairs.map((p) => ({ vocabId: p.vocabId, correct: !misses.current[p.vocabId] }));
            onEnd({ correct: pairs.length, total: Math.max(pairs.length, moves + 1), words, note: `${moves + 1} moves` });
          }
        } else {
          misses.current[a.id] = true;
          misses.current[b.id] = true;
        }
        setOpen([]);
      }, 700);
    }
  }
  return (
    <div>
      <p className="mb-3 text-center text-sm text-muted">Find each English word and its Mongolian meaning. Moves: {moves}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {cards.map((c, k) => {
          const shown = open.includes(k) || matched.includes(c.id);
          return (
            <button
              key={k}
              type="button"
              onClick={() => flip(k)}
              className={clsx(
                'flex min-h-20 items-center justify-center rounded-xl p-2 text-center text-sm font-semibold ring-1 transition',
                matched.includes(c.id) ? 'bg-success-soft text-success ring-success/30' : shown ? 'animate-flip bg-surface ring-primary' : 'bg-primary text-on-primary ring-primary',
              )}
              aria-label={shown ? c.text : 'Hidden card'}
            >
              {shown ? c.text : '?'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sentence builder

function SentenceBuilder({ items, onEnd }: { items: { answer: string; alternatives: string[]; tiles: string[]; source: string }[]; onEnd: (o: Outcome) => void }) {
  const [i, setI] = useState(0);
  const [built, setBuilt] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const correct = useRef(0);
  const it = items[i];
  const sentence = built.map((k) => it.tiles[k]).join(' ');
  function check() {
    const ok = [it.answer, ...it.alternatives].some((a) => normalizeAnswer(a) === normalizeAnswer(sentence));
    if (ok) correct.current++;
    setResult(ok);
  }
  function next() {
    if (i + 1 >= items.length) onEnd({ correct: correct.current, total: items.length });
    else {
      setI(i + 1);
      setBuilt([]);
      setResult(null);
    }
  }
  return (
    <div>
      <ProgressBar value={i / items.length} size="sm" className="mb-4" label="Game progress" />
      <div className="min-h-16 rounded-2xl border-2 border-dashed border-border p-3 text-[17px]">{sentence || <span className="text-sm text-muted">Tap the words in order</span>}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {it.tiles.map((t, k) => (
          <button key={k} type="button" disabled={built.includes(k) || result !== null} onClick={() => setBuilt([...built, k])} className="rounded-xl bg-surface px-3 py-2 font-medium ring-1 ring-border hover:ring-primary disabled:opacity-25">
            {t}
          </button>
        ))}
      </div>
      {result === null ? (
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => setBuilt(built.slice(0, -1))} disabled={!built.length}>
            Undo
          </Button>
          <Button className="flex-1" disabled={built.length !== it.tiles.length} onClick={check}>
            Check
          </Button>
        </div>
      ) : (
        <div className={clsx('animate-pop mt-4 rounded-2xl p-4', result ? 'bg-success-soft' : 'bg-danger-soft')}>
          <div className="font-semibold">{result ? 'Correct!' : 'Not quite yet.'}</div>
          {!result && <div className="mt-1">✅ {it.answer}</div>}
          <Button className="mt-3" block onClick={next}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ grammar duel

function GrammarDuel({ questions, rivalSeconds, rivalAccuracy, onEnd }: { questions: QuestionDTO[]; rivalSeconds: number; rivalAccuracy: number; onEnd: (o: Outcome) => void }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState({ you: 0, rival: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [round, setRound] = useState<null | { you: boolean; rival: boolean; winner: 'you' | 'rival' | 'none' }>(null);
  const grammar = useRef<GrammarResult[]>([]);
  const random = useMemo(() => seededRandom(questions.map((q) => q.id).join()), [questions]);
  const rivalCorrect = useMemo(() => questions.map(() => random() < rivalAccuracy), [questions, random, rivalAccuracy]);
  const q = questions[i];
  useEffect(() => {
    if (round) return;
    const t = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => window.clearInterval(t);
  }, [round, i]);
  useEffect(() => {
    if (!round && elapsed >= rivalSeconds && rivalCorrect[i]) {
      setRound({ you: false, rival: true, winner: 'rival' });
      setScore((s) => ({ ...s, rival: s.rival + 1 }));
      grammar.current.push({ questionId: q.id, correct: false, qtype: q.type });
    }
  }, [elapsed, round, rivalSeconds, rivalCorrect, i, q]);
  return (
    <div>
      <div className="mb-4 grid grid-cols-3 items-center text-center">
        <div>
          <div className="text-xs text-muted">You</div>
          <div className="text-2xl font-bold">{score.you}</div>
        </div>
        <div className="text-xs text-muted">
          Round {i + 1}/{questions.length}
          <ProgressBar value={Math.min(1, elapsed / rivalSeconds)} size="sm" color="bg-accent" className="mt-1" label="Rival thinking" />
        </div>
        <div>
          <div className="text-xs text-muted">Rival</div>
          <div className="text-2xl font-bold">{score.rival}</div>
        </div>
      </div>
      {!round ? (
        <QuestionView
          key={q.id}
          question={q as AnyQuestion}
          mode="practice"
          onAnswered={({ result }) => {
            const rivalWins = !result.correct && rivalCorrect[i];
            const winner = result.correct ? 'you' : rivalWins ? 'rival' : 'none';
            grammar.current.push({ questionId: q.id, correct: result.correct, qtype: q.type });
            setScore((s) => ({ you: s.you + (winner === 'you' ? 1 : 0), rival: s.rival + (winner === 'rival' ? 1 : 0) }));
            setRound({ you: result.correct, rival: rivalCorrect[i], winner });
          }}
        />
      ) : (
        <div className="animate-pop rounded-2xl bg-surface-2 p-4 text-center">
          <div className="text-lg font-bold">{round.winner === 'you' ? 'You win the round!' : round.winner === 'rival' ? 'The rival was faster.' : 'Nobody scores.'}</div>
          {!round.you && <div className="mt-1 text-sm">Answer: {checkAnswer(q, null).expected}</div>}
          <Button
            className="mt-3"
            onClick={() => {
              if (i + 1 >= questions.length) {
                onEnd({ correct: grammar.current.filter((g) => g.correct).length, total: questions.length, grammar: grammar.current, won: score.you > score.rival });
              } else {
                setI(i + 1);
                setRound(null);
                setElapsed(0);
              }
            }}
          >
            Next round
          </Button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ boss battle

interface BossRound {
  vocab: VocabExercise[];
  grammar: QuestionDTO[];
  mistakes: { id: number; wrong: string; correct: string; explanation: string | null }[];
  bossHp: number;
  playerHp: number;
}

function Boss({ data, onEnd }: { data: BossRound; onEnd: (o: Outcome) => void }) {
  const rounds = useMemo(
    () =>
      shuffle(
        [
          ...data.vocab.map((v) => ({ kind: 'vocab' as const, v })),
          ...data.grammar.map((g) => ({ kind: 'grammar' as const, g })),
          ...data.mistakes.map((m) => ({ kind: 'mistake' as const, m })),
        ],
        seededRandom(data.bossHp),
      ),
    [data],
  );
  const [i, setI] = useState(0);
  const [boss, setBoss] = useState(data.bossHp);
  const [hp, setHp] = useState(data.playerHp);
  const [answered, setAnswered] = useState(false);
  const [typed, setTyped] = useState('');
  const [mistakeOk, setMistakeOk] = useState<boolean | null>(null);
  const words = useRef<WordResult[]>([]);
  const grammar = useRef<GrammarResult[]>([]);
  const r = rounds[i];
  const hit = (ok: boolean) => {
    if (ok) setBoss((b) => b - 1);
    else setHp((h) => h - 1);
    setAnswered(true);
  };
  const next = () => {
    const over = hp <= 0 || boss <= 0 || i + 1 >= rounds.length;
    if (over) {
      const c = words.current.filter((w) => w.correct).length + grammar.current.filter((g) => g.correct).length;
      onEnd({ correct: c, total: Math.max(1, i + 1), words: words.current, grammar: grammar.current, won: boss <= 0 || (hp > 0 && boss <= data.bossHp * 0.3) });
      return;
    }
    setI(i + 1);
    setAnswered(false);
    setTyped('');
    setMistakeOk(null);
  };
  return (
    <div>
      <div className="mb-4 rounded-2xl bg-surface-2 p-3">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-1">
            <Swords className="size-4" /> Word Boss
          </span>
          <span>
            {boss}/{data.bossHp}
          </span>
        </div>
        <ProgressBar value={boss / data.bossHp} color="bg-danger" className="mt-1" label="Boss health" />
        <div className="mt-2 flex items-center gap-1" aria-label={`${hp} lives`}>
          {Array.from({ length: data.playerHp }).map((_, k) => (
            <Heart key={k} className={clsx('size-4', k < hp ? 'fill-danger text-danger' : 'text-muted')} />
          ))}
        </div>
      </div>
      {r.kind === 'vocab' && (
        <ExerciseView
          key={`b${i}`}
          ex={r.v}
          onResult={(res) => {
            words.current.push({ vocabId: r.v.vocabId, correct: res.correct });
            hit(res.correct);
          }}
          onNext={next}
        />
      )}
      {r.kind === 'grammar' && (
        <QuestionView
          key={`b${i}`}
          question={r.g as AnyQuestion}
          mode="practice"
          onAnswered={({ result }) => {
            grammar.current.push({ questionId: r.g.id, correct: result.correct, qtype: r.g.type });
            hit(result.correct);
          }}
          footer={
            answered && (
              <Button className="mt-4" block onClick={next}>
                Attack!
              </Button>
            )
          }
        />
      )}
      {r.kind === 'mistake' && (
        <div>
          <p className="font-medium">Your old mistake — correct it:</p>
          <div className="mt-2 rounded-xl bg-danger-soft px-4 py-3 text-danger">❌ {r.m.wrong}</div>
          <input
            className="mt-3 h-12 w-full rounded-xl bg-surface px-4 ring-1 ring-border focus:ring-2 focus:ring-primary focus:outline-none"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={answered}
            aria-label="Corrected sentence"
          />
          {!answered ? (
            <Button
              className="mt-3"
              block
              disabled={!typed.trim()}
              onClick={() => {
                const ok = normalizeAnswer(typed) === normalizeAnswer(r.m.correct);
                setMistakeOk(ok);
                hit(ok);
              }}
            >
              Check
            </Button>
          ) : (
            <div className={clsx('mt-3 rounded-xl p-3', mistakeOk ? 'bg-success-soft' : 'bg-danger-soft')}>
              ✅ {r.m.correct}
              <Button className="mt-2" block onClick={next}>
                Attack!
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ host

export function GameHost({ gameId, onFinish }: { gameId: string; onFinish?: (o: Outcome) => void }) {
  const [round, setRound] = useState(0);
  const q = useQuery({ queryKey: ['game', gameId, round], queryFn: () => get<Record<string, unknown> & { game: { id: string; title: string } }>(`/games/${gameId}/round`), staleTime: Infinity, gcTime: 0 });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [started] = useState(Date.now());
  const { reward } = useToast();

  async function end(o: Outcome) {
    setOutcome(o);
    try {
      const res = await post<ActivityResult & { score: number }>(`/games/${gameId}/result`, {
        correct: o.correct,
        total: o.total,
        words: o.words,
        grammar: o.grammar,
        minutes: Math.min(30, (Date.now() - started) / 60000),
      });
      reward(res);
    } catch {
      /* the game still counts locally */
    }
  }

  if (q.isLoading) return <Spinner label="Setting up the game…" />;
  if (q.error) {
    return (
      <EmptyState
        title="This game isn't ready yet"
        body={(q.error as Error).message}
        action={
          onFinish ? (
            <Button onClick={() => onFinish({ correct: 0, total: 1 })}>Continue</Button>
          ) : undefined
        }
      />
    );
  }
  const data = q.data!;

  if (outcome) {
    const pct = outcome.correct / Math.max(1, outcome.total);
    return (
      <div className="animate-pop py-4 text-center">
        <Ring value={pct} size={110} stroke={10} label={`${Math.round(pct * 100)}%`}>
          <Trophy className={clsx('size-8', pct >= 0.7 ? 'text-accent' : 'text-muted')} />
        </Ring>
        <h2 className="mt-3 text-2xl font-bold">{outcome.won === false ? 'So close!' : pct >= 0.9 ? 'Brilliant!' : pct >= 0.6 ? 'Nice work!' : "Let's try one more"}</h2>
        <p className="mt-1 text-muted">
          {outcome.correct} of {outcome.total} correct{outcome.note ? ` · ${outcome.note}` : ''}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button
            variant="secondary"
            icon={<RotateCcw className="size-4" />}
            onClick={() => {
              setOutcome(null);
              setRound(round + 1);
            }}
          >
            Play again
          </Button>
          {onFinish && <Button onClick={() => onFinish(outcome)}>Continue</Button>}
        </div>
      </div>
    );
  }

  switch (gameId) {
    case 'word-match': {
      const pairs = data.pairs as { vocabId: string; left: string; right: string }[];
      return (
        <MatchGame
          pairs={pairs.map((p) => ({ id: p.vocabId, left: p.left, right: p.right }))}
          seed={`${gameId}${round}`}
          rightLabel={data.rightLabel as string}
          onDone={(r) => end({ correct: Object.values(r.firstTry).filter(Boolean).length, total: pairs.length, words: Object.entries(r.firstTry).map(([vocabId, correct]) => ({ vocabId, correct })), note: `${r.mistakes} mistakes` })}
        />
      );
    }
    case 'memory':
      return <Memory pairs={data.pairs as { vocabId: string; left: string; right: string }[]} onEnd={end} />;
    case 'speed':
    case 'vocab-race': {
      const items = (data.items as VocabExercise[]).filter((x): x is Choice => x.kind === 'choice');
      return <TimedQuiz items={items} seconds={data.seconds as number} race={gameId === 'vocab-race'} onEnd={end} />;
    }
    case 'collocation':
    case 'missing-word':
    case 'word-builder':
      return <ExerciseRun items={data.items as VocabExercise[]} onEnd={end} />;
    case 'synonym-battle':
      return <ExerciseRun items={data.items as VocabExercise[]} hp={data.hp as number} onEnd={end} />;
    case 'listening-detective':
      return <ExerciseRun items={data.items as (VocabExercise & { speak?: string })[]} onEnd={end} speakFirst />;
    case 'sentence-builder':
      return <SentenceBuilder items={data.items as { answer: string; alternatives: string[]; tiles: string[]; source: string }[]} onEnd={end} />;
    case 'grammar-duel':
      return <GrammarDuel questions={data.questions as QuestionDTO[]} rivalSeconds={data.rivalSeconds as number} rivalAccuracy={data.rivalAccuracy as number} onEnd={end} />;
    case 'boss':
      return <Boss data={data as unknown as BossRound} onEnd={end} />;
  }
  return <ErrorState error={new Error('Unknown game')} />;
}

export { tokenize };
