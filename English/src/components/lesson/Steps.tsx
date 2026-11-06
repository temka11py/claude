import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleCheck, Target } from 'lucide-react';
import { post } from '../../lib/api';
import { postOrQueue } from '../../lib/offline';
import type { StepView } from '../../lib/types';
import { QuestionSequence, type SequenceResult } from '../QuestionSequence';
import { ExerciseView } from '../vocab/ExerciseView';
import { WordCard } from '../vocab/WordCard';
import { MatchGame } from '../games/MatchGame';
import { Badge, Button, Callout, Card, Mn, ProgressBar, SpeakButton, clsx } from '../ui';

type S<K extends StepView['kind']> = Extract<StepView, { kind: K }>;

export interface StepResult {
  /** Graded result of this step, if any (merged into the lesson's skill scores). */
  seq?: SequenceResult;
}

export function WarmupStep({ step, lessonId, onDone }: { step: S<'warmup'>; lessonId: string; onDone: (r: StepResult) => void }) {
  return (
    <div>
      <Callout kind="tip">{step.intro}</Callout>
      <div className="mt-5">
        <QuestionSequence questions={step.questions} context={{ type: 'warmup', id: lessonId }} onComplete={() => onDone({})} />
      </div>
    </div>
  );
}

export function ObjectivesStep({ step, onDone }: { step: S<'objectives'>; onDone: (r: StepResult) => void }) {
  return (
    <div>
      <h3 className="text-lg font-semibold">By the end of this lesson you will be able to:</h3>
      <ul className="mt-4 space-y-3">
        {step.objectives.map((o) => (
          <li key={o} className="flex items-start gap-3 rounded-xl bg-surface p-3.5 ring-1 ring-border">
            <Target className="mt-0.5 size-5 shrink-0 text-primary" />
            <span className="text-[16px]">{o}</span>
          </li>
        ))}
      </ul>
      <Button className="mt-6" block size="lg" onClick={() => onDone({})} icon={<ArrowRight className="size-5" />}>
        Let's start
      </Button>
    </div>
  );
}

export function VocabularyStep({ step, onDone }: { step: S<'vocabulary'>; onDone: (r: StepResult) => void }) {
  const [i, setI] = useState(0);
  const introduced = useRef(false);
  useEffect(() => {
    if (introduced.current) return;
    introduced.current = true;
    // New words enter the spaced-repetition cycle as soon as they are shown.
    void post('/vocab/introduce', { ids: step.words.map((w) => w.id) }).catch(() => undefined);
  }, [step.words]);
  const w = step.words[i];
  const last = i === step.words.length - 1;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <ProgressBar value={(i + 1) / step.words.length} size="sm" label="Words" />
        <span className="shrink-0 text-xs font-semibold text-muted">
          {i + 1}/{step.words.length}
        </span>
      </div>
      <WordCard key={w.id} word={w} className="animate-slide-up" />
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="lg" disabled={i === 0} onClick={() => setI(i - 1)} icon={<ArrowLeft className="size-5" />} aria-label="Previous word" />
        <Button className="flex-1" size="lg" onClick={() => (last ? onDone({}) : setI(i + 1))} icon={<ArrowRight className="size-5" />}>
          {last ? 'Practise these words' : 'Next word'}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {step.words.map((x, j) => (
          <button key={x.id} type="button" onClick={() => setI(j)} className={clsx('rounded-lg px-2 py-1 text-xs font-semibold', j === i ? 'bg-primary text-on-primary' : 'bg-surface-2 text-muted')}>
            {x.word}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VocabPracticeStep({ step, lessonId, onDone }: { step: S<'vocab_practice'>; lessonId: string; onDone: (r: StepResult) => void }) {
  const [phase, setPhase] = useState<'match' | 'exercises'>(step.match.length >= 3 ? 'match' : 'exercises');
  const [i, setI] = useState(0);
  const results = useRef<number[]>([]);
  if (phase === 'match') {
    return (
      <div>
        <p className="mb-3 text-sm text-muted">Warm-up: match each word with its meaning in Mongolian.</p>
        <MatchGame pairs={step.match.map((m) => ({ id: m.vocabId, left: m.word, right: m.mongolian }))} seed={lessonId} rightLabel="Монгол" onDone={() => setPhase('exercises')} />
      </div>
    );
  }
  if (!step.items.length) {
    return (
      <Button block size="lg" onClick={() => onDone({})}>
        Continue
      </Button>
    );
  }
  const item = step.items[i];
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={i / step.items.length} size="sm" label="Practice" />
        <span className="shrink-0 text-xs font-semibold text-muted">
          {i + 1}/{step.items.length}
        </span>
      </div>
      <ExerciseView
        key={item.exercise.id}
        ex={item.exercise}
        onResult={(r) => {
          results.current.push(r.correct ? 1 : 0);
          void postOrQueue('/review/grade', { vocabId: item.exercise.vocabId, grade: r.grade, mode: item.exercise.mode, responseMs: r.responseMs, source: 'lesson' });
        }}
        onNext={() => {
          if (i + 1 < step.items.length) setI(i + 1);
          else {
            const n = results.current.length;
            const sum = results.current.reduce((a, b) => a + b, 0);
            onDone({ seq: { correct: sum, total: n, score: n ? sum / n : 1, bySkill: { vocabulary: { sum, n } } } });
          }
        }}
      />
    </div>
  );
}

const REGISTER_TONE: Record<string, 'neutral' | 'primary' | 'accent' | 'success' | 'warning'> = {
  informal: 'accent',
  spoken: 'accent',
  slang: 'warning',
  neutral: 'neutral',
  formal: 'primary',
  academic: 'primary',
  professional: 'success',
};

export function PhrasesStep({ step, onDone }: { step: S<'phrases'>; onDone: (r: StepResult) => void }) {
  return (
    <div>
      <p className="mb-4 text-[15px] text-muted">Phrases people really use — and when they sound natural.</p>
      <div className="space-y-3">
        {step.phrases.map((p) => (
          <Card key={p.phrase}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-bold">{p.phrase}</div>
                <div className="text-[15px] text-muted">{p.meaning}</div>
                <Mn>{p.mn}</Mn>
              </div>
              <div className="flex items-center gap-1">
                <Badge tone={REGISTER_TONE[p.register] ?? 'neutral'}>{p.register}</Badge>
                <SpeakButton text={p.example} size="sm" />
              </div>
            </div>
            <p className="mt-2 text-sm">
              <strong>When to use:</strong> {p.whenToUse}
            </p>
            <p className="mt-1 rounded-lg bg-surface-2 px-3 py-2 text-[15px] italic">“{p.example}”</p>
          </Card>
        ))}
      </div>
      <Button className="mt-5" block size="lg" onClick={() => onDone({})}>
        Continue
      </Button>
    </div>
  );
}

export function GrammarStep({ step, onDone }: { step: S<'grammar'>; onDone: (r: StepResult) => void }) {
  const t = step.topic;
  const parts = ['Explanation', 'Examples', 'Mistakes', 'Guided practice', 'Your turn'] as const;
  const [part, setPart] = useState(0);
  const results = useRef<SequenceResult[]>([]);
  const nav = (
    <div className="mb-4 flex gap-1 overflow-x-auto">
      {parts.map((p, i) => (
        <span key={p} className={clsx('whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold', i === part ? 'bg-primary text-on-primary' : i < part ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted')}>
          {p}
        </span>
      ))}
    </div>
  );
  const next = (
    <Button className="mt-5" block size="lg" onClick={() => setPart(part + 1)} icon={<ArrowRight className="size-5" />}>
      Continue
    </Button>
  );

  if (part === 0) {
    return (
      <div>
        {nav}
        <h3 className="text-xl font-bold">{t.title}</h3>
        <p className="mt-2 text-[16px] leading-relaxed">{t.summary}</p>
        <Mn>{t.summaryMn}</Mn>
        <Card className="mt-4">
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Structure</h4>
          <ul className="space-y-1.5 font-mono text-[14px]">
            {t.structure.map((s) => (
              <li key={s} className="rounded-lg bg-surface-2 px-3 py-2">
                {s}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="mt-3">
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">When to use it</h4>
          <ul className="space-y-3">
            {t.usage.map((u) => (
              <li key={u.use}>
                <div className="font-semibold">{u.use}</div>
                <Mn inline className="block">
                  {u.useMn}
                </Mn>
                <div className="mt-0.5 flex items-center gap-1 text-[15px] italic">
                  “{u.example}” <SpeakButton text={u.example} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        {next}
      </div>
    );
  }
  if (part === 1) {
    return (
      <div>
        {nav}
        <ul className="space-y-2">
          {t.examples.map((e) => (
            <li key={e.en} className="rounded-xl bg-surface p-3.5 ring-1 ring-border">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-[16px]">{e.en}</span>
                <SpeakButton text={e.en} size="sm" />
              </div>
              {e.note && <p className="mt-1 text-sm text-muted">{e.note}</p>}
            </li>
          ))}
        </ul>
        {t.contrast && (
          <Card className="mt-4">
            <h4 className="mb-3 font-semibold">Compare: {t.title.split(' vs ')[0]} vs {t.contrast.with}</h4>
            <div className="space-y-3">
              {t.contrast.pairs.map((p) => (
                <div key={p.a} className="rounded-xl bg-surface-2 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-surface px-3 py-2 text-[15px] ring-1 ring-border">{p.a}</div>
                    <div className="rounded-lg bg-surface px-3 py-2 text-[15px] ring-1 ring-border">{p.b}</div>
                  </div>
                  <p className="mt-2 text-sm">
                    <strong>Why?</strong> {p.why}
                  </p>
                  <Mn>{p.whyMn}</Mn>
                </div>
              ))}
            </div>
          </Card>
        )}
        {next}
      </div>
    );
  }
  if (part === 2) {
    return (
      <div>
        {nav}
        <h3 className="mb-3 text-lg font-semibold">Common mistakes</h3>
        <ul className="space-y-3">
          {t.mistakes.map((m) => (
            <li key={m.wrong} className="rounded-xl bg-surface p-3.5 ring-1 ring-border">
              <div className="text-[15px] text-danger">❌ {m.wrong}</div>
              <div className="mt-1 text-[15px] font-semibold text-success">✅ {m.right}</div>
              <p className="mt-1.5 text-sm">{m.why}</p>
              <Mn>{m.whyMn}</Mn>
            </li>
          ))}
        </ul>
        {next}
      </div>
    );
  }
  if (part === 3) {
    return (
      <div>
        {nav}
        <p className="mb-4 text-sm text-muted">First, recognise the right form.</p>
        <QuestionSequence
          questions={step.guided}
          context={{ type: 'grammar', id: t.id }}
          onComplete={(r) => {
            results.current.push(r);
            setPart(4);
          }}
        />
      </div>
    );
  }
  return (
    <div>
      {nav}
      <p className="mb-4 text-sm text-muted">Now produce it yourself.</p>
      <QuestionSequence
        questions={step.free}
        context={{ type: 'grammar', id: t.id }}
        onComplete={(r) => {
          results.current.push(r);
          const all = results.current;
          const n = all.reduce((a, x) => a + x.total, 0);
          const sum = all.reduce((a, x) => a + x.score * x.total, 0);
          onDone({ seq: { correct: all.reduce((a, x) => a + x.correct, 0), total: n, score: n ? sum / n : 1, bySkill: { grammar: { sum, n } } } });
        }}
      />
    </div>
  );
}

export function QuizStep({ step, lessonId, onDone }: { step: S<'quiz'>; lessonId: string; onDone: (r: StepResult) => void }) {
  const [phase, setPhase] = useState<'questions' | 'vocab'>(step.questions.length ? 'questions' : 'vocab');
  const [i, setI] = useState(0);
  const qResult = useRef<SequenceResult | null>(null);
  const vocab = useRef<number[]>([]);

  const finish = () => {
    const q = qResult.current;
    const vn = vocab.current.length;
    const vsum = vocab.current.reduce((a, b) => a + b, 0);
    const bySkill = { ...(q?.bySkill ?? {}) };
    if (vn) {
      bySkill.vocabulary = { sum: (bySkill.vocabulary?.sum ?? 0) + vsum, n: (bySkill.vocabulary?.n ?? 0) + vn };
    }
    const total = (q?.total ?? 0) + vn;
    const sum = (q ? q.score * q.total : 0) + vsum;
    onDone({ seq: { correct: (q?.correct ?? 0) + vsum, total, score: total ? sum / total : 1, bySkill } });
  };

  if (phase === 'questions') {
    return (
      <div>
        <p className="mb-4 text-sm text-muted">A short check of everything in this lesson.</p>
        <QuestionSequence
          questions={step.questions}
          context={{ type: 'lesson', id: lessonId }}
          finishLabel={step.vocab.length ? 'Next: word check' : 'Finish lesson'}
          onComplete={(r) => {
            qResult.current = r;
            if (step.vocab.length) setPhase('vocab');
            else finish();
          }}
        />
      </div>
    );
  }
  if (!step.vocab.length) {
    return (
      <Button block size="lg" onClick={finish}>
        Finish lesson
      </Button>
    );
  }
  const item = step.vocab[i];
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={i / step.vocab.length} size="sm" label="Word check" />
        <span className="shrink-0 text-xs font-semibold text-muted">
          {i + 1}/{step.vocab.length}
        </span>
      </div>
      <ExerciseView
        key={item.exercise.id}
        ex={item.exercise}
        onResult={(r) => {
          vocab.current.push(r.correct ? 1 : 0);
          void postOrQueue('/review/grade', { vocabId: item.exercise.vocabId, grade: r.grade, mode: item.exercise.mode, responseMs: r.responseMs, source: 'lesson' });
        }}
        onNext={() => (i + 1 < step.vocab.length ? setI(i + 1) : finish())}
      />
    </div>
  );
}

export function StepDone({ label = 'Continue', onClick }: { label?: string; onClick: () => void }) {
  return (
    <div className="text-center">
      <CircleCheck className="mx-auto size-10 text-success" />
      <Button className="mt-3" size="lg" onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}
