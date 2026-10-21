import { Link, useParams } from 'react-router';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Clock, Lock } from 'lucide-react';
import type { ModuleSummary } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Badge, EmptyState, ErrorState, LinkButton, PageHeader, ProgressBar, Spinner } from '../components/ui';
import { QuizRunner } from '../components/quiz/runners';
import { ApiError } from '../api/client';

export function Tests() {
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<{ modules: ModuleSummary[] }>('/modules');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const modules = data.modules.filter((m) => m.test);
  const passed = modules.filter((m) => m.test?.passed).length;
  return (
    <div>
      <PageHeader
        titleJa="テスト"
        title={L('Модулийн шалгалт', 'Module tests')}
        subtitle={L('Модуль бүр 30 асуулттай шалгалттай: үг 10, дүрэм 10, кана/ханз 5, уншлага 5. Тэнцэх оноо — 80%.', 'Each module has a 30-question test: vocabulary 10, grammar 10, kana/kanji 5, reading 5. Pass mark 80%.')}
        actions={
          <div className="rounded-xl border border-line bg-surface px-4 py-2 text-sm">
            <span className="font-semibold tabular-nums text-ink">{passed}</span>
            <span className="text-muted">
              {' '}
              / {modules.length} {L('тэнцсэн', 'passed')}
            </span>
          </div>
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        {modules.map((m) => {
          const t = m.test!;
          return (
            <div key={m.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {L('Модуль', 'Module')} {m.order}
                  </p>
                  <p className="truncate text-lg font-semibold text-ink">{m.title}</p>
                </div>
                {t.passed ? (
                  <Badge tone="matcha">
                    <CheckCircle2 className="size-3" />
                    {t.best}%
                  </Badge>
                ) : t.best !== null ? (
                  <Badge tone="yamabuki">{t.best}%</Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <ClipboardCheck className="size-3.5" />
                  30 {L('асуулт', 'questions')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  30 {L('мин', 'min')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <ProgressBar value={m.completed} max={m.total} tone={t.available ? 'matcha' : 'shu'} />
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {m.completed}/{m.total} {L('хичээл', 'lessons')}
                </span>
              </div>
              {t.available ? (
                <LinkButton to={`/tests/${t.id}`} variant={t.passed ? 'secondary' : 'primary'}>
                  {t.best !== null ? L('Дахин өгөх', 'Retake') : L('Шалгалт эхлэх', 'Start test')}
                </LinkButton>
              ) : (
                <p className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
                  <Lock className="size-4" />
                  {L('Модулийн бүх хичээлийг дуусгасны дараа нээгдэнэ', 'Unlocks when every lesson in the module is complete')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TestRun() {
  const { id } = useParams();
  const { L } = useI18n();
  const probe = useApi<{ quiz: { id: number } }>(`/quizzes/${id}`);
  if (probe.loading && !probe.data) return <Spinner />;
  if (probe.error instanceof ApiError && probe.error.status === 403) {
    return <EmptyState icon={<Lock className="size-6" />} title={L('Шалгалт түгжээтэй байна', 'This test is locked')} body={L('Модулийн бүх хичээлийг дуусгана уу.', 'Complete every lesson in the module first.')} action={<LinkButton to="/tests">{L('Буцах', 'Back')}</LinkButton>} />;
  }
  if (probe.error) return <ErrorState message={probe.error.message} onRetry={probe.reload} />;
  return (
    <div>
      <Link to="/tests" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {L('Бүх шалгалт', 'All tests')}
      </Link>
      <QuizRunner
        quizId={Number(id)}
        mode="exam"
        header={(quiz) => (
          <div>
            <h1 className="text-xl font-semibold text-ink sm:text-2xl">{quiz.title}</h1>
            <p className="text-sm text-muted">{quiz.description}</p>
          </div>
        )}
      />
    </div>
  );
}
