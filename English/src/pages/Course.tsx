import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, CircleCheck, Clock, Hourglass, Lock, Trophy } from 'lucide-react';
import { get } from '../lib/api';
import type { LevelView, ModuleView, NextStep } from '../lib/types';
import { Badge, ButtonLink, Card, ErrorState, PageHeader, ProgressBar, SkeletonCard, clsx, minutesLabel, useDocumentTitle } from '../components/ui';

interface CourseData {
  levels: LevelView[];
  next: NextStep;
  courseLevel: string;
  timeline: { label: string };
}

const STATE_LABEL: Record<ModuleView['state'], string> = {
  planned: 'In preparation',
  locked: 'Locked',
  available: 'Ready',
  in_progress: 'In progress',
  test_ready: 'Test ready',
  completed: 'Completed',
  optional: 'Optional review',
};

function ModuleRow({ m }: { m: ModuleView }) {
  const disabled = m.state === 'planned' || m.state === 'locked';
  const inner = (
    <div className={clsx('flex items-center gap-3 rounded-xl p-3 ring-1 transition', disabled ? 'bg-surface-2/60 ring-border' : 'bg-surface ring-border hover:ring-primary/60')}>
      <span
        className={clsx(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          m.state === 'completed' ? 'bg-success text-white dark:text-bg' : m.state === 'in_progress' || m.state === 'test_ready' ? 'bg-primary text-on-primary' : 'bg-surface-2 text-muted',
        )}
      >
        {m.state === 'completed' ? <CircleCheck className="size-5" /> : m.state === 'locked' ? <Lock className="size-4" /> : m.state === 'planned' ? <Hourglass className="size-4" /> : m.order}
      </span>
      <div className="min-w-0 flex-1">
        <div className={clsx('truncate font-semibold', disabled && 'text-muted')}>{m.title}</div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>{m.topic}</span>
          {m.state !== 'planned' && (
            <span>
              · {m.lessonsCompleted}/{m.lessonsTotal} lessons
            </span>
          )}
          {m.bestTestScore !== null && <span>· test {Math.round(m.bestTestScore * 100)}%</span>}
        </div>
        {!disabled && m.progress > 0 && m.state !== 'completed' && <ProgressBar value={m.progress} size="sm" className="mt-1.5" label={`${m.title} progress`} />}
      </div>
      <Badge tone={m.state === 'completed' ? 'success' : m.state === 'test_ready' ? 'accent' : m.state === 'in_progress' ? 'primary' : 'neutral'}>{STATE_LABEL[m.state]}</Badge>
    </div>
  );
  return disabled ? (
    <div title={m.lockedReason ?? (m.state === 'planned' ? 'The content for this module is still being written.' : undefined)}>{inner}</div>
  ) : (
    <Link to={`/module/${m.id}`}>{inner}</Link>
  );
}

function LevelSection({ l, open, onToggle }: { l: LevelView; open: boolean; onToggle: () => void }) {
  return (
    <Card className={clsx(l.current && 'ring-2 ring-primary')}>
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{l.title}</h2>
            {l.current && <Badge tone="primary">You are here</Badge>}
            {l.status === 'completed' && <Badge tone="success">Completed</Badge>}
            {l.status === 'placed_out' && <Badge>Placed out</Badge>}
            {l.status === 'locked' && (
              <Badge>
                <Lock className="size-3" /> Locked
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{l.description}</p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums">{Math.round(l.progress * 100)}%</span>
      </button>
      <ProgressBar value={l.progress} className="mt-3" label={`${l.code} progress`} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          {l.modulesCompleted}/{l.modulesPublished} modules completed
        </span>
        {l.modulesPlanned > 0 && <span>{l.modulesPlanned} in preparation</span>}
        {l.minutesRemaining > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> ~{minutesLabel(l.minutesRemaining)} of study left
          </span>
        )}
      </div>
      {open && (
        <div className="animate-fade-in mt-4 space-y-4">
          <div>
            <h3 className="mb-1.5 text-sm font-semibold">What you'll be able to do</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
              {l.canDo.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <ol className="space-y-2">
            {l.modules.map((m) => (
              <li key={m.id}>
                <ModuleRow m={m} />
              </li>
            ))}
          </ol>
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="flex items-center gap-2 font-semibold">
              <Trophy className="size-4 text-accent" /> {l.code} level exam
            </div>
            <p className="mt-1 text-sm text-muted">
              {l.examPassed
                ? `Passed${l.bestExamScore !== null ? ` with ${Math.round(l.bestExamScore * 100)}%` : ''}.`
                : !l.hasExam
                  ? 'The exam for this level is being prepared.'
                  : l.examAvailable
                    ? 'Available now. Pass it to unlock the next level.'
                    : 'Unlocks when you have completed at least half of the modules (all modules recommended).'}
            </p>
            {l.examAvailable && !l.examPassed && (
              <ButtonLink to={`/test/level/${encodeURIComponent(l.code)}`} size="sm" className="mt-2">
                Take the exam
              </ButtonLink>
            )}
            <p className="mt-2 text-xs text-muted">How this level unlocks: {l.unlockCondition}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Course() {
  const q = useQuery({ queryKey: ['course'], queryFn: () => get<CourseData>('/course') });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useDocumentTitle('Course');
  if (q.isLoading) return <SkeletonCard lines={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { levels, next, courseLevel, timeline } = q.data;
  const isOpen = (l: LevelView) => open[l.code] ?? l.code === courseLevel;
  const nextTo = next.type === 'lesson' ? `/lesson/${next.lessonId}` : next.type === 'module_test' ? `/test/module/${next.moduleId}` : next.type === 'level_exam' ? `/test/level/${encodeURIComponent(next.level)}` : null;

  return (
    <div>
      <PageHeader
        title="Your course"
        subtitle={`B1 → C1 · remaining: ${timeline.label}`}
        actions={
          nextTo && (
            <ButtonLink to={nextTo} icon={<ArrowRight className="size-4" />}>
              Continue
            </ButtonLink>
          )
        }
      />
      <div className="space-y-2">
        {levels.map((l, i) => (
          <div key={l.code}>
            <LevelSection l={l} open={isOpen(l)} onToggle={() => setOpen({ ...open, [l.code]: !isOpen(l) })} />
            {i < levels.length - 1 && (
              <div className="flex justify-center py-1 text-muted" aria-hidden>
                <ArrowDown className="size-5" />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted">
        Levels are unlocked by evidence (level exams), not by time. <Link to="/certificate" className="text-primary">Course completion page</Link>
      </p>
    </div>
  );
}
