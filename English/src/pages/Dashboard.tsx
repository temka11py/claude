import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Brain, CalendarClock, Flame, Play, Snowflake, Sparkles, Target, Trophy, Wrench } from 'lucide-react';
import { get } from '../lib/api';
import { useAuth } from '../lib/context';
import type { Dashboard as DashboardData, NextStep, PlannedItem } from '../lib/types';
import { ColumnChart, ChartCard, DataTable, SkillLevels, longDay, shortDay } from '../components/charts';
import { Badge, ButtonLink, Callout, Card, ErrorState, LevelBadge, ProgressBar, Ring, SectionTitle, SkeletonCard, SkillBadge, clsx, useDocumentTitle } from '../components/ui';

function nextStepView(n: NextStep): { title: string; subtitle: string; to: string; cta: string } | null {
  switch (n.type) {
    case 'lesson':
      return { title: n.lessonTitle, subtitle: `${n.moduleTitle} · ${n.kind === 'review' ? 'Module review' : `${n.minutes} min`}`, to: `/lesson/${n.lessonId}`, cta: n.currentStep > 0 ? 'Continue lesson' : 'Start lesson' };
    case 'module_test':
      return { title: `Module test: ${n.moduleTitle}`, subtitle: 'All lessons done — show what you have learned', to: `/test/module/${n.moduleId}`, cta: 'Take the test' };
    case 'level_exam':
      return { title: `${n.level} level exam`, subtitle: 'The step to the next level', to: `/test/level/${encodeURIComponent(n.level)}`, cta: 'Take the exam' };
    case 'waiting':
      return { title: 'Keep practising', subtitle: n.message, to: '/practice', cta: 'Practice' };
    case 'done':
      return { title: 'Course complete!', subtitle: 'You finished the C1 journey.', to: '/certificate', cta: 'See your achievement' };
  }
}

function PlanPreview() {
  const q = useQuery({ queryKey: ['session-preview'], queryFn: () => get<{ items: PlannedItem[]; totalMinutes: number; message: string; mode: string }>('/session/preview'), staleTime: 60_000 });
  if (!q.data) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {q.data.items.slice(0, 5).map((it, i) => (
        <li key={i} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />
            <span className="truncate">{it.title}</span>
          </span>
          <span className="shrink-0 opacity-80">{it.minutes} min</span>
        </li>
      ))}
      {q.data.items.length > 5 && <li className="text-xs opacity-80">+ {q.data.items.length - 5} more</li>}
    </ul>
  );
}

export default function Dashboard() {
  const { status } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<DashboardData>('/dashboard'), staleTime: 15_000 });
  useDocumentTitle('Today');

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard lines={4} />
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const next = nextStepView(d.next);
  const goalPct = d.today.goalMinutes ? d.today.minutes / d.today.goalMinutes : 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const sessionDone = d.session?.status === 'completed';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-muted">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">
            {greeting}, {status?.user?.displayName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <LevelBadge level={d.user.courseLevel} />
          <span className="text-sm text-muted">
            Estimated level <strong className="text-text">{d.profile.overall.label}</strong>
          </span>
        </div>
      </div>

      {d.welcomeBack && <Callout kind="success" title={d.welcomeBack}>Your progress is exactly where you left it. Today's session is lighter, to help you get back into the rhythm.</Callout>}
      {d.user.placementStatus === 'skipped' && (
        <Callout kind="info" title="Want a more accurate starting point?">
          You skipped the placement test. <Link to="/placement" className="font-semibold text-primary underline">Take it any time</Link> to get a CEFR profile for each skill.
        </Callout>
      )}

      {/* Today's session — the one big action */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl bg-[linear-gradient(135deg,#4f46e5,#3730a3)] p-5 text-white shadow-lg sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{sessionDone ? "Today's session is done 🎉" : d.session ? "Today's session" : 'Start today’s session'}</h2>
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">{d.session ? `${d.session.minutes} min` : `${d.today.goalMinutes} min goal`}</span>
          </div>
          {d.today.isRestDay && !d.session && <p className="mt-1 text-sm opacity-90">Today is a rest day in your every-other-day plan — studying anyway is a bonus.</p>}
          {d.session ? (
            <div className="mt-3">
              <ProgressBar value={d.session.progress} color="bg-white" className="bg-white/25" label="Session progress" />
              <p className="mt-2 text-sm opacity-90">
                {d.session.done} of {d.session.items} activities done
              </p>
            </div>
          ) : (
            <PlanPreview />
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/session" className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 font-semibold text-[#3730a3] shadow transition active:scale-[0.98]">
              <Play className="size-5" />
              {sessionDone ? 'Extra practice' : d.session ? 'Continue session' : 'Start today’s session'}
            </Link>
          </div>
        </div>

        <Card className="flex items-center gap-5">
          <Ring value={goalPct} size={96} stroke={9} label={`${d.today.minutes} of ${d.today.goalMinutes} minutes today`}>
            <div>
              <div className="text-xl font-bold">{d.today.minutes}</div>
              <div className="text-[10px] text-muted">of {d.today.goalMinutes} min</div>
            </div>
          </Ring>
          <div className="min-w-0 space-y-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Today's goal</div>
              <div className="font-semibold">{goalPct >= 1 ? 'Goal reached!' : `${Math.max(0, d.today.goalMinutes - d.today.minutes)} min to go`}</div>
            </div>
            <div className="flex items-center gap-2">
              <Flame className={clsx('size-5', d.streak.status === 'at_risk' ? 'text-warning' : 'text-accent')} />
              <span className="font-semibold">{d.streak.current}-day streak</span>
            </div>
            <div className="text-xs text-muted">
              {d.streak.status === 'at_risk' && 'Study today to keep your streak.'}
              {d.streak.status === 'protected' && 'A streak freeze is protecting your streak.'}
              {d.streak.status === 'active' && `Longest: ${d.streak.longest} day${d.streak.longest === 1 ? '' : 's'}`}
              {(d.streak.status === 'none' || d.streak.status === 'broken') && 'Every study day counts. No pressure.'}
              {d.streak.freezes > 0 && (
                <span className="ml-1 inline-flex items-center gap-0.5">
                  · <Snowflake className="size-3" /> {d.streak.freezes}
                </span>
              )}
            </div>
          </div>
        </Card>
      </section>

      {/* Continue learning + Review due */}
      <section className="grid gap-4 md:grid-cols-2">
        {next && (
          <Card>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Continue learning</div>
            <h3 className="mt-1 text-lg font-bold">{next.title}</h3>
            <p className="text-sm text-muted">{next.subtitle}</p>
            {d.level && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>{d.level.title}</span>
                  <span>
                    {d.level.modulesCompleted}/{d.level.modulesPublished} modules
                  </span>
                </div>
                <ProgressBar value={d.level.progress} size="sm" label="Level progress" />
              </div>
            )}
            <ButtonLink to={next.to} className="mt-4" icon={<ArrowRight className="size-4" />}>
              {next.cta}
            </ButtonLink>
          </Card>
        )}
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Review due</div>
          <div className="mt-2 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Brain className="size-6 text-primary" />
              <div>
                <div className="text-2xl font-bold">{d.review.due}</div>
                <div className="text-xs text-muted">words</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Wrench className="size-6 text-accent" />
              <div>
                <div className="text-2xl font-bold">{d.review.mistakesDue}</div>
                <div className="text-xs text-muted">mistakes</div>
              </div>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted">
            {d.review.due ? 'Reviewing now moves these words into long-term memory.' : 'No words due — new ones arrive after each lesson.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink to="/review" variant={d.review.due ? 'primary' : 'secondary'}>
              Review words
            </ButtonLink>
            {d.review.mistakesDue > 0 && (
              <ButtonLink to="/practice/mistakes" variant="secondary">
                Fix mistakes
              </ButtonLink>
            )}
          </div>
        </Card>
      </section>

      {/* Skills + weekly activity */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle
            action={
              <Link to="/progress" className="text-sm font-semibold text-primary">
                Details
              </Link>
            }
          >
            Your skills
          </SectionTitle>
          <SkillLevels skills={d.profile.skills} />
          {d.profile.skills.some((s) => s.provisional) && <p className="mt-3 text-xs text-muted">Faded bars are early estimates — they sharpen as you complete activities.</p>}
        </Card>
        <ChartCard
          title="This week"
          subtitle={`Minutes studied per day · goal ${d.today.goalMinutes} min`}
          table={<DataTable columns={['Day', 'Minutes']} rows={d.weekly.map((w) => [longDay(w.date), w.minutes])} />}
        >
          <ColumnChart data={d.weekly.map((w) => ({ key: w.date, label: shortDay(w.date), long: longDay(w.date), value: w.minutes }))} target={d.today.goalMinutes} />
        </ChartCard>
      </section>

      {/* Focus + challenge */}
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle>Weak areas & this week's focus</SectionTitle>
          {d.weakAreas.length === 0 && d.focusMessages.length === 0 ? (
            <p className="text-sm text-muted">{d.isNew ? 'After a few lessons, the areas that need attention will appear here.' : 'No weak areas right now — balanced progress!'}</p>
          ) : (
            <div className="space-y-3">
              {d.weakAreas.map((w) => (
                <div key={w.label} className="flex items-center justify-between gap-2">
                  <SkillBadge skill={w.skill} />
                  <span className="text-sm text-muted">{w.detail}</span>
                </div>
              ))}
              {d.focusMessages.map((m) => (
                <p key={m} className="rounded-xl bg-surface-2 p-3 text-sm">
                  <Sparkles className="mr-1 inline size-4 text-primary" />
                  {m}
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <SectionTitle
            action={
              d.challenge.status === 'done' ? (
                <Badge tone="success">Done</Badge>
              ) : (
                <Badge tone="accent">+30 XP</Badge>
              )
            }
          >
            Daily challenge
          </SectionTitle>
          <div className="flex items-start gap-3">
            <Target className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <div className="font-semibold">{(d.challenge as { title?: string }).title}</div>
              <p className="text-sm text-muted">{(d.challenge as { instructions?: string }).instructions}</p>
            </div>
          </div>
          {d.challenge.status !== 'done' && (
            <ButtonLink to="/practice/challenge" variant="soft" className="mt-4">
              Take the challenge
            </ButtonLink>
          )}
        </Card>
      </section>

      {/* Progress summary */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <Trophy className="size-4" /> Rank
          </div>
          <div className="mt-1 text-lg font-bold">{d.xp.rank.title}</div>
          <div className="text-sm text-muted">{d.xp.xp.toLocaleString()} XP</div>
          {d.xp.nextRank && (
            <div className="mt-2">
              <ProgressBar value={d.xp.progress} size="sm" color="bg-accent" label="Progress to next rank" />
              <div className="mt-1 text-xs text-muted">
                {(d.xp.nextRank.minXp - d.xp.xp).toLocaleString()} XP to {d.xp.nextRank.title}
              </div>
            </div>
          )}
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Vocabulary</div>
          <div className="mt-1 text-lg font-bold">{d.vocab.learned} words learned</div>
          <div className="text-sm text-muted">
            {d.vocab.byState.MASTERED} mastered · {d.vocab.byState.LEARNING + d.vocab.byState.REVIEW} still learning
          </div>
          <Link to="/vocabulary" className="mt-2 inline-block text-sm font-semibold text-primary">
            Open my words →
          </Link>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <CalendarClock className="size-4" /> Course timeline
          </div>
          <div className="mt-1 text-[15px]">
            At your {d.timeline.basis === 'recent_pace' ? 'current pace' : 'planned pace'}, the rest of the course takes <strong>{d.timeline.label}</strong>.
          </div>
          <div className="mt-1 text-xs text-muted">An estimate, not a promise — it updates as you study.</div>
        </Card>
      </section>

      {d.achievements.recent.length > 0 && (
        <Card>
          <SectionTitle
            action={
              <Link to="/achievements" className="text-sm font-semibold text-primary">
                {d.achievements.earned}/{d.achievements.total}
              </Link>
            }
          >
            Recent achievements
          </SectionTitle>
          <div className="flex flex-wrap gap-2">
            {d.achievements.recent.map((a) => (
              <Badge key={a.code} tone="accent">
                <Trophy className="size-3" /> {a.title}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
