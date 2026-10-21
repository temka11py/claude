import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Check, Clock, GraduationCap, Lock, RotateCcw, Star } from 'lucide-react';
import type { DaySummary } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Card, ErrorState, Modal, PageHeader, ProgressBar, Segmented, Spinner, cx } from '../components/ui';
import { LEVEL_LABEL } from '../components/day/meta';

type PathDay = Omit<DaySummary, 'steps'> & { current: boolean; ahead: boolean };

interface ProgramData {
  levels: { level: string; total: number; ready: number; completed: number; units: { unit: number; title: string; titleJa: string; days: PathDay[] }[] }[];
  current: number | null;
}

// Zig-zag offsets for the path (in rem), repeating.
const OFFSETS = [0, 2.5, 4, 2.5, 0, -2.5, -4, -2.5];

function DayNode({ d, index, onOutline }: { d: PathDay; index: number; onOutline: (d: PathDay) => void }) {
  const { L } = useI18n();
  const offset = OFFSETS[index % OFFSETS.length];
  const icon = d.kind === 'review' ? <RotateCcw className="size-6" /> : d.kind === 'exam' ? <GraduationCap className="size-6" /> : <span className="text-xl font-bold tabular-nums">{d.number}</span>;
  const circle = cx(
    'relative grid size-16 shrink-0 place-items-center rounded-full border-b-4 transition-transform hover:scale-105',
    !d.ready
      ? 'border-line bg-surface-2 text-muted'
      : d.completed
        ? 'border-matcha/60 bg-matcha text-white'
        : d.current
          ? 'border-shu-strong bg-shu text-white ring-4 ring-shu/25'
          : d.started
            ? 'border-yamabuki/60 bg-yamabuki text-white'
            : 'border-line bg-surface text-ink-2',
  );
  const content = (
    <>
      <span className={circle}>
        {d.completed ? <Check className="size-7" /> : !d.ready ? <Lock className="size-5" /> : icon}
        {d.current && <span className="absolute -top-7 whitespace-nowrap rounded-lg bg-shu px-2 py-0.5 text-[11px] font-semibold text-white shadow">{L('Өнөөдөр', 'Today')}</span>}
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-xs text-muted">
          {L('Өдөр', 'Day')} {d.number}
          {d.ready && ` · ≈${d.minutes} ${L('мин', 'min')}`}
          {d.started && !d.completed && ` · ${d.stepsDone}/${d.stepsTotal}`}
        </span>
        <span className={cx('block truncate font-medium', d.ready ? 'text-ink' : 'text-muted')}>{d.title}</span>
        <span className="jp block truncate text-xs text-muted">{d.titleJa}</span>
      </span>
    </>
  );
  return (
    <li style={{ transform: `translateX(clamp(-4rem, ${offset * 2}vw, 4rem))` }} className="w-full max-w-[17rem] sm:max-w-sm" data-current={d.current || undefined}>
      {d.ready ? (
        <Link to={`/day/${d.number}`} className={cx('flex items-center gap-3 rounded-2xl p-1.5', d.ahead && 'opacity-80')}>
          {content}
        </Link>
      ) : (
        <button onClick={() => onOutline(d)} className="flex w-full items-center gap-3 rounded-2xl p-1.5">
          {content}
        </button>
      )}
    </li>
  );
}

export default function Program() {
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<ProgramData>('/program');
  const [level, setLevel] = useState<string | null>(null);
  const [outline, setOutline] = useState<PathDay | null>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    if (!data || scrolled.current) return;
    scrolled.current = true;
    requestAnimationFrame(() => document.querySelector('[data-current]')?.scrollIntoView({ block: 'center' }));
  }, [data, level]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const currentLevel = data.levels.find((l) => l.units.some((u) => u.days.some((d) => d.current)))?.level ?? 'N5';
  const active = data.levels.find((l) => l.level === (level ?? currentLevel))!;
  let index = 0;

  return (
    <div>
      <PageHeader
        title={L('Хөтөлбөр: N5 → N2', 'Program: N5 → N2')}
        titleJa="がくしゅうのみち"
        subtitle={L('Өдөр бүр нэг сэдэв. Тойрог бүр нэг өдөр — дарж ороод жижиг алхмуудаар хийнэ. Нэгж бүр давталтын өдрөөр төгсдөг.', 'One topic per day. Each circle is a day made of small steps. Every unit ends with a review day.')}
      />
      <Segmented
        value={active.level}
        onChange={(v) => setLevel(v)}
        options={data.levels.map((l) => ({ value: l.level, label: `${l.level} · ${l.completed}/${l.total}` }))}
      />
      <Card className="mt-4 flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <p className="font-semibold text-ink">{LEVEL_LABEL[active.level]}</p>
          <p className="text-sm tabular-nums text-muted">
            {active.completed}/{active.total} {L('өдөр', 'days')}
          </p>
        </div>
        <ProgressBar value={active.completed} max={active.total} tone="matcha" />
        {active.ready < active.total && (
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Clock className="mt-0.5 size-3.5 shrink-0" />
            {L(
              `${active.total} өдрөөс ${active.ready} нь бэлэн. Бусад өдрийн сэдэв, дүрмийг аль хэдийн төлөвлөсөн бөгөөд агуулгыг нь шат дараатай нэмнэ.`,
              `${active.ready} of ${active.total} days are ready. The rest are planned and will be filled in step by step.`,
            )}
          </p>
        )}
      </Card>

      <div className="mt-6 flex flex-col gap-10 overflow-x-hidden pt-4">
        {active.units.map((u) => (
          <section key={u.unit}>
            <div className="mb-5 flex items-center gap-3 rounded-2xl bg-ai px-4 py-3 text-white">
              <Star className="size-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs opacity-80">
                  {L('Нэгж', 'Unit')} {u.unit}
                </p>
                <p className="truncate font-semibold">
                  {u.title} <span className="jp text-sm font-normal opacity-80">{u.titleJa}</span>
                </p>
              </div>
              <span className="ml-auto shrink-0 text-sm tabular-nums opacity-90">
                {u.days.filter((d) => d.completed).length}/{u.days.length}
              </span>
            </div>
            <ol className="flex flex-col items-center gap-5">
              {u.days.map((d) => (
                <DayNode key={d.number} d={d} index={index++} onOutline={setOutline} />
              ))}
            </ol>
          </section>
        ))}
      </div>

      <Modal open={!!outline} onClose={() => setOutline(null)} title={outline ? `${L('Өдөр', 'Day')} ${outline.number}: ${outline.title}` : ''}>
        {outline && (
          <div className="flex flex-col gap-3">
            <p className="jp text-shu">{outline.titleJa}</p>
            <p className="text-sm text-muted">{L('Энэ өдөр үзэх зүйлс (агуулга бэлтгэгдэж байна):', 'Planned for this day (content in preparation):')}</p>
            <ul className="flex flex-col gap-1.5">
              {outline.outline.map((p) => (
                <li key={p} className="jp rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
