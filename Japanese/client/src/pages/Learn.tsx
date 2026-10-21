import { useState } from 'react';
import { Link } from 'react-router';
import { Check, ChevronDown, ClipboardCheck, Lock, PlayCircle } from 'lucide-react';
import type { LessonStatus, ModuleSummary } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Badge, ErrorState, PageHeader, ProgressBar, Spinner, cx } from '../components/ui';

export function StatusIcon({ status }: { status: LessonStatus }) {
  const base = 'grid size-8 shrink-0 place-items-center rounded-full';
  if (status === 'completed') return <span className={cx(base, 'bg-matcha text-white')}><Check className="size-4" /></span>;
  if (status === 'in_progress') return <span className={cx(base, 'bg-shu text-white')}><PlayCircle className="size-4" /></span>;
  if (status === 'available') return <span className={cx(base, 'border-2 border-shu bg-surface text-shu')}><span className="size-2 rounded-full bg-shu" /></span>;
  return <span className={cx(base, 'bg-surface-2 text-muted')}><Lock className="size-3.5" /></span>;
}

function statusText(s: LessonStatus, L: (mn: string, en: string) => string) {
  return { completed: L('Дууссан', 'Completed'), in_progress: L('Үргэлжилж буй', 'In progress'), available: L('Нээлттэй', 'Available'), locked: L('Түгжээтэй', 'Locked') }[s];
}

function ModuleCard({ m, defaultOpen }: { m: ModuleSummary; defaultOpen: boolean }) {
  const { L } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const pct = m.total ? Math.round((m.completed / m.total) * 100) : 0;
  const locked = m.lessons.every((l) => l.status === 'locked');
  return (
    <section className={cx('rounded-2xl border bg-surface', locked ? 'border-line opacity-80' : 'border-line')}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 p-4 text-left sm:p-5" aria-expanded={open}>
        <div className={cx('brush grid size-14 shrink-0 place-items-center rounded-2xl text-2xl font-semibold', pct === 100 ? 'bg-matcha-soft text-matcha' : locked ? 'bg-surface-2 text-muted' : 'bg-shu-soft text-shu')}>{m.titleJa.slice(0, 2)}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {L('Модуль', 'Module')} {m.order}
          </p>
          <h2 className="truncate text-lg font-semibold text-ink">{m.title}</h2>
          <p className="hidden truncate text-sm text-muted sm:block">{m.description}</p>
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar value={m.completed} max={m.total} tone={pct === 100 ? 'matcha' : 'shu'} className="max-w-56" />
            <span className="text-xs tabular-nums text-muted">
              {m.completed}/{m.total}
            </span>
          </div>
        </div>
        <ChevronDown className={cx('size-5 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-line px-2 pb-3 pt-2 sm:px-3">
          <ol className="relative">
            {m.lessons.map((l) => {
              const clickable = l.status !== 'locked';
              const inner = (
                <>
                  <StatusIcon status={l.status} />
                  <div className="min-w-0 flex-1">
                    <p className={cx('truncate font-medium', clickable ? 'text-ink' : 'text-muted')}>
                      <span className="mr-2 tabular-nums text-muted">
                        {m.order}.{l.order}
                      </span>
                      {l.title}
                    </p>
                    <p className="jp truncate text-xs text-muted">
                      {l.titleJa} · {l.minutes} {L('мин', 'min')}
                    </p>
                  </div>
                  <span className="hidden text-xs text-muted sm:block">{statusText(l.status, L)}</span>
                  {l.quizScore !== null && <Badge tone={l.quizScore >= 80 ? 'matcha' : 'yamabuki'}>{l.quizScore}%</Badge>}
                </>
              );
              return (
                <li key={l.id}>
                  {clickable ? (
                    <Link to={`/lessons/${l.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5" title={L('Өмнөх хичээлээ дуусгана уу', 'Finish the previous lesson first')}>
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {m.test && (
            <div className="mx-1 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <ClipboardCheck className={cx('size-5', m.test.passed ? 'text-matcha' : 'text-muted')} />
                <div>
                  <p className="text-sm font-medium text-ink">{L('Модулийн шалгалт', 'Module test')}</p>
                  <p className="text-xs text-muted">
                    {m.test.best !== null ? `${L('Хамгийн сайн', 'Best')}: ${m.test.best}%` : L('30 асуулт · тэнцэх 80%', '30 questions · pass 80%')}
                  </p>
                </div>
              </div>
              {m.test.available ? (
                <Link to={`/tests/${m.test.id}`} className="rounded-xl bg-shu px-4 py-2 text-sm font-medium text-white hover:bg-shu-strong">
                  {m.test.best !== null ? L('Дахин өгөх', 'Retake') : L('Шалгалт өгөх', 'Take test')}
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Lock className="size-3.5" />
                  {L('Бүх хичээлийг дуусгасны дараа', 'After all lessons')}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function Learn() {
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<{ modules: ModuleSummary[] }>('/modules');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const all = data.modules.flatMap((m) => m.lessons);
  const done = all.filter((l) => l.status === 'completed').length;
  const current = data.modules.find((m) => m.lessons.some((l) => l.status === 'in_progress' || l.status === 'available'));
  return (
    <div>
      <PageHeader
        titleJa="がくしゅうルート"
        title={L('Сургалтын зам', 'Learning path')}
        subtitle={L('Бичгийн системээс эхлээд JLPT N5 загвар шалгалт хүртэл. Хичээл бүрийг дуусгахад дараагийнх нь нээгдэнэ.', 'From the writing system to the JLPT N5 mock exam. Each completed lesson unlocks the next.')}
        actions={
          <div className="rounded-xl border border-line bg-surface px-4 py-2 text-sm">
            <span className="font-semibold tabular-nums text-ink">{done}</span>
            <span className="text-muted"> / {all.length} {L('хичээл', 'lessons')}</span>
          </div>
        }
      />
      <div className="flex flex-col gap-3">
        {data.modules.map((m) => (
          <ModuleCard key={m.id} m={m} defaultOpen={m.id === current?.id} />
        ))}
      </div>
    </div>
  );
}
