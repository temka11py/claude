import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Check, ChevronDown, RotateCcw, X } from 'lucide-react';
import type { Attempt, AttemptResult } from '../../api/types';
import { useI18n } from '../../i18n';
import { categoryLabel, CATEGORY_PAGE, sectionLabel } from '../../lib/labels';
import { Badge, Button, Card, ProgressBar, ProgressRing, Segmented, SpeakButton, cx } from '../ui';

function formatAnswer(r: AttemptResult, L: (mn: string, en: string) => string): string {
  if (!r.answer) return L('(хариулаагүй)', '(no answer)');
  if (r.question.type === 'true_false') return r.answer === 'true' ? L('Үнэн', 'True') : L('Худал', 'False');
  if (r.question.type === 'matching') {
    try {
      const left = (r.question.options as { left: string[] }).left;
      return (JSON.parse(r.answer) as string[]).map((v, i) => `${left[i]} = ${v || '—'}`).join(' · ');
    } catch {
      return r.answer;
    }
  }
  return r.answer;
}

function formatExpected(r: AttemptResult, L: (mn: string, en: string) => string): string {
  if (r.question.type === 'true_false') return r.expected === 'true' ? L('Үнэн', 'True') : L('Худал', 'False');
  if (r.question.type === 'matching') {
    const left = (r.question.options as { left: string[] }).left;
    return r.expected.split(' · ').map((v, i) => `${left[i]} = ${v}`).join(' · ');
  }
  return r.expected;
}

function ResultItem({ r, index }: { r: AttemptResult; index: number }) {
  const { L } = useI18n();
  const [open, setOpen] = useState(!r.correct);
  return (
    <li className="rounded-2xl border border-line bg-surface">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 p-4 text-left" aria-expanded={open}>
        <span className={cx('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', r.correct ? 'bg-matcha-soft text-matcha' : 'bg-shu-soft text-shu')}>
          {r.correct ? <Check className="size-4" /> : <X className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-xs text-muted">#{index + 1}</span>
          <span className="block break-words font-medium text-ink">{r.question.prompt}</span>
        </span>
        <ChevronDown className={cx('mt-1 size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 pb-4 pt-3 text-sm">
          {r.question.passage && <p className="jp whitespace-pre-line rounded-xl bg-surface-2 p-3 leading-7 text-ink-2">{r.question.passage}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className={cx('rounded-xl p-3', r.correct ? 'bg-matcha-soft' : 'bg-shu-soft')}>
              <p className="text-xs font-medium text-muted">{L('Таны хариулт', 'Your answer')}</p>
              <p className="mt-0.5 break-words text-ink">{formatAnswer(r, L)}</p>
            </div>
            <div className="rounded-xl bg-matcha-soft p-3">
              <p className="text-xs font-medium text-muted">{L('Зөв хариулт', 'Correct answer')}</p>
              <p className="mt-0.5 break-words font-medium text-ink">{formatExpected(r, L)}</p>
            </div>
          </div>
          {r.feedback && (r.feedback.matched.length > 0 || r.feedback.missing.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">{L('Түлхүүр үгс:', 'Key words:')}</span>
              {r.feedback.matched.map((k) => (
                <Badge key={`m-${k}`} tone="matcha">
                  <Check className="size-3" />
                  {k}
                </Badge>
              ))}
              {r.feedback.missing.map((k) => (
                <Badge key={`x-${k}`} tone="shu">
                  <X className="size-3" />
                  {k}
                </Badge>
              ))}
            </div>
          )}
          {r.question.audioText && (
            <div className="rounded-xl border border-line p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium text-muted">{L('Бичвэр (транскрипт)', 'Transcript')}</p>
                <SpeakButton text={r.question.audioText} size="sm" />
              </div>
              <p className="jp whitespace-pre-line leading-7 text-ink">{r.question.audioText}</p>
            </div>
          )}
          <p className="text-ink-2">
            <span className="font-medium text-ink">{L('Тайлбар: ', 'Explanation: ')}</span>
            {r.explanation}
          </p>
        </div>
      )}
    </li>
  );
}

export default function QuizResults({ attempt, onRetry, disclaimer, extra }: { attempt: Attempt; onRetry?: () => void; disclaimer?: string; extra?: ReactNode }) {
  const { L, lang } = useI18n();
  const [filter, setFilter] = useState<'all' | 'wrong'>('all');
  const passed = attempt.percent >= attempt.passingScore;
  const sections = Object.entries(attempt.sectionScores ?? {});
  const showSections = sections.length > 1 && ['mock_exam', 'module_test'].includes(attempt.kind);
  const shown = attempt.results.filter((r) => filter === 'all' || !r.correct);

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <ProgressRing value={attempt.percent} size={120} stroke={10}>
          <div>
            <p className="text-3xl font-semibold tabular-nums text-ink">{attempt.percent}%</p>
            <p className="text-xs text-muted">
              {attempt.correct}/{attempt.total}
            </p>
          </div>
        </ProgressRing>
        <div className="flex-1 text-center sm:text-left">
          <Badge tone={passed ? 'matcha' : 'shu'} className="mb-2">
            {passed ? L('Тэнцлээ', 'Passed') : L('Тэнцээгүй', 'Not passed')} · {L('босго', 'pass mark')} {attempt.passingScore}%
          </Badge>
          <h2 className="text-xl font-semibold text-ink">{attempt.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {L('Зөв', 'Correct')}: <b className="text-matcha">{attempt.correct}</b> · {L('Буруу', 'Incorrect')}: <b className="text-shu">{attempt.total - attempt.correct}</b>
            {attempt.durationSec > 0 && ` · ${Math.ceil(attempt.durationSec / 60)} ${L('мин', 'min')}`}
          </p>
          {disclaimer && <p className="mt-2 rounded-lg bg-yamabuki-soft px-3 py-2 text-xs font-medium text-yamabuki">{disclaimer}</p>}
        </div>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            <RotateCcw className="size-4" />
            {L('Дахин өгөх', 'Retry')}
          </Button>
        )}
      </Card>

      {showSections && (
        <Card>
          <h3 className="mb-3 font-semibold text-ink">{L('Хэсгийн оноо', 'Section scores')}</h3>
          <div className="flex flex-col gap-3">
            {sections.map(([key, s]) => (
              <div key={key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-ink-2">{sectionLabel(key, lang) || categoryLabel(key, lang)}</span>
                  <span className="tabular-nums text-muted">
                    {s.correct}/{s.total} · {Math.round((s.correct / s.total) * 100)}%
                  </span>
                </div>
                <ProgressBar value={s.correct} max={s.total} tone={s.correct / s.total >= 0.6 ? 'matcha' : 'shu'} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {(attempt.weakCategories.length > 0 || attempt.recommendedLessons.length > 0) && (
        <Card>
          <h3 className="mb-1 font-semibold text-ink">{L('Давтахыг зөвлөж байна', 'Recommended review')}</h3>
          <p className="mb-3 text-sm text-muted">{passed ? L('Сайн байна! Дараах хэсгийг бататгаарай.', 'Well done! Strengthen these areas.') : L('Сул хэсгүүдээ давтаад дахин оролдоорой.', 'Review your weak areas, then try again.')}</p>
          <div className="flex flex-wrap gap-2">
            {attempt.weakCategories.map((c) => (
              <Link key={c.category} to={CATEGORY_PAGE[c.category] ?? '/review'} className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm hover:border-shu">
                <span className="font-medium text-ink">{categoryLabel(c.category, lang)}</span>
                <span className="ml-2 tabular-nums text-shu">{c.accuracy}%</span>
              </Link>
            ))}
          </div>
          {attempt.recommendedLessons.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {attempt.recommendedLessons.map((l) => (
                <li key={l.id}>
                  <Link to={`/lessons/${l.id}`} className="text-sm font-medium text-ai hover:underline">
                    → {l.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {extra}

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink">{L('Хариултууд', 'Answers')}</h3>
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: L(`Бүгд (${attempt.results.length})`, `All (${attempt.results.length})`) },
              { value: 'wrong', label: L(`Буруу (${attempt.total - attempt.correct})`, `Incorrect (${attempt.total - attempt.correct})`) },
            ]}
          />
        </div>
        <ol className="flex flex-col gap-2.5">
          {shown.map((r) => (
            <ResultItem key={r.question.id} r={r} index={attempt.results.indexOf(r)} />
          ))}
        </ol>
      </div>
    </div>
  );
}
