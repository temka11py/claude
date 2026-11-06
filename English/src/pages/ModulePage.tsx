import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, Clock, Lock, Play, RotateCcw, Target } from 'lucide-react';
import { get } from '../lib/api';
import type { ModuleView } from '../lib/types';
import { Badge, ButtonLink, Callout, Card, ErrorState, LevelBadge, Mn, PageHeader, ProgressBar, SkeletonCard, SkillBadge, clsx, useDocumentTitle } from '../components/ui';

interface ModuleResult {
  id: number;
  percent: number;
  passed: number;
  createdAt: string;
}

export default function ModulePage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['module', id], queryFn: () => get<{ module: ModuleView; results: ModuleResult[] }>(`/modules/${id}`) });
  useDocumentTitle(q.data?.module.title ?? 'Module');
  if (q.isLoading) return <SkeletonCard lines={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const m = q.data.module;
  const targets = m.targets as Record<string, string | string[] | undefined>;
  const nextLesson = m.lessons.find((l) => l.state === 'available' || l.state === 'in_progress');

  return (
    <div>
      <PageHeader
        back={{ to: '/course', label: 'Course' }}
        title={m.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <LevelBadge level={m.level} /> {m.topic} · module {m.order}
          </span>
        }
        actions={
          nextLesson && m.state !== 'locked' ? (
            <ButtonLink to={`/lesson/${nextLesson.id}`} icon={<Play className="size-4" />}>
              {nextLesson.state === 'in_progress' ? 'Continue' : 'Start'}: lesson {nextLesson.order}
            </ButtonLink>
          ) : undefined
        }
      />
      {m.state === 'locked' && <Callout kind="warning">{m.lockedReason}</Callout>}
      {m.state === 'optional' && <Callout kind="info">You placed above this level, so this module is optional — great for review.</Callout>}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Card>
            <p className="text-[15px] leading-relaxed">{m.description}</p>
            <Mn>{m.descriptionMn}</Mn>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>
                  {m.lessonsCompleted}/{m.lessonsTotal} lessons{m.testPassed ? ' · test passed' : ''}
                </span>
                <span>{Math.round(m.progress * 100)}%</span>
              </div>
              <ProgressBar value={m.progress} label="Module progress" />
            </div>
          </Card>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Lessons</h2>
            <ol className="space-y-2">
              {m.lessons.map((l) => {
                const locked = l.state === 'locked' || m.state === 'locked';
                const row = (
                  <div className={clsx('flex items-center gap-3 rounded-2xl p-4 ring-1 transition', locked ? 'bg-surface-2/60 ring-border' : 'bg-surface ring-border hover:ring-primary/60')}>
                    <span
                      className={clsx(
                        'flex size-10 shrink-0 items-center justify-center rounded-full font-bold',
                        l.state === 'completed' ? 'bg-success text-white dark:text-bg' : l.state === 'in_progress' ? 'bg-primary text-on-primary' : 'bg-surface-2 text-muted',
                      )}
                    >
                      {l.state === 'completed' ? <CircleCheck className="size-5" /> : locked ? <Lock className="size-4" /> : l.kind === 'review' ? <RotateCcw className="size-4" /> : l.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={clsx('font-semibold', locked && 'text-muted')}>{l.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" /> {l.minutes} min
                        </span>
                        {l.skills.slice(0, 4).map((s) => (
                          <SkillBadge key={s} skill={s} />
                        ))}
                        {l.bestScore !== null && <span>best {Math.round(l.bestScore * 100)}%</span>}
                      </div>
                    </div>
                    {!locked && <ArrowRight className="size-5 shrink-0 text-muted" />}
                  </div>
                );
                return <li key={l.id}>{locked ? row : <Link to={`/lesson/${l.id}`}>{row}</Link>}</li>;
              })}
              {m.hasTest && (
                <li>
                  <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-border">
                    <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-full', m.testPassed ? 'bg-success text-white dark:text-bg' : 'bg-accent-soft text-accent')}>
                      {m.testPassed ? <CircleCheck className="size-5" /> : <Target className="size-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">Module test</div>
                      <div className="text-xs text-muted">All six skills · about 30 min · pass mark 60%</div>
                    </div>
                    {m.state !== 'locked' && (
                      <ButtonLink to={`/test/module/${m.id}`} size="sm" variant={m.state === 'test_ready' ? 'primary' : 'secondary'}>
                        {m.testPassed ? 'Retake' : m.state === 'test_ready' ? 'Take test' : 'Test out'}
                      </ButtonLink>
                    )}
                  </div>
                </li>
              )}
            </ol>
          </section>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 font-semibold">Objectives</h2>
            <ul className="space-y-2">
              {m.objectives.map((o) => (
                <li key={o.text} className="flex items-start gap-2 text-sm">
                  <Target className="mt-0.5 size-4 shrink-0 text-primary" />
                  {o.text}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">What's in this module</h2>
            <dl className="space-y-2 text-sm">
              {(['grammar', 'vocabulary'] as const).map((k) =>
                Array.isArray(targets[k]) && (targets[k] as string[]).length ? (
                  <div key={k}>
                    <dt className="font-semibold capitalize">{k}</dt>
                    <dd className="text-muted">{(targets[k] as string[]).join(' · ')}</dd>
                  </div>
                ) : null,
              )}
              {(['reading', 'listening', 'speaking', 'writing', 'pronunciation'] as const).map((k) =>
                typeof targets[k] === 'string' ? (
                  <div key={k}>
                    <dt className="font-semibold capitalize">{k}</dt>
                    <dd className="text-muted">{targets[k] as string}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </Card>
          {q.data.results.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">Test history</h2>
              <ul className="space-y-1 text-sm">
                {q.data.results.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span className="text-muted">{new Date(r.createdAt).toLocaleDateString()}</span>
                    <Badge tone={r.passed ? 'success' : 'neutral'}>{Math.round(r.percent * 100)}%</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
