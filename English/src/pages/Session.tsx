import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, Clock, PartyPopper, Play, SkipForward, X } from 'lucide-react';
import { get, post } from '../lib/api';
import { useToast } from '../lib/context';
import type { ActivityResult, PlannedItem, SessionView } from '../lib/types';
import { stopSpeaking } from '../lib/tts';
import { ReviewDeck } from '../components/activities/ReviewDeck';
import { DictationActivity } from '../components/activities/Dictation';
import { ShadowingActivity } from '../components/activities/Shadowing';
import { GrammarReview } from '../components/activities/GrammarReview';
import { MistakesReview } from '../components/activities/MistakesReview';
import { ChallengeActivity } from '../components/activities/Challenge';
import { ListeningPractice, ReadingPractice, SpeakingPractice, WritingPractice } from '../components/activities/PracticeWrappers';
import { GameHost } from '../components/games/GameHost';
import { LessonPlayerView } from '../components/lesson/LessonPlayer';
import { TestFlow } from './TestRunner';
import { Button, Callout, Card, ErrorState, ProgressBar, SkillBadge, Spinner, clsx, useDocumentTitle } from '../components/ui';

function ItemActivity({ item, onDone }: { item: PlannedItem; onDone: () => void }) {
  const p = item.payload as Record<string, string | number>;
  switch (item.type) {
    case 'review':
      return <ReviewDeck limit={Number(p.count) || 20} source="session" onComplete={onDone} compact />;
    case 'lesson':
      return (
        <LessonPlayerView
          lessonId={String(p.lessonId)}
          fromStep={p.fromStep === undefined ? undefined : Number(p.fromStep)}
          toStep={p.toStep === undefined ? undefined : Number(p.toStep)}
          embedded
          onExit={onDone}
          onRangeComplete={onDone}
        />
      );
    case 'module_test':
      return <TestFlow kind="module" id={String(p.moduleId)} onDone={onDone} />;
    case 'listening':
      return <ListeningPractice id={String(p.materialId)} onDone={onDone} />;
    case 'reading':
      return <ReadingPractice id={String(p.materialId)} onDone={onDone} />;
    case 'speaking':
      return <SpeakingPractice id={String(p.taskId)} onDone={onDone} />;
    case 'writing':
      return <WritingPractice id={String(p.taskId)} onDone={onDone} />;
    case 'dictation':
      return <DictationActivity count={Number(p.count) || 5} onComplete={onDone} />;
    case 'shadowing':
      return <ShadowingActivity count={Number(p.count) || 4} onComplete={onDone} />;
    case 'grammar_review':
      return <GrammarReview count={Number(p.count) || 8} onComplete={onDone} />;
    case 'mistakes':
      return <MistakesReview limit={Number(p.count) || 6} onComplete={onDone} />;
    case 'game':
      return <GameHost gameId={String(p.game)} onFinish={onDone} />;
    case 'challenge':
      return <ChallengeActivity onComplete={onDone} />;
  }
}

export default function Session() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { reward } = useToast();
  const [active, setActive] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [finished, setFinished] = useState<{ xp: number } | null>(null);
  useDocumentTitle("Today's session");

  const q = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const today = await get<{ session: SessionView | null }>('/session/today');
      if (today.session) return today.session;
      return (await post<{ session: SessionView }>('/session/start')).session;
    },
    staleTime: Infinity,
  });
  const replan = useMutation({
    mutationFn: () => post<{ session: SessionView }>('/session/start', { replan: true }),
    onSuccess: (r) => {
      qc.setQueryData(['session'], r.session);
      setFinished(null);
      setSkipped([]);
      setActive(null);
    },
  });

  useEffect(() => () => stopSpeaking(), []);

  if (q.isLoading) return <Spinner label="Planning your session…" />;
  if (q.error || !q.data) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  }
  const s = q.data;
  const nextIndex = s.items.findIndex((it, i) => !it.done && !skipped.includes(i));
  const allDone = s.items.every((it) => it.done);

  async function complete(index: number) {
    stopSpeaking();
    try {
      const r = await post<{ session: SessionView } & ActivityResult>(`/session/${s.id}/items/${index}/complete`);
      qc.setQueryData(['session'], r.session);
      reward(r);
      if (r.session.status === 'completed') setFinished({ xp: r.xp });
    } catch {
      /* keep going even if the tick can't be saved */
    }
    setActive(null);
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    window.scrollTo({ top: 0 });
  }

  const header = (
    <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/')} className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-2" aria-label="Back to Today (progress is saved)">
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Today's session</div>
          <div className="text-xs text-muted">
            {s.items.filter((i) => i.done).length}/{s.items.length} done · about {s.plannedMinutes} min
          </div>
        </div>
      </div>
      <ProgressBar value={s.progress} size="sm" className="mt-2" label="Session progress" />
    </header>
  );

  if (active !== null) {
    const item = s.items[active];
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-3 sm:px-6">
        {header}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{item.title}</h1>
            <p className="text-sm text-muted">{item.reason}</p>
          </div>
          <SkillBadge skill={item.skill} />
        </div>
        <ItemActivity key={active} item={item} onDone={() => void complete(active)} />
        <div className="mt-8 text-center">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-text"
            onClick={() => {
              stopSpeaking();
              setSkipped([...skipped, active]);
              setActive(null);
            }}
          >
            <SkipForward className="size-4" /> Skip this for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-3 sm:px-6">
      {header}
      {finished || allDone ? (
        <Card className="animate-pop text-center">
          <PartyPopper className="mx-auto size-10 text-accent" />
          <h1 className="mt-3 text-2xl font-bold">Session complete!</h1>
          <p className="mt-1 text-muted">Great work today. Everything you practised is scheduled to come back at the right time.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={() => navigate('/')}>
              Back to Today
            </Button>
            <Button size="lg" variant="secondary" loading={replan.isPending} onClick={() => replan.mutate()}>
              I have time — extra session
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Callout kind={s.mode === 'recovery' ? 'success' : 'info'}>{s.message}</Callout>
          <ol className="mt-5 space-y-2">
            {s.items.map((it, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={it.done}
                  onClick={() => setActive(i)}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-2xl p-4 text-left ring-1 transition',
                    it.done ? 'bg-success-soft/60 ring-success/20' : i === nextIndex ? 'bg-surface ring-2 ring-primary shadow-sm' : 'bg-surface ring-border hover:ring-primary/50',
                  )}
                >
                  <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold', it.done ? 'bg-success text-white dark:text-bg' : 'bg-surface-2 text-muted')}>
                    {it.done ? <CircleCheck className="size-5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{it.title}</span>
                    <span className="block text-sm text-muted">{it.reason}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                    <Clock className="size-3.5" /> {it.minutes}m
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {nextIndex >= 0 ? (
            <Button className="mt-5" block size="lg" icon={nextIndex === 0 ? <Play className="size-5" /> : <ArrowRight className="size-5" />} onClick={() => setActive(nextIndex)}>
              {s.items.some((i) => i.done) ? `Continue: ${s.items[nextIndex].title}` : 'Start'}
            </Button>
          ) : (
            <Callout kind="tip">You skipped some activities. Tap one above to do it now, or come back later — they stay in today's plan.</Callout>
          )}
        </>
      )}
    </div>
  );
}
