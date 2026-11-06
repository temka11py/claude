import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CircleCheck, Minus, Sparkles } from 'lucide-react';
import { labelFor } from '@shared/cefr';
import { get } from '../lib/api';
import type { Analytics, KnowledgeMap, MonthlyReport, WeeklyReport } from '../lib/types';
import { CefrLineChart, ChartCard, ColumnChart, DataTable, LineLegend, SKILL_ORDER, SkillLevels, longDay, shortDay, type LineSeries } from '../components/charts';
import { Badge, Callout, Card, ErrorState, PageHeader, ProgressBar, SKILL_COLOR, SectionTitle, SkeletonCard, Stat, Tabs, clsx, minutesLabel, percent, useDocumentTitle } from '../components/ui';

type Tab = 'overview' | 'weekly' | 'monthly' | 'map';

function addDays(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function Overview() {
  const q = useQuery({ queryKey: ['analytics'], queryFn: () => get<Analytics>('/analytics') });
  const [shown, setShown] = useState<string[]>(['overall']);
  if (q.isLoading) return <SkeletonCard lines={5} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data;
  const history = a.cefrHistory;
  const series: LineSeries[] = [
    { key: 'overall', label: 'Overall', color: 'var(--text)', points: history.map((h) => ({ x: h.date, y: h.overall })) },
    ...SKILL_ORDER.filter((s) => s !== 'pronunciation').map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1), color: SKILL_COLOR[s], points: history.map((h) => ({ x: h.date, y: (h.skills as Record<string, number>)[s] ?? null })) })),
  ];
  const visible = series.filter((s) => shown.includes(s.key));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Study time" value={minutesLabel(a.studyMinutes)} hint={`${a.studyDays} study days`} />
        <Stat label="Lessons completed" value={a.lessonsCompleted} />
        <Stat label="Words learned" value={a.wordsLearned} hint={`${a.wordsMastered} mastered`} />
        <Stat label="Questions answered" value={a.questionsAnswered.toLocaleString()} hint={`accuracy ${percent(a.accuracy)}`} />
        <Stat label="Review recall" value={percent(a.reviews.recallRate)} hint={`${a.reviews.done} reviews`} />
        <Stat label="Words forgotten" value={a.wordsForgotten} hint="after 7+ days" />
        <Stat label="Speaking attempts" value={a.speakingAttempts} />
        <Stat label="Texts written" value={a.writingSubmissions} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>
            CEFR estimate — <span className="text-primary">{a.skillProfile.overall.label}</span>
          </SectionTitle>
          <SkillLevels skills={a.skillProfile.skills} />
          <p className="mt-3 text-xs text-muted">Estimates from placement, lesson quizzes, module tests and level exams. Faded = not enough evidence yet.</p>
        </Card>
        <ChartCard
          title="Accuracy by skill"
          subtitle="All answers so far"
          table={<DataTable columns={['Skill', 'Accuracy']} rows={SKILL_ORDER.filter((s) => s in a.accuracyBySkill).map((s) => [s, percent(a.accuracyBySkill[s as keyof typeof a.accuracyBySkill])])} />}
        >
          <ul className="space-y-2.5">
            {SKILL_ORDER.filter((s) => s in a.accuracyBySkill).map((s) => {
              const v = a.accuracyBySkill[s as keyof typeof a.accuracyBySkill];
              return (
                <li key={s} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-sm">
                  <span className="flex items-center gap-1.5 capitalize">
                    <span className="size-2 rounded-full" style={{ background: SKILL_COLOR[s] }} aria-hidden />
                    {s}
                  </span>
                  <div className="h-2.5 rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${(v ?? 0) * 100}%`, background: SKILL_COLOR[s] }} />
                  </div>
                  <span className="text-right font-semibold">{percent(v)}</span>
                </li>
              );
            })}
          </ul>
        </ChartCard>
      </div>

      <ChartCard
        title="Level over time"
        subtitle="Choose which lines to show"
        legend={
          <div className="flex flex-wrap gap-1.5">
            {series.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={shown.includes(s.key)}
                onClick={() => setShown(shown.includes(s.key) ? shown.filter((x) => x !== s.key) : [...shown, s.key].slice(-4))}
                className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1', shown.includes(s.key) ? 'bg-surface-2 text-text ring-border' : 'text-muted ring-transparent')}
              >
                <span className="h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden /> {s.label}
              </button>
            ))}
          </div>
        }
        table={<DataTable columns={['Date', 'Overall', ...SKILL_ORDER.slice(0, 6)]} rows={history.map((h) => [h.date, labelFor(h.overall), ...SKILL_ORDER.slice(0, 6).map((s) => ((h.skills as Record<string, number>)[s] !== undefined ? labelFor((h.skills as Record<string, number>)[s]) : '—'))])} />}
      >
        <CefrLineChart series={visible} />
        <LineLegend series={visible} />
      </ChartCard>

      <ChartCard
        title="Study consistency — last 4 weeks"
        subtitle={`${a.consistency.studiedDays} study days (plan: about ${a.consistency.scheduledDays})`}
        table={<DataTable columns={['Day', 'Minutes']} rows={a.consistency.last28.map((d) => [longDay(d.date), d.minutes])} />}
      >
        <ColumnChart data={a.consistency.last28.map((d) => ({ key: d.date, label: d.date.slice(8), long: longDay(d.date), value: d.minutes }))} highlightLast={false} />
      </ChartCard>
    </div>
  );
}

function Weekly() {
  const [week, setWeek] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['weekly', week], queryFn: () => get<WeeklyReport>(`/reports/weekly${week ? `?week=${week}` : ''}`) });
  if (q.isLoading) return <SkeletonCard lines={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;
  const fmt = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" className="rounded-lg p-2 hover:bg-surface-2" onClick={() => setWeek(addDays(r.weekStart, -7))} aria-label="Previous week">
          <ChevronLeft className="size-5" />
        </button>
        <div className="font-semibold">
          {fmt(r.weekStart)} – {fmt(r.weekEnd)}
        </div>
        <button type="button" className="rounded-lg p-2 hover:bg-surface-2 disabled:opacity-30" disabled={!week} onClick={() => setWeek(addDays(r.weekStart, 7))} aria-label="Next week">
          <ChevronRight className="size-5" />
        </button>
      </div>
      {r.highlights.map((h) => (
        <Callout key={h} kind="info">
          {h}
        </Callout>
      ))}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Study time" value={minutesLabel(r.minutes)} hint={`${r.studyDays}/${r.plannedStudyDays} planned days`} />
        <Stat label="Lessons" value={r.lessonsCompleted} />
        <Stat label="New words" value={r.words.new} hint={`${r.words.learned} learned · ${r.words.mastered} mastered`} />
        <Stat label="Accuracy" value={percent(r.accuracy.overall)} hint={`${r.accuracy.answered} answers`} />
        <Stat label="Reviews" value={r.words.reviews} />
        <Stat label="Still fragile" value={r.words.stillFragile} hint="words needing frequent review" />
        <Stat label="Speaking" value={r.speaking.attempts} hint={`${r.speaking.minutes} min recorded`} />
        <Stat label="Writing" value={r.writing.submissions} hint={`${r.writing.words} words`} />
      </div>
      <ChartCard title="Minutes per day" table={<DataTable columns={['Day', 'Minutes']} rows={r.days.map((d) => [longDay(d.date), d.minutes])} />}>
        <ColumnChart data={r.days.map((d) => ({ key: d.date, label: shortDay(d.date), long: longDay(d.date), value: d.minutes }))} highlightLast={false} />
      </ChartCard>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-semibold">Accuracy by skill this week</h3>
          {Object.keys(r.accuracy.bySkill).length === 0 ? (
            <p className="text-sm text-muted">No answers recorded this week.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {SKILL_ORDER.filter((s) => r.accuracy.bySkill[s]).map((s) => (
                <li key={s} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 capitalize">
                    <span className="size-2 rounded-full" style={{ background: SKILL_COLOR[s] }} aria-hidden /> {s}
                  </span>
                  <span className="font-semibold">
                    {percent(r.accuracy.bySkill[s].accuracy)} <span className="text-xs font-normal text-muted">({r.accuracy.bySkill[s].answered})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase text-success">Strong</div>
              {r.strong.join(', ') || '—'}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-accent">Weak</div>
              {r.weak.join(', ') || '—'}
            </div>
          </div>
        </Card>
        <Card>
          <h3 className="mb-2 font-semibold">This week you studied</h3>
          {r.lessons.length ? (
            <ul className="space-y-1 text-sm">
              {r.lessons.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span className="truncate">{l.title}</span>
                  <span className="text-muted">{percent(l.score)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No lessons completed this week.</p>
          )}
          {r.grammarTopics.length > 0 && <p className="mt-2 text-sm text-muted">Grammar: {r.grammarTopics.join(', ')}</p>}
        </Card>
      </div>
      <Card>
        <h3 className="mb-2 flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" /> Recommended next week
        </h3>
        <ul className="list-disc space-y-1 pl-5 text-[15px]">
          {r.nextWeek.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Monthly() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const q = useQuery({ queryKey: ['monthly', month], queryFn: () => get<MonthlyReport>(`/reports/monthly?month=${month}`) });
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const series = useMemo<LineSeries[]>(() => {
    if (!q.data) return [];
    const s = q.data.cefr.series as { date: string; overall: number }[];
    return [{ key: 'overall', label: 'Overall', color: 'var(--primary)', points: s.map((p) => ({ x: p.date, y: p.overall })) }];
  }, [q.data]);
  if (q.isLoading) return <SkeletonCard lines={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;
  const title = new Date(`${month}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" className="rounded-lg p-2 hover:bg-surface-2" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft className="size-5" />
        </button>
        <div className="font-semibold">{title}</div>
        <button type="button" className="rounded-lg p-2 hover:bg-surface-2" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="CEFR estimate" value={r.cefr.end.label} hint={r.cefr.start ? `from ${r.cefr.start.label}` : undefined} />
        <Stat label="Study time" value={minutesLabel(r.minutes)} hint={`${r.consistency.studiedDays}/${r.consistency.scheduledDays} planned days`} />
        <Stat label="Words learned" value={r.vocabulary.learnedThisMonth} hint={`${r.vocabulary.learnedInApp} in total`} />
        <Stat label="Vocabulary size" value={`${(r.vocabulary.estimatedSize.low / 1000).toFixed(1)}–${(r.vocabulary.estimatedSize.high / 1000).toFixed(1)}k`} hint="word families (rough)" />
        <Stat label="Grammar coverage" value={`${r.grammar.studiedTopics}/${r.grammar.totalTopics}`} hint={`accuracy ${percent(r.grammar.accuracy)}`} />
        <Stat label="Reading" value={percent(r.reading.accuracy)} hint={`${r.reading.answered} answers`} />
        <Stat label="Listening" value={percent(r.listening.accuracy)} hint={`${r.listening.answered} answers`} />
        <Stat label="Speaking · Writing" value={`${r.speaking.attempts} · ${r.writing.submissions}`} hint={r.writing.averageScore !== null ? `writing avg ${Math.round(r.writing.averageScore)}` : undefined} />
      </div>
      <ChartCard
        title="CEFR estimate this month"
        table={<DataTable columns={['Date', 'Overall']} rows={(r.cefr.series as { date: string; overall: number }[]).map((p) => [p.date, labelFor(p.overall)])} />}
      >
        <CefrLineChart series={series} height={180} />
      </ChartCard>
      <ChartCard
        title="Accuracy by week"
        table={<DataTable columns={['Week', ...SKILL_ORDER.slice(0, 6)]} rows={r.weeks.map((w) => [w.weekStart, ...SKILL_ORDER.slice(0, 6).map((s) => percent(w.bySkill[s]))])} />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-1 text-left font-semibold">Week of</th>
                {SKILL_ORDER.slice(0, 6).map((s) => (
                  <th key={s} className="px-1 py-1 font-semibold capitalize">
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full" style={{ background: SKILL_COLOR[s] }} aria-hidden />
                      {s.slice(0, 5)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.weeks.map((w) => (
                <tr key={w.weekStart} className="border-t border-border/60">
                  <td className="py-1.5">{w.weekStart.slice(5)}</td>
                  {SKILL_ORDER.slice(0, 6).map((s) => {
                    const v = w.bySkill[s];
                    return (
                      <td key={s} className="px-1 py-1.5 text-center tabular-nums">
                        {v === null || v === undefined ? <Minus className="mx-auto size-3 text-muted" aria-label="no data" /> : `${Math.round(v * 100)}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-semibold">Most common mistakes</h3>
          {r.mistakes.top.length ? (
            <ul className="space-y-2 text-sm">
              {r.mistakes.top.map((m, i) => (
                <li key={i}>
                  <span className="text-danger">{m.wrong}</span> → <strong>{m.correct}</strong> <span className="text-xs text-muted">×{m.occurrences}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No repeated mistakes yet.</p>
          )}
          <p className="mt-2 text-xs text-muted">{r.mistakes.resolved} mistakes fixed so far.</p>
        </Card>
        <Card>
          <h3 className="mb-2 font-semibold">Recommended focus</h3>
          {r.recommendedFocus.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {r.recommendedFocus.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Balanced progress — keep your current routine.</p>
          )}
          <div className="mt-3">
            <div className="mb-1 text-xs text-muted">Study consistency</div>
            <ProgressBar value={r.consistency.ratio} label="Study consistency" />
          </div>
        </Card>
      </div>
      <p className="text-xs text-muted">{r.vocabulary.estimatedSize.basis}. It's a rough guide based on research ranges, not a precise count.</p>
    </div>
  );
}

function Mastery({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted">not started</span>;
  if (value >= 0.85) return <CircleCheck className="size-4 text-success" aria-label={`${Math.round(value * 100)}%`} />;
  return <span className="text-xs font-semibold tabular-nums">{Math.round(value * 100)}%</span>;
}

function MapView() {
  const q = useQuery({ queryKey: ['knowledge-map'], queryFn: () => get<KnowledgeMap>('/knowledge-map') });
  if (q.isLoading) return <SkeletonCard lines={8} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Your English, level by level. ✓ = strong (85%+). Percentages show accuracy or how well you know the words.</p>
      {q.data.map((level) => (
        <Card key={level.level}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold">{level.level}</h3>
            <Badge tone={level.status === 'locked' ? 'neutral' : 'primary'}>{level.status === 'locked' ? 'locked' : `${Math.round(level.progress * 100)}% of the course`}</Badge>
          </div>
          <ul className="space-y-3 border-l-2 border-border pl-4">
            {level.branches.map((b) => (
              <li key={b.skill}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="size-2.5 rounded-full" style={{ background: SKILL_COLOR[b.skill] }} aria-hidden />
                    {b.title}
                  </span>
                  {'items' in b ? null : 'answered' in b ? (
                    <span className="text-sm">
                      <Mastery value={b.mastery ?? null} /> <span className="text-xs text-muted">({b.answered} answers)</span>
                    </span>
                  ) : (
                    <span className="text-sm">
                      <Mastery value={b.mastery ?? null} /> <span className="text-xs text-muted">({b.attempts} tasks)</span>
                    </span>
                  )}
                </div>
                {'items' in b && (
                  <ul className="mt-1.5 space-y-1 border-l border-border pl-4">
                    {(b.items ?? []).length === 0 && <li className="text-xs text-muted">Nothing here yet.</li>}
                    {(b.items ?? []).map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{it.title}</span>
                        <Mastery value={'total' in it ? (it.seen ? it.mastery : null) : it.mastery} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default function Progress() {
  const [tab, setTab] = useState<Tab>('overview');
  useDocumentTitle('Progress');
  return (
    <div>
      <PageHeader title="Progress" subtitle="What has improved, what is still weak, and what to study next." />
      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'weekly', label: 'Weekly report' },
          { value: 'monthly', label: 'Monthly report' },
          { value: 'map', label: 'Knowledge map' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'overview' && <Overview />}
      {tab === 'weekly' && <Weekly />}
      {tab === 'monthly' && <Monthly />}
      {tab === 'map' && <MapView />}
    </div>
  );
}
