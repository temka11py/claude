import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, BookOpen, Clock, Headphones, Languages, PenLine, Play } from 'lucide-react';
import type { Attempt, QuizListItem } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { formatDate } from '../lib/format';
import { Badge, Button, Card, ErrorState, LinkButton, PageHeader, Spinner } from '../components/ui';
import { QuizRunner } from '../components/quiz/runners';
import QuizResults from '../components/quiz/QuizResults';

const useDisclaimer = () => {
  const { L } = useI18n();
  return L('Дадлагын оноо — албан ёсны JLPT дүн биш.', 'Practice score — not an official JLPT result.');
};

interface AttemptRow {
  id: string;
  title: string;
  percent: number;
  correct: number;
  total: number;
  passed: boolean;
  createdAt: string;
  durationSec: number;
}

export function Jlpt() {
  const { L, lang } = useI18n();
  const disclaimer = useDisclaimer();
  const exams = useApi<{ quizzes: QuizListItem[] }>('/quizzes?kind=mock_exam');
  const attempts = useApi<{ attempts: AttemptRow[] }>('/quiz/attempts?kind=mock_exam&limit=10');
  if (exams.loading && !exams.data) return <Spinner />;
  if (exams.error) return <ErrorState message={exams.error.message} onRetry={exams.reload} />;
  const exam = exams.data?.quizzes[0];
  const sections = [
    { icon: <Languages className="size-5" />, mn: 'Үг, ханз (文字・語彙)', en: 'Vocabulary (文字・語彙)', dmn: 'Ханзны уншлага, бичлэг, утга, ижил утгатай үг', den: 'Kanji reading, writing, context, paraphrase', n: 18 },
    { icon: <PenLine className="size-5" />, mn: 'Дүрэм (文法)', en: 'Grammar (文法)', dmn: 'Нөхцөл, хэлбэр, ★ дараалал, бичвэрийн дүрэм', den: 'Particles, forms, ★ ordering, text grammar', n: 14 },
    { icon: <BookOpen className="size-5" />, mn: 'Уншлага (読解)', en: 'Reading (読解)', dmn: 'Мэдэгдэл, дунд бичвэр, мэдээлэл хайх', den: 'Notices, mid passages, info retrieval', n: 6 },
    { icon: <Headphones className="size-5" />, mn: 'Сонсгол (聴解)', en: 'Listening (聴解)', dmn: 'Даалгавар, гол санаа, хэллэг, хурдан хариулт', den: 'Tasks, key points, utterances, quick response', n: 10 },
  ];
  return (
    <div>
      <PageHeader titleJa="日本語能力試験 N5" title={L('JLPT N5 загвар шалгалт', 'JLPT N5 mock exam')} subtitle={L('Бодит шалгалтын бүтцийг дуурайсан цагтай дадлага шалгалт.', 'A timed practice exam modelled on the real test format.')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {sections.map((s) => (
              <div key={s.en} className="flex gap-3 rounded-2xl bg-surface-2 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-shu">{s.icon}</span>
                <div>
                  <p className="font-semibold text-ink">{L(s.mn, s.en)}</p>
                  <p className="text-xs text-muted">{L(s.dmn, s.den)}</p>
                  <p className="mt-1 text-xs font-medium text-ink-2">
                    {s.n} {L('асуулт', 'questions')}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-ink-2">
            <span className="flex items-center gap-1.5">
              <Clock className="size-4 text-muted" />
              {exam ? Math.round((exam.timeLimitSec ?? 0) / 60) : 60} {L('минут', 'minutes')}
            </span>
            <span>
              {exam?.questionCount ?? 48} {L('асуулт', 'questions')}
            </span>
            <span>
              {L('Дадлагын босго', 'Practice pass mark')}: {exam?.passingScore ?? 60}%
            </span>
          </div>
          <ul className="list-inside list-disc text-sm text-ink-2">
            <li>{L('Шалгалтын үеэр зөв хариулт харагдахгүй.', 'Correct answers are hidden during the exam.')}</li>
            <li>{L('Асуултын дугаар дээр дарж хооронд нь шилжиж, тэмдэглэж болно.', 'Jump between questions and flag them for later.')}</li>
            <li>{L('Хугацаа дуусахад шалгалт автоматаар илгээгдэнэ.', 'The exam submits automatically when time runs out.')}</li>
          </ul>
          <p className="flex items-center gap-2 rounded-xl bg-yamabuki-soft px-4 py-2.5 text-sm font-medium text-yamabuki">
            <AlertTriangle className="size-4 shrink-0" />
            {disclaimer}
          </p>
          {exam && (
            <LinkButton to={`/jlpt/${exam.id}`} size="lg">
              <Play className="size-4" />
              {L('Шалгалт эхлэх', 'Start exam')}
            </LinkButton>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-ink">{L('Өмнөх оролдлогууд', 'Previous attempts')}</h2>
          {attempts.data?.attempts.length ? (
            <ul className="flex flex-col gap-2">
              {attempts.data.attempts.map((a) => (
                <li key={a.id}>
                  <Link to={`/attempts/${a.id}`} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-2">
                    <span className="text-sm text-ink-2">{formatDate(a.createdAt, lang)}</span>
                    <Badge tone={a.passed ? 'matcha' : 'shu'}>{a.percent}%</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{L('Одоогоор оролдлого алга.', 'No attempts yet.')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export function JlptExam() {
  const { id } = useParams();
  const { L } = useI18n();
  const disclaimer = useDisclaimer();
  const [started, setStarted] = useState(false);
  return (
    <div>
      <Link to="/jlpt" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        JLPT N5
      </Link>
      {started ? (
        <QuizRunner
          quizId={Number(id)}
          mode="exam"
          disclaimer={disclaimer}
          header={(quiz) => (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-xl font-semibold text-ink">{quiz.title}</h1>
              <Badge tone="yamabuki">{disclaimer}</Badge>
            </div>
          )}
        />
      ) : (
        <Card className="mx-auto flex max-w-lg flex-col items-center gap-4 py-10 text-center">
          <p className="jp text-sm font-medium text-shu">もぎしけん</p>
          <h1 className="text-2xl font-semibold text-ink">{L('Бэлэн үү?', 'Ready?')}</h1>
          <p className="text-sm text-muted">{L('"Эхлэх" дарахад цаг хэмжигч эхэлнэ. Чимээгүй орчинд, чихэвчтэй өгөхийг зөвлөж байна.', 'The timer starts when you press Start. A quiet place and headphones are recommended.')}</p>
          <Button size="lg" onClick={() => setStarted(true)}>
            <Play className="size-4" />
            {L('Эхлэх', 'Start')}
          </Button>
        </Card>
      )}
    </div>
  );
}

export function AttemptPage() {
  const { id } = useParams();
  const { L } = useI18n();
  const disclaimer = useDisclaimer();
  const { data, error, loading, reload } = useApi<{ attempt: Attempt }>(`/quiz/attempts/${id}`);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  return (
    <div>
      <Link to={data.attempt.kind === 'mock_exam' ? '/jlpt' : '/progress'} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {L('Буцах', 'Back')}
      </Link>
      <QuizResults attempt={data.attempt} disclaimer={data.attempt.kind === 'mock_exam' ? disclaimer : undefined} />
    </div>
  );
}
