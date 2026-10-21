import { Link } from 'react-router';
import { ArrowRight, Check, Clock, Flame, Gamepad2, Layers, Pause, Play, RotateCcw, Sparkles, Star, Timer, Trophy } from 'lucide-react';
import type { DaySummary } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useStudyClock } from '../hooks/useStudyTimer';
import { useI18n } from '../i18n';
import { Badge, Card, ErrorState, LinkButton, ProgressBar, ProgressRing, SectionTitle, Spinner, cx } from '../components/ui';
import { StepIcon } from '../components/day/meta';

interface TodayData {
  today: string;
  day: DaySummary | null;
  state: 'not_started' | 'in_progress' | 'done_today' | 'all_done';
  finishedToday: { number: number; title: string }[];
  time: { seconds: number; goalMinutes: number };
  xp: { today: number; goal: number; total: number };
  quests: { key: string; mn: string; en: string; done: number; target: number }[];
  streak: { current: number; longest: number; activeToday: boolean; week: { date: string; minutes: number; xp: number }[] };
  review: { dueNow: number };
  level: { level: string; completed: number; total: number };
}

const WEEKDAYS = { mn: ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'], en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] };

function TodayPlan({ data }: { data: TodayData }) {
  const { L } = useI18n();
  const day = data.day!;
  const next = day.steps.find((s) => !s.done && !s.optional) ?? day.steps.find((s) => !s.done);
  const left = day.steps.filter((s) => !s.done && !s.optional).reduce((n, s) => n + s.minutes, 0);
  const doneToday = data.state === 'done_today';
  return (
    <Card className="relative overflow-hidden lg:col-span-2">
      {doneToday && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-matcha-soft p-4">
          <Trophy className="mt-0.5 size-6 shrink-0 text-matcha" />
          <div>
            <p className="font-semibold text-matcha">{L('Өнөөдрийн хичээл дууслаа!', 'Today’s lesson is done!')}</p>
            <p className="text-sm text-ink-2">
              {data.finishedToday.map((d) => `${L('Өдөр', 'Day')} ${d.number}: ${d.title}`).join(', ')} ✓ {L('Маргааш дараагийн өдрөө эхлээрэй. Хүсвэл одоо урьдчилж эхэлж болно.', 'Come back tomorrow for the next day — or start it now if you like.')}
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
        <Badge tone="shu">{day.level}</Badge>
        <span>
          {L('Нэгж', 'Unit')} {day.unit}: {day.unitTitle}
        </span>
      </div>
      <div className="mt-3 flex items-start gap-4">
        <div className="brush grid size-20 shrink-0 place-items-center rounded-2xl bg-shu-soft text-center text-shu">
          <span>
            <span className="block text-[11px] font-sans font-semibold uppercase">{L('Өдөр', 'Day')}</span>
            <span className="block text-3xl font-semibold leading-none">{day.number}</span>
          </span>
        </div>
        <div className="min-w-0">
          <p className="jp text-sm text-shu">{day.titleJa}</p>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">{day.title}</h2>
          <p className="mt-1 text-ink-2">🎯 {day.goal}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <ProgressBar value={day.stepsDone} max={day.stepsTotal} tone="matcha" />
        <span className="shrink-0 text-sm tabular-nums text-muted">
          {day.stepsDone}/{day.stepsTotal} {L('алхам', 'steps')}
        </span>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
        <Clock className="size-4" />
        {L(`Үлдсэн ≈${left} мин · алхам бүр 2–5 мин — хүссэн үедээ завсарлаж болно`, `≈${left} min left · 2–5 min per step — take a break any time`)}
      </p>

      {next && (
        <LinkButton to={`/day/${day.number}/${next.key}`} size="lg" className="mt-4 w-full sm:w-auto">
          <Play className="size-5" />
          {day.started ? L('Үргэлжлүүлэх', 'Continue') : doneToday ? L('Урьдчилж эхлэх', 'Start early') : L('Өнөөдрийн хичээлийг эхлэх', 'Start today’s lesson')}: {next.title}
        </LinkButton>
      )}

      <ol className="mt-5 grid gap-1.5 border-t border-line pt-4 sm:grid-cols-2">
        {day.steps.map((s) => (
          <li key={s.key}>
            <Link to={`/day/${day.number}/${s.key}`} className={cx('flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-surface-2', s === next && 'bg-shu-soft/50')}>
              <StepIcon kind={s.kind} done={s.done} className="size-8 rounded-lg [&_svg]:size-4" />
              <span className={cx('min-w-0 flex-1 truncate', s.done ? 'text-muted line-through decoration-muted/40' : 'text-ink')}>{s.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{s.minutes}′</span>
            </Link>
          </li>
        ))}
      </ol>
      <Link to={`/day/${day.number}`} className="mt-3 inline-block text-sm font-medium text-ai hover:underline">
        {L('Өдрийн дэлгэрэнгүй', 'Day details')} →
      </Link>
    </Card>
  );
}

function TimeCard({ data }: { data: TodayData }) {
  const { L, lang } = useI18n();
  const { seconds, running, goalMinutes } = useStudyClock();
  const secs = Math.max(seconds, data.time.seconds);
  const pct = Math.min(100, Math.round((secs / (goalMinutes * 60)) * 100));
  const m = Math.floor(secs / 60);
  const max = Math.max(goalMinutes, ...data.streak.week.map((d) => d.minutes));
  return (
    <Card>
      <SectionTitle action={running ? <Timer className="size-4 text-shu" /> : <Pause className="size-4 text-muted" />}>{L('Өнөөдрийн цаг', 'Time today')}</SectionTitle>
      <div className="flex items-center gap-4">
        <ProgressRing value={pct} size={92}>
          <span className="text-center leading-tight">
            <span className="block text-2xl font-semibold tabular-nums text-ink">{m}</span>
            <span className="text-[11px] text-muted">/ {goalMinutes} {L('мин', 'min')}</span>
          </span>
        </ProgressRing>
        <div className="text-sm">
          <p className="font-semibold text-ink">
            {m} {L('мин', 'min')} {secs % 60} {L('сек', 's')}
          </p>
          <p className="text-muted">{pct >= 100 ? L('Зорилгоо биелүүллээ!', 'Goal reached!') : L(`Зорилго хүртэл ${Math.max(0, goalMinutes - m)} мин`, `${Math.max(0, goalMinutes - m)} min to goal`)}</p>
          <p className="mt-1 text-xs text-muted">{running ? L('⏱ Цаг явж байна', '⏱ Clock running') : L('⏸ Түр зогссон — идэвхгүй үед тоолохгүй', '⏸ Paused while you are away')}</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="mb-1.5 text-xs text-muted">{L('Сүүлийн 7 хоног (минут)', 'Last 7 days (minutes)')}</p>
        <div className="flex h-24 items-end gap-1.5">
          {data.streak.week.map((d) => {
            const isToday = d.date === data.today;
            const minutes = isToday ? m : d.minutes;
            const h = Math.max(4, Math.round((minutes / max) * 72));
            const day = new Date(`${d.date}T12:00:00`).getDay();
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${minutes} ${L('мин', 'min')}`}>
                <span className="text-[10px] tabular-nums text-muted">{minutes || ''}</span>
                <div className={cx('w-full rounded-md', minutes >= goalMinutes ? 'bg-matcha' : minutes > 0 ? 'bg-shu/70' : 'bg-surface-2')} style={{ height: h }} />
                <span className={cx('text-[10px]', isToday ? 'font-semibold text-ink' : 'text-muted')}>{WEEKDAYS[lang][day]}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block size-2 rounded-sm bg-matcha" /> {L('зорилго биелсэн', 'goal met')}
          <span className="ml-2 inline-block size-2 rounded-sm bg-shu/70" /> {L('суралцсан', 'studied')}
        </p>
      </div>
    </Card>
  );
}

function XpQuests({ data }: { data: TodayData }) {
  const { L, lang } = useI18n();
  return (
    <Card>
      <SectionTitle action={<Star className="size-4 text-yamabuki" />}>{L('Өдрийн даалгавар', 'Daily quests')}</SectionTitle>
      <div className="mb-4 rounded-xl bg-yamabuki-soft p-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-ink">XP</span>
          <span className="text-sm tabular-nums text-ink">
            <b>{data.xp.today}</b> / {data.xp.goal}
          </span>
        </div>
        <ProgressBar value={data.xp.today} max={data.xp.goal} tone="yamabuki" />
        <p className="mt-1.5 text-[11px] text-ink-2">{L('Алхам бүр +10 XP, 90%+ авбал +5, өдөр дуусгавал +20.', 'Each step +10 XP, 90%+ gives +5, finishing a day +20.')}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {data.quests.map((q) => {
          const done = q.done >= q.target;
          return (
            <li key={q.key} className="flex items-center gap-3">
              <span className={cx('grid size-7 shrink-0 place-items-center rounded-full', done ? 'bg-matcha text-white' : 'bg-surface-2 text-muted')}>{done ? <Check className="size-4" /> : <Sparkles className="size-3.5" />}</span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex justify-between text-sm">
                  <span className={cx(done ? 'text-muted line-through' : 'text-ink')}>{lang === 'en' ? q.en : q.mn}</span>
                  <span className="tabular-nums text-muted">
                    {Math.min(q.done, q.target)}/{q.target}
                  </span>
                </div>
                <ProgressBar value={q.done} max={q.target} tone={done ? 'matcha' : 'ai'} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function Today() {
  const { user } = useAuth();
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<TodayData>('/program/today');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="jp text-sm font-medium text-shu">{L('きょうも がんばりましょう', 'きょうも がんばりましょう')}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {L('Сайн байна уу', 'Hello')}, {user?.name}
        </h1>
        <p className="text-sm text-muted">
          {L('Өдөр бүр нэг өдрийн хичээл — жижиг алхмуудаар.', 'One day of the program each day — in small steps.')} {data.level.level}: {data.level.completed}/{data.level.total} {L('өдөр дууссан', 'days done')}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {data.day ? (
          <TodayPlan data={data} />
        ) : (
          <Card className="flex flex-col items-center gap-3 py-10 text-center lg:col-span-2">
            <Trophy className="size-10 text-yamabuki" />
            <p className="text-lg font-semibold text-ink">{L('Бэлэн байгаа бүх өдрийг дуусгалаа!', 'You finished every available day!')}</p>
            <p className="max-w-md text-sm text-muted">{L('Шинэ өдрүүд нэмэгдэх хүртэл флэш карт, давталт, тоглоомоор мэдлэгээ бататгаарай.', 'Until new days arrive, keep your knowledge fresh with flashcards, reviews and games.')}</p>
            <LinkButton to="/program">{L('Хөтөлбөр харах', 'See the program')}</LinkButton>
          </Card>
        )}
        <TimeCard data={data} />

        <XpQuests data={data} />

        <Card>
          <SectionTitle>{L('Өдөр дараалсан цуваа', 'Daily streak')}</SectionTitle>
          <div className="flex items-center gap-3">
            <span className={cx('grid size-14 place-items-center rounded-2xl', data.streak.current > 0 ? 'bg-shu text-white' : 'bg-surface-2 text-muted')}>
              <Flame className="size-7" />
            </span>
            <div>
              <p className="text-3xl font-semibold tabular-nums text-ink">
                {data.streak.current} <span className="text-base font-medium text-muted">{L('өдөр', 'days')}</span>
              </p>
              <p className="text-xs text-muted">
                {L('Хамгийн урт', 'Longest')}: {data.streak.longest} · {data.streak.activeToday ? L('Өнөөдөр ✓', 'Today ✓') : L('Өнөөдөр хараахан биш', 'Not yet today')}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">{L(`Нийт ${data.xp.total} XP цуглуулсан.`, `${data.xp.total} XP collected in total.`)}</p>
        </Card>

        <Card>
          <SectionTitle>{L('Нэмэлт дасгал', 'Extra practice')}</SectionTitle>
          <div className="flex flex-col gap-2">
            <Link to="/review" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-surface-2">
              <RotateCcw className="size-5 text-ai" />
              <span className="flex-1 text-sm font-medium text-ink">{L('Давталт', 'Review')}</span>
              <Badge tone={data.review.dueNow ? 'shu' : 'neutral'}>{data.review.dueNow}</Badge>
            </Link>
            <Link to="/flashcards" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-surface-2">
              <Layers className="size-5 text-shu" />
              <span className="flex-1 text-sm font-medium text-ink">{L('Флэш карт', 'Flashcards')}</span>
              <ArrowRight className="size-4 text-muted" />
            </Link>
            <Link to="/games" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-surface-2">
              <Gamepad2 className="size-5 text-yamabuki" />
              <span className="flex-1 text-sm font-medium text-ink">{L('Судоку ба тоглоом', 'Sudoku & games')}</span>
              <ArrowRight className="size-4 text-muted" />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
