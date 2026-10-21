import { Link } from 'react-router';
import { ArrowRight, Flame, RotateCcw, Target, TrendingDown } from 'lucide-react';
import type { Achievement, LessonStatus } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { categoryLabel } from '../lib/labels';
import { Card, EmptyState, ErrorState, LinkButton, ProgressBar, ProgressRing, SectionTitle, Spinner, cx } from '../components/ui';

interface Metric {
  done: number;
  total: number;
  percent: number;
}

interface DashboardData {
  today: { date: string; targets: { key: string; done: number; target: number }[]; percent: number; minutes: number; goalMinutes: number };
  continueLesson: {
    id: number;
    title: string;
    titleJa: string;
    summary: string;
    order: number;
    globalOrder: number;
    minutes: number;
    module: { order: number; title: string };
    status: LessonStatus;
    sectionsDone: string[];
  } | null;
  overall: Record<'lessons' | 'vocabulary' | 'kanji' | 'grammar' | 'reading' | 'listening', Metric>;
  streak: { current: number; longest: number; activeToday: boolean; week: { date: string; minutes: number; active: boolean }[] };
  weakAreas: { category: string; correct: number; total: number; accuracy: number }[];
  review: { dueNow: number };
  recentAchievements: (Achievement & { unlockedAt: string })[];
}

const WEEKDAYS = { mn: ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'], en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] };

export default function Dashboard() {
  const { user } = useAuth();
  const { L, lang } = useI18n();
  const { data, error, loading, reload } = useApi<DashboardData>('/dashboard');

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  const targetLabel: Record<string, [string, string]> = {
    minutes: ['Суралцсан минут', 'Study minutes'],
    lessons: ['Хичээл', 'Lesson'],
    vocab: ['Үг', 'Vocabulary'],
    kanji: ['Ханз', 'Kanji'],
    grammar: ['Дүрмийн асуулт', 'Grammar questions'],
    stories: ['Өгүүллэг', 'Story'],
  };
  const overallRows: { key: keyof DashboardData['overall']; mn: string; en: string; to: string; tone: 'shu' | 'ai' | 'matcha' | 'yamabuki' }[] = [
    { key: 'vocabulary', mn: 'Үгсийн сан', en: 'Vocabulary', to: '/vocabulary', tone: 'shu' },
    { key: 'kanji', mn: 'Ханз', en: 'Kanji', to: '/kanji', tone: 'ai' },
    { key: 'grammar', mn: 'Дүрэм', en: 'Grammar', to: '/grammar', tone: 'matcha' },
    { key: 'reading', mn: 'Уншлага', en: 'Reading', to: '/stories', tone: 'yamabuki' },
    { key: 'listening', mn: 'Сонсгол', en: 'Listening', to: '/listening', tone: 'ai' },
  ];
  const c = data.continueLesson;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="jp text-sm font-medium text-shu">{L('おかえりなさい', 'おかえりなさい')}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {L('Сайн байна уу', 'Welcome back')}, {user?.name}
        </h1>
        <p className="text-sm text-muted">{L('Өнөөдрийн зорилгоо биелүүлж, цувралаа үргэлжлүүлээрэй.', 'Hit today’s goal and keep your streak going.')}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Continue learning */}
        <Card className="relative overflow-hidden lg:col-span-2">
          <SectionTitle>{L('Үргэлжлүүлэх', 'Continue learning')}</SectionTitle>
          {c ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="brush grid size-20 shrink-0 place-items-center rounded-2xl bg-shu-soft text-3xl font-semibold text-shu">{String(c.globalOrder).padStart(2, '0')}</div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted">
                  {L('Модуль', 'Module')} {c.module.order} · {c.module.title}
                </p>
                <h3 className="mt-0.5 text-xl font-semibold text-ink">{c.title}</h3>
                <p className="jp text-sm text-ink-2">{c.titleJa}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{c.summary}</p>
                {c.status === 'in_progress' && (
                  <div className="mt-3 flex items-center gap-2">
                    <ProgressBar value={c.sectionsDone.length} max={7} className="max-w-48" />
                    <span className="text-xs text-muted">{L('Эхэлсэн', 'In progress')}</span>
                  </div>
                )}
              </div>
              <LinkButton to={`/lessons/${c.id}`} size="lg" className="shrink-0">
                {c.status === 'in_progress' ? L('Үргэлжлүүлэх', 'Continue') : L('Эхлэх', 'Start')}
                <ArrowRight className="size-4" />
              </LinkButton>
            </div>
          ) : null}
          {!c && (
            <EmptyState title={L('Бүх хичээлийг дуусгасан!', 'All lessons completed!')} body={L('JLPT N5 загвар шалгалтаар өөрийгөө сориорой.', 'Challenge yourself with the JLPT N5 mock exam.')} action={<LinkButton to="/jlpt">JLPT N5</LinkButton>} />
          )}
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line pt-4 sm:grid-cols-4">
            {[
              { to: '/hiragana', ja: 'あ', mn: 'Хирагана', en: 'Hiragana' },
              { to: '/vocabulary', ja: '語', mn: 'Үгсийн сан', en: 'Vocabulary' },
              { to: '/stories', ja: '読', mn: 'Өгүүллэг', en: 'Stories' },
              { to: '/listening', ja: '聴', mn: 'Сонсгол', en: 'Listening' },
            ].map((q) => (
              <Link key={q.to} to={q.to} className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                <span className="brush grid size-8 place-items-center rounded-lg bg-surface-2 text-base text-shu">{q.ja}</span>
                {L(q.mn, q.en)}
              </Link>
            ))}
          </div>
        </Card>

        {/* Today's goal */}
        <Card>
          <SectionTitle action={<Target className="size-4 text-muted" />}>{L('Өнөөдрийн зорилго', 'Today’s goal')}</SectionTitle>
          <div className="flex items-center gap-4">
            <ProgressRing value={data.today.percent} size={84}>
              <span className="text-lg font-semibold tabular-nums text-ink">{data.today.percent}%</span>
            </ProgressRing>
            <div className="text-sm">
              <p className="font-semibold text-ink">
                {data.today.minutes}/{data.today.goalMinutes} {L('минут', 'min')}
              </p>
              <p className="text-muted">{data.today.percent >= 100 ? L('Зорилгоо биелүүллээ!', 'Goal complete!') : L('Бага багаар, өдөр бүр.', 'Little by little, every day.')}</p>
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-2.5">
            {data.today.targets
              .filter((t) => t.key !== 'minutes')
              .map((t) => (
                <li key={t.key} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 text-ink-2">{L(...(targetLabel[t.key] ?? [t.key, t.key]))}</span>
                  <ProgressBar value={t.done} max={t.target} tone={t.done >= t.target ? 'matcha' : 'shu'} />
                  <span className="w-12 shrink-0 text-right tabular-nums text-muted">
                    {Math.min(t.done, t.target)}/{t.target}
                  </span>
                </li>
              ))}
          </ul>
        </Card>

        {/* Overall progress */}
        <Card className="lg:col-span-2">
          <SectionTitle action={<Link to="/progress" className="text-sm font-medium text-ai hover:underline">{L('Дэлгэрэнгүй', 'Details')}</Link>}>
            {L('N5 нийт ахиц', 'Overall N5 progress')}
          </SectionTitle>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums text-ink">{data.overall.lessons.percent}%</span>
            <span className="text-sm text-muted">
              {L('хичээл', 'of lessons')} · {data.overall.lessons.done}/{data.overall.lessons.total}
            </span>
          </div>
          <div className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
            {overallRows.map((row) => {
              const m = data.overall[row.key];
              return (
                <Link key={row.key} to={row.to} className="group">
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium text-ink group-hover:text-shu">{L(row.mn, row.en)}</span>
                    <span className="tabular-nums text-muted">
                      {m.done}/{m.total}
                    </span>
                  </div>
                  <ProgressBar value={m.done} max={m.total} tone={row.tone} />
                </Link>
              );
            })}
          </div>
        </Card>

        {/* Streak */}
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
                {L('Хамгийн урт', 'Longest')}: {data.streak.longest} · {data.streak.activeToday ? L('Өнөөдөр суралцсан ✓', 'Studied today ✓') : L('Өнөөдөр хараахан суралцаагүй', 'Not yet today')}
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {data.streak.week.map((d) => {
              const day = new Date(`${d.date}T12:00:00`).getDay();
              return (
                <div key={d.date} className="flex flex-col items-center gap-1">
                  <span className={cx('grid size-8 place-items-center rounded-full text-[11px] font-semibold', d.active ? 'bg-shu text-white' : 'bg-surface-2 text-muted')} title={`${d.date} · ${d.minutes} min`}>
                    {d.minutes > 0 ? d.minutes : ''}
                  </span>
                  <span className="text-[11px] text-muted">{WEEKDAYS[lang][day]}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Weak areas */}
        <Card>
          <SectionTitle action={<TrendingDown className="size-4 text-muted" />}>{L('Сул талууд', 'Weak areas')}</SectionTitle>
          {data.weakAreas.length ? (
            <>
              <ul className="flex flex-col gap-3">
                {data.weakAreas.map((w) => (
                  <li key={w.category}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-ink">{categoryLabel(w.category, lang)}</span>
                      <span className="tabular-nums text-shu">{w.accuracy}%</span>
                    </div>
                    <ProgressBar value={w.accuracy} tone={w.accuracy < 60 ? 'shu' : 'yamabuki'} />
                  </li>
                ))}
              </ul>
              <LinkButton to={`/practice?categories=${data.weakAreas.map((w) => w.category).join(',')}&title=weak`} className="mt-4 w-full" variant="secondary">
                {L('Сул талаа дасгалжуулах', 'Practice weak areas')}
              </LinkButton>
            </>
          ) : (
            <p className="text-sm text-muted">{L('Шалгалт, дасгал хийх тусам таны сул талыг энд харуулна.', 'Take quizzes and your weak areas will appear here.')}</p>
          )}
        </Card>

        {/* Review */}
        <Card>
          <SectionTitle action={<RotateCcw className="size-4 text-muted" />}>{L('Давталт', 'Review')}</SectionTitle>
          <p className="text-4xl font-semibold tabular-nums text-ink">{data.review.dueNow}</p>
          <p className="text-sm text-muted">{L('карт одоо давтах хугацаа болсон', 'cards due now')}</p>
          <LinkButton to="/review" className="mt-4 w-full" variant={data.review.dueNow ? 'primary' : 'secondary'}>
            {data.review.dueNow ? L('Давталт эхлэх', 'Start review') : L('Давталтын самбар', 'Open review')}
          </LinkButton>
        </Card>

        {/* Achievements */}
        <Card>
          <SectionTitle action={<Link to="/progress" className="text-sm font-medium text-ai hover:underline">{L('Бүгд', 'All')}</Link>}>{L('Амжилтууд', 'Achievements')}</SectionTitle>
          {data.recentAchievements.length ? (
            <ul className="flex flex-col gap-2.5">
              {data.recentAchievements.map((a) => (
                <li key={a.code} className="flex items-center gap-3">
                  <span className="brush grid size-10 shrink-0 place-items-center rounded-xl bg-shu-soft text-lg font-semibold text-shu">{a.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{lang === 'en' ? a.titleEn : a.title}</p>
                    <p className="truncate text-xs text-muted">{a.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{L('Эхний хичээлээ дуусгаж анхны амжилтаа аваарай.', 'Finish your first lesson to earn a badge.')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
