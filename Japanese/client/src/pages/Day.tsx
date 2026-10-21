import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Clock, Home, Lock, Play, Sparkles, X } from 'lucide-react';
import { post } from '../api/client';
import type { DayDetail, StepCompleteResult } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../i18n';
import { stopAudio } from '../lib/speech';
import { Badge, Button, Card, EmptyState, ErrorState, LinkButton, ProgressBar, Spinner, cx } from '../components/ui';
import { STEP_META, StepIcon } from '../components/day/meta';
import { STEP_COMPONENTS } from '../components/day/steps';

function DayOverview({ data }: { data: DayDetail }) {
  const { L } = useI18n();
  const { day } = data;
  const next = day.steps.find((s) => !s.done && !s.optional) ?? day.steps.find((s) => !s.done);
  const left = day.steps.filter((s) => !s.done).reduce((n, s) => n + s.minutes, 0);

  if (!day.ready) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <DayHeader data={data} />
        <Card className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Lock className="size-4 text-muted" />
            {L('Энэ өдрийн агуулга бэлтгэгдэж байна', 'This day is being prepared')}
          </p>
          <p className="text-sm text-muted">{L('Хөтөлбөрт энэ өдөр дараах сэдвүүдийг үзнэ:', 'Planned for this day:')}</p>
          <ul className="flex flex-col gap-1.5">
            {day.outline.map((p) => (
              <li key={p} className="jp rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink">
                {p}
              </li>
            ))}
          </ul>
        </Card>
        <DayNav data={data} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <DayHeader data={data} />
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <ProgressBar value={day.stepsDone} max={day.stepsTotal} tone={day.completed ? 'matcha' : 'shu'} />
          <span className="shrink-0 text-sm tabular-nums text-muted">
            {day.stepsDone}/{day.stepsTotal}
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Clock className="size-4" />
          {day.completed ? L('Энэ өдрийг дуусгасан ✓ Хүссэн алхмаа дахин хийж болно.', 'Day complete ✓ — repeat any step you like.') : L(`Нийт ≈${day.minutes} мин · үлдсэн ≈${left} мин. Алхам бүр 2–5 минут.`, `≈${day.minutes} min in total · ≈${left} min left. Each step takes 2–5 min.`)}
        </p>
        {next && (
          <LinkButton to={`/day/${day.number}/${next.key}`} size="lg" className="mt-1">
            <Play className="size-4" />
            {day.started ? L('Үргэлжлүүлэх', 'Continue') : L('Эхлэх', 'Start')}: {next.title}
          </LinkButton>
        )}
      </Card>

      <ol className="relative flex flex-col gap-2 before:absolute before:bottom-6 before:left-[1.85rem] before:top-6 before:w-0.5 before:bg-line">
        {day.steps.map((s, i) => (
          <li key={s.key} className="relative">
            <Link to={`/day/${day.number}/${s.key}`} className={cx('flex items-center gap-3 rounded-2xl border bg-surface p-3 transition-colors hover:border-ink-2/30', s === next ? 'border-shu' : 'border-line')}>
              <StepIcon kind={s.kind} done={s.done} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">
                  <span className="mr-1.5 text-xs tabular-nums text-muted">{i + 1}.</span>
                  {s.title}
                </p>
                <p className="text-xs text-muted">
                  ≈{s.minutes} {L('мин', 'min')}
                  {s.optional && ` · ${L('нэмэлт', 'bonus')}`}
                  {s.score !== null && ` · ${s.score}%`}
                </p>
              </div>
              {s.done ? <Check className="size-5 text-matcha" /> : s === next ? <Badge tone="shu">{L('Дараагийнх', 'Next')}</Badge> : <ArrowRight className="size-4 text-muted" />}
            </Link>
          </li>
        ))}
      </ol>
      <DayNav data={data} />
    </div>
  );
}

function DayHeader({ data }: { data: DayDetail }) {
  const { L } = useI18n();
  const { day } = data;
  return (
    <header className="flex flex-col gap-1">
      <Link to="/program" className="flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {day.level} · {L('Нэгж', 'Unit')} {day.unit}: {day.unitTitle}
      </Link>
      <p className="jp mt-2 text-sm font-medium text-shu">{day.titleJa}</p>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        <span className="mr-2 text-muted">{L('Өдөр', 'Day')} {day.number}</span>
        {day.title}
      </h1>
      <p className="text-ink-2">🎯 {day.goal}</p>
    </header>
  );
}

function DayNav({ data }: { data: DayDetail }) {
  const { L } = useI18n();
  return (
    <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
      {data.prev ? (
        <Link to={`/day/${data.prev.number}`} className="rounded-2xl border border-line bg-surface p-3 hover:border-ink-2/30">
          <p className="text-xs text-muted">← {L('Өмнөх өдөр', 'Previous day')}</p>
          <p className="truncate text-sm font-medium text-ink">{data.prev.title}</p>
        </Link>
      ) : (
        <span />
      )}
      {data.next && (
        <Link to={`/day/${data.next.number}`} className="rounded-2xl border border-line bg-surface p-3 text-right hover:border-ink-2/30">
          <p className="text-xs text-muted">{L('Дараагийн өдөр', 'Next day')} →</p>
          <p className="truncate text-sm font-medium text-ink">{data.next.title}</p>
        </Link>
      )}
    </div>
  );
}

function Reward({ data, result, stepKey, onNext }: { data: DayDetail; result: StepCompleteResult; stepKey: string; onNext: (key: string) => void }) {
  const { L } = useI18n();
  const navigate = useNavigate();
  const { day } = data;
  const next = result.nextStep ? day.steps.find((s) => s.key === result.nextStep) : null;
  const doneCount = day.steps.filter((s) => !s.optional && result.stepsDone.includes(s.key)).length;
  const current = day.steps.find((s) => s.key === stepKey);
  if (result.dayCompleted) {
    return (
      <Card className="animate-rise flex flex-col items-center gap-4 py-10 text-center">
        <span className="grid size-20 place-items-center rounded-full bg-yamabuki-soft text-yamabuki">
          <Sparkles className="size-10" />
        </span>
        <div>
          <p className="text-2xl font-semibold text-ink">{L(`Өдөр ${day.number} дууслаа!`, `Day ${day.number} complete!`)}</p>
          <p className="mt-1 text-muted">{day.title}</p>
        </div>
        <p className="text-3xl font-bold text-yamabuki">+{result.xp} XP</p>
        <p className="max-w-sm text-sm text-muted">{L('Шинэ үг, ханз давталтын жагсаалтад нэмэгдлээ. Маргааш эхлээд давталтаа хийгээрэй.', 'New words and kanji were added to your review deck. Start tomorrow with a quick review.')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => navigate('/')}>
            <Home className="size-4" />
            {L('Нүүр хуудас', 'Home')}
          </Button>
          <LinkButton to="/games" variant="secondary">
            {L('Тоглоом тоглох', 'Play a game')}
          </LinkButton>
          {data.next?.ready && (
            <LinkButton to={`/day/${data.next.number}`} variant="ghost">
              {L('Дараагийн өдрийг харах', 'Peek at the next day')}
            </LinkButton>
          )}
        </div>
      </Card>
    );
  }
  return (
    <Card className="animate-rise flex flex-col items-center gap-4 py-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-matcha text-white">
        <Check className="size-8" />
      </span>
      <div>
        <p className="text-xl font-semibold text-ink">{L('Сайн байна!', 'Nice work!')}</p>
        <p className="text-sm text-muted">{current?.title}</p>
      </div>
      <p className="text-2xl font-bold text-yamabuki">+{result.xp} XP</p>
      <div className="flex w-full max-w-xs items-center gap-2">
        <ProgressBar value={doneCount} max={day.stepsTotal} tone="matcha" />
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {doneCount}/{day.stepsTotal}
        </span>
      </div>
      {next ? (
        <Button size="lg" onClick={() => onNext(next.key)}>
          {L('Дараагийн алхам', 'Next step')}: {next.title} · ≈{next.minutes} {L('мин', 'min')}
          <ArrowRight className="size-4" />
        </Button>
      ) : null}
      <Link to={`/day/${day.number}`} className="text-sm font-medium text-ai hover:underline">
        {L('Өдрийн жагсаалт руу буцах', 'Back to the day plan')}
      </Link>
    </Card>
  );
}

function StepPlayer({ data, stepKey, onCompleted }: { data: DayDetail; stepKey: string; onCompleted: () => void }) {
  const { L, lang } = useI18n();
  const navigate = useNavigate();
  const { celebrate, notify } = useToast();
  const [result, setResult] = useState<StepCompleteResult | null>(null);
  const [run, setRun] = useState(0);
  const { day, content } = data;
  const step = content.steps.find((s) => s.key === stepKey);
  const index = day.steps.findIndex((s) => s.key === stepKey);
  useEffect(() => {
    setResult(null);
    window.scrollTo(0, 0);
    return () => stopAudio();
  }, [stepKey]);

  if (!step) return <EmptyState title={L('Алхам олдсонгүй', 'Step not found')} action={<LinkButton to={`/day/${day.number}`}>{L('Буцах', 'Back')}</LinkButton>} />;
  const Component = STEP_COMPONENTS[step.kind];
  const done = async (score?: number) => {
    stopAudio();
    try {
      const r = await post<StepCompleteResult>(`/program/days/${day.number}/steps/${step.key}/complete`, score === undefined ? {} : { score });
      celebrate(r.achievements, lang);
      setResult(r);
      onCompleted();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      notify({ kind: 'error', title: L('Хадгалж чадсангүй', 'Could not save'), body: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/day/${day.number}`)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={L('Хаах', 'Close')}>
          <X className="size-5" />
        </button>
        <div className="flex flex-1 gap-1" aria-hidden>
          {day.steps.map((s, i) => (
            <span key={s.key} className={cx('h-2 flex-1 rounded-full', i === index ? 'bg-shu' : s.done || result?.stepsDone.includes(s.key) ? 'bg-matcha' : 'bg-surface-2')} />
          ))}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
          <Clock className="size-3.5" />≈{step.minutes} {L('мин', 'min')}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <StepIcon kind={step.kind} />
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">
            {L('Өдөр', 'Day')} {day.number} · {lang === 'en' ? STEP_META[step.kind].en : STEP_META[step.kind].mn} {index + 1}/{day.steps.length}
          </p>
          <h1 className="truncate text-xl font-semibold text-ink">{step.title}</h1>
        </div>
      </div>
      {result ? (
        <Reward
          data={data}
          result={result}
          stepKey={step.key}
          onNext={(key) => {
            setRun((r) => r + 1);
            navigate(`/day/${day.number}/${key}`);
          }}
        />
      ) : (
        <Component key={`${step.key}-${run}`} step={step} content={content} onDone={(score) => void done(score)} />
      )}
    </div>
  );
}

export default function Day() {
  const { number, step } = useParams();
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<DayDetail>(`/program/days/${number}`);
  if (loading && !data) return <Spinner />;
  if (error?.status === 404) return <EmptyState title={L('Өдөр олдсонгүй', 'Day not found')} action={<LinkButton to="/program">{L('Хөтөлбөр', 'Program')}</LinkButton>} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  if (step && data.day.ready) return <StepPlayer data={data} stepKey={step} onCompleted={() => void reload()} />;
  return <DayOverview data={data} />;
}
