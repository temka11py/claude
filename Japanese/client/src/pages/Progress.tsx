import { BookOpen, Clock, Flame, GraduationCap, Headphones, Library, Mic, RotateCcw, ScrollText, Target, Trophy } from 'lucide-react';
import type { Achievement } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { categoryLabel } from '../lib/labels';
import { formatDate } from '../lib/format';
import { Card, ErrorState, PageHeader, SectionTitle, Spinner, StatTile, cx } from '../components/ui';
import { AccuracyBars, ColumnChart, ScoreLine, StackedProgress } from '../components/charts';

interface StateCounts {
  new: number;
  learning: number;
  review: number;
  mastered: number;
  learned: number;
}

interface ProgressData {
  totals: {
    lessonsCompleted: number;
    lessonsTotal: number;
    vocabLearned: number;
    kanjiLearned: number;
    grammarCompleted: number;
    storiesCompleted: number;
    listeningCompleted: number;
    speakingPractice: number;
    testsCompleted: number;
    quizzesTaken: number;
    averageQuizScore: number | null;
    studyMinutes: number;
    streak: number;
    longestStreak: number;
    reviewAccuracy: number | null;
    reviewsDone: number;
  };
  overall: Record<'vocabulary' | 'kanji' | 'grammar' | 'reading' | 'listening', { done: number; total: number; percent: number }>;
  learned: Record<'vocab' | 'kanji' | 'grammar' | 'kana', StateCounts>;
  weekly: { date: string; minutes: number; questions: number }[];
  quizHistory: { id: string; title: string; kind: string; percent: number; createdAt: string }[];
  categories: { category: string; correct: number; total: number; accuracy: number }[];
  achievements: (Achievement & { id: number })[];
}

const WEEKDAYS = { mn: ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };

export default function Progress() {
  const { L, lang } = useI18n();
  const { data, error, loading, reload } = useApi<ProgressData>('/progress');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const t = data.totals;
  const hours = Math.floor(t.studyMinutes / 60);
  const icon = 'size-3.5';
  const tiles = [
    { label: L('Дууссан хичээл', 'Lessons completed'), value: `${t.lessonsCompleted}/${t.lessonsTotal}`, icon: <BookOpen className={icon} /> },
    { label: L('Цээжилсэн үг', 'Vocabulary learned'), value: t.vocabLearned, icon: <Library className={icon} /> },
    { label: L('Цээжилсэн ханз', 'Kanji learned'), value: t.kanjiLearned, icon: <span className="jp text-xs font-bold">漢</span> },
    { label: L('Дууссан дүрэм', 'Grammar completed'), value: t.grammarCompleted, icon: <Target className={icon} /> },
    { label: L('Уншсан өгүүллэг', 'Stories read'), value: t.storiesCompleted, icon: <ScrollText className={icon} /> },
    { label: L('Сонсгол', 'Listening done'), value: t.listeningCompleted, icon: <Headphones className={icon} /> },
    { label: L('Ярих дасгал', 'Speaking practice'), value: t.speakingPractice, icon: <Mic className={icon} /> },
    { label: L('Өгсөн шалгалт', 'Tests completed'), value: t.testsCompleted, icon: <GraduationCap className={icon} /> },
    { label: L('Дундаж оноо', 'Average quiz score'), value: t.averageQuizScore === null ? '—' : `${t.averageQuizScore}%`, hint: L(`${t.quizzesTaken} шалгалт`, `${t.quizzesTaken} quizzes`), icon: <Trophy className={icon} /> },
    { label: L('Суралцсан хугацаа', 'Study time'), value: hours ? `${hours}${L('ц', 'h')} ${t.studyMinutes % 60}${L('м', 'm')}` : `${t.studyMinutes} ${L('мин', 'min')}`, icon: <Clock className={icon} /> },
    { label: L('Цуваа', 'Streak'), value: `${t.streak} ${L('өдөр', 'd')}`, hint: `${L('Хамгийн урт', 'Longest')}: ${t.longestStreak}`, icon: <Flame className={icon} /> },
    { label: L('Давталтын нарийвчлал', 'Review accuracy'), value: t.reviewAccuracy === null ? '—' : `${t.reviewAccuracy}%`, hint: L(`${t.reviewsDone} давталт`, `${t.reviewsDone} reviews`), icon: <RotateCcw className={icon} /> },
  ];
  const stateLegend = [L('Сурч буй', 'Learning'), L('Давтах', 'Review'), L('Эзэмшсэн', 'Mastered')];
  const row = (label: string, c: StateCounts, total: number) => ({ label, total: Math.max(total, c.new + c.learning + c.review + c.mastered), segments: [c.learning, c.review, c.mastered] });
  const kanaInDeck = data.learned.kana.new + data.learned.kana.learning + data.learned.kana.review + data.learned.kana.mastered;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titleJa="しんちょく" title={L('Ахиц', 'Progress')} subtitle={L('Таны суралцсан бүх зүйлийн тойм.', 'An overview of everything you have learned.')} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatTile key={tile.label} {...tile} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>{L('Долоо хоногийн суралцсан хугацаа (мин)', 'Weekly study time (min)')}</SectionTitle>
          <ColumnChart
            label={L('Сүүлийн 7 өдрийн суралцсан минут', 'Minutes studied over the last 7 days')}
            unit={L('мин', 'min')}
            data={data.weekly.map((d) => ({ label: WEEKDAYS[lang][new Date(`${d.date}T12:00:00`).getDay()], value: d.minutes, title: formatDate(d.date, lang) }))}
          />
        </Card>
        <Card>
          <SectionTitle>{L('Шалгалтын гүйцэтгэл', 'Quiz performance')}</SectionTitle>
          {data.quizHistory.length ? (
            <ScoreLine
              label={L('Сүүлийн шалгалтуудын оноо', 'Recent quiz scores')}
              passMark={80}
              data={data.quizHistory.map((q) => ({ title: q.title, date: formatDate(q.createdAt, lang), value: q.percent }))}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted">{L('Шалгалт өгөхөд энд таны онооны явц харагдана.', 'Your scores will appear here once you take quizzes.')}</p>
          )}
        </Card>
        <Card>
          <SectionTitle>{L('Үг, ханз, дүрэм, канагийн ахиц', 'Vocabulary, kanji, grammar & kana')}</SectionTitle>
          <StackedProgress
            legend={stateLegend}
            rows={[
              row(L('Үгсийн сан', 'Vocabulary'), data.learned.vocab, data.overall.vocabulary.total),
              row(L('Ханз', 'Kanji'), data.learned.kanji, data.overall.kanji.total),
              row(L('Дүрэм', 'Grammar'), data.learned.grammar, data.overall.grammar.total),
              row(L('Кана', 'Kana'), data.learned.kana, Math.max(kanaInDeck, 1)),
            ]}
          />
        </Card>
        <Card>
          <SectionTitle>{L('Ангиллаар нарийвчлал', 'Accuracy by category')}</SectionTitle>
          {data.categories.length ? (
            <AccuracyBars rows={data.categories.map((c) => ({ label: categoryLabel(c.category, lang), value: c.accuracy, detail: `${c.correct}/${c.total}` }))} />
          ) : (
            <p className="py-10 text-center text-sm text-muted">{L('Хариулт хуримтлагдахад энд харагдана.', 'Appears once you have answered some questions.')}</p>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>{L('Амжилтууд', 'Achievements')}</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.achievements.map((a) => (
            <div key={a.code} className={cx('flex items-center gap-3 rounded-2xl border p-3', a.unlockedAt ? 'border-line bg-surface' : 'border-dashed border-line bg-surface-2/50')}>
              <span className={cx('brush grid size-11 shrink-0 place-items-center rounded-xl text-xl font-semibold', a.unlockedAt ? 'bg-shu text-white' : 'bg-surface-2 text-muted')}>{a.icon}</span>
              <div className="min-w-0">
                <p className={cx('truncate text-sm font-semibold', a.unlockedAt ? 'text-ink' : 'text-muted')}>{lang === 'en' ? a.titleEn : a.title}</p>
                <p className="line-clamp-2 text-xs text-muted">{a.unlockedAt ? formatDate(a.unlockedAt, lang) : a.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
