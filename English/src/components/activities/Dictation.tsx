import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Snail, Volume2 } from 'lucide-react';
import { diffWords, type DiffResult } from '@shared/textDiff';
import { get, post } from '../../lib/api';
import { play, prepare, stopSpeaking } from '../../lib/tts';
import { useToast } from '../../lib/context';
import type { ActivityResult, DictationSet } from '../../lib/types';
import { postResponses } from '../QuestionSequence';
import { Button, EmptyState, ErrorState, ProgressBar, Spinner, clsx } from '../ui';

export function DiffView({ diff }: { diff: DiffResult }) {
  return (
    <p className="text-[17px] leading-[2.2]" aria-label="Comparison with the correct sentence">
      {diff.tokens.map((t, i) => {
        if (t.kind === 'match') return <span key={i}>{t.given} </span>;
        if (t.kind === 'spelling')
          return (
            <span key={i} className="relative mr-1 inline-block">
              <span className="rounded bg-warning-soft px-1 text-warning underline decoration-wavy">{t.given}</span>
              <span className="absolute -top-4 left-0 whitespace-nowrap text-[11px] font-semibold text-success">{t.expected}</span>
            </span>
          );
        if (t.kind === 'wrong')
          return (
            <span key={i} className="relative mr-1 inline-block">
              <span className="rounded bg-danger-soft px-1 text-danger line-through">{t.given}</span>
              <span className="absolute -top-4 left-0 whitespace-nowrap text-[11px] font-semibold text-success">{t.expected}</span>
            </span>
          );
        if (t.kind === 'missing')
          return (
            <span key={i} className="mr-1 rounded border border-dashed border-success px-1 text-success" title="Missing word">
              {t.expected}
            </span>
          );
        return (
          <span key={i} className="mr-1 text-muted line-through" title="Extra word">
            {t.given}
          </span>
        );
      })}
    </p>
  );
}

export function DictationActivity({
  count = 5,
  sentences: given,
  rate: givenRate,
  onComplete,
}: {
  count?: number;
  sentences?: DictationSet['sentences'];
  rate?: number;
  onComplete: (r: { score: number }) => void;
}) {
  const q = useQuery({ queryKey: ['dictation', count], queryFn: () => get<DictationSet>(`/practice/dictation?count=${count}`), enabled: !given, staleTime: Infinity, gcTime: 0 });
  const sentences = given ?? q.data?.sentences ?? [];
  const rate = givenRate ?? q.data?.rate ?? 0.9;
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [plays, setPlays] = useState(0);
  const scores = useRef<number[]>([]);
  const started = useRef(Date.now());
  const { reward } = useToast();
  const s = sentences[index];

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    setTyped('');
    setDiff(null);
    setPlays(0);
  }, [index]);
  useEffect(() => {
    if (sentences.length) prepare(sentences.map((x) => ({ text: x.text, voice: x.voice, accent: x.accent })));
  }, [sentences]);

  if (!given && q.isLoading) return <Spinner />;
  if (!given && q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!sentences.length) {
    return <EmptyState title="Nothing to dictate yet" body="Dictation uses sentences from lessons you have studied. Complete a lesson with listening first." action={<Button onClick={() => onComplete({ score: 0 })}>Continue</Button>} />;
  }

  const listen = (slow = false) => {
    setPlays((p) => p + 1);
    play([{ text: s.text, voice: s.voice, accent: s.accent }], { rate: slow ? rate * 0.75 : rate, waitMs: 20_000 });
  };

  function check() {
    const d = diffWords(s.text, typed);
    setDiff(d);
    scores.current.push(d.accuracy);
    const spelling = d.tokens.filter((t) => t.kind === 'spelling');
    if (spelling.length) {
      postResponses(
        { type: 'dictation', id: s.source },
        spelling.map((t) => ({
          questionId: null,
          skill: 'vocabulary',
          qtype: 'dictation',
          tag: 'spelling',
          level: s.level,
          difficulty: null,
          correct: false,
          score: 0.5,
          wrong: t.given!,
          right: t.expected!,
          explanation: 'Spelling from dictation.',
          explanationMn: null,
          errorCategory: 'spelling' as const,
        })),
      );
    }
  }

  async function next() {
    if (index + 1 < sentences.length) {
      setIndex(index + 1);
      return;
    }
    const avg = scores.current.reduce((a, b) => a + b, 0) / scores.current.length;
    try {
      const act = await post<ActivityResult>('/activity', {
        type: 'dictation',
        minutes: Math.min(30, (Date.now() - started.current) / 60000),
        score: avg,
        count: sentences.length,
        level: s.level,
        perfect: scores.current.filter((x) => x >= 0.999).length,
      });
      reward(act);
    } catch {
      /* not critical */
    }
    onComplete({ score: avg });
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={index / sentences.length} size="sm" label="Dictation progress" />
        <span className="shrink-0 text-xs font-semibold text-muted">
          {index + 1}/{sentences.length}
        </span>
      </div>
      <p className="mb-3 text-sm text-muted">Listen and type exactly what you hear. Punctuation doesn't matter.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" icon={<Volume2 className="size-5" />} onClick={() => listen()}>
          {plays ? 'Play again' : 'Play'}
        </Button>
        <Button size="lg" variant="secondary" icon={<Snail className="size-5" />} onClick={() => listen(true)} disabled={!plays}>
          Slower
        </Button>
      </div>
      <textarea
        className={clsx('mt-4 w-full rounded-xl bg-surface p-3.5 text-[17px] ring-1 focus:ring-2 focus:ring-primary focus:outline-none', diff ? 'ring-border opacity-70' : 'ring-border')}
        rows={3}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), !diff && typed.trim() && check())}
        placeholder={plays ? 'Type the sentence…' : 'Press Play first'}
        aria-label="Type what you hear"
        disabled={!!diff}
        spellCheck={false}
        autoCapitalize="sentences"
      />
      {!diff ? (
        <Button className="mt-3" block size="lg" disabled={!typed.trim()} onClick={check} icon={<Check className="size-5" />}>
          Check
        </Button>
      ) : (
        <div className="animate-pop mt-4 rounded-2xl bg-surface p-4 ring-1 ring-border">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold">{diff.accuracy >= 0.999 ? 'Perfect!' : `${Math.round(diff.accuracy * 100)}% correct`}</span>
            <span className="text-xs text-muted">
              {diff.counts.missing} missing · {diff.counts.wrong} wrong · {diff.counts.spelling} spelling
            </span>
          </div>
          <DiffView diff={diff} />
          <p className="mt-3 text-sm">
            <span className="text-muted">Correct: </span>
            {s.text}
          </p>
          <Button className="mt-4" block size="lg" onClick={next} icon={<ArrowRight className="size-5" />} autoFocus>
            {index + 1 < sentences.length ? 'Next sentence' : 'Finish'}
          </Button>
        </div>
      )}
    </div>
  );
}
