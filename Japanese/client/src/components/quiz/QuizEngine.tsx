import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Clock, Flag, Send } from 'lucide-react';
import type { Achievement, Attempt, Question } from '../../api/types';
import { useI18n } from '../../i18n';
import { useToast } from '../../hooks/useToast';
import { formatClock } from '../../lib/format';
import { sectionLabel } from '../../lib/labels';
import { stopAudio } from '../../lib/speech';
import { Button, Card, Modal, ProgressBar, cx } from '../ui';
import QuestionView, { isAnswered } from './QuestionView';
import QuizResults from './QuizResults';

export interface SubmitResult {
  attempt: Attempt;
  achievements?: Achievement[];
}

interface Props {
  questions: Question[];
  submit: (answers: Record<string, string>, durationSec: number) => Promise<SubmitResult>;
  mode?: 'paged' | 'exam';
  timeLimitSec?: number | null;
  showAudio?: boolean;
  disclaimer?: string;
  onFinished?: (attempt: Attempt) => void;
  onRetry?: () => void;
  resultExtra?: (attempt: Attempt) => ReactNode;
  header?: ReactNode;
}

/**
 * The single quiz engine used across lessons, practice sets, module tests,
 * listening, stories and the JLPT mock exam. Answers are never revealed
 * before submission; grading happens on the server.
 */
export default function QuizEngine({ questions, submit, mode = 'paged', timeLimitSec, showAudio = true, disclaimer, onFinished, onRetry, resultExtra, header }: Props) {
  const { L, lang } = useI18n();
  const { celebrate, notify } = useToast();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Set<number>>(new Set());
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const started = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  const q = questions[index];
  const answeredCount = questions.filter((x) => isAnswered(x, answers[x.id])).length;
  const remaining = timeLimitSec ? Math.max(0, timeLimitSec - Math.floor((now - started.current) / 1000)) : null;

  const doSubmit = useCallback(async () => {
    if (submitting || attempt) return;
    setSubmitting(true);
    setConfirm(false);
    stopAudio();
    try {
      const result = await submit(answers, Math.round((Date.now() - started.current) / 1000));
      setAttempt(result.attempt);
      celebrate(result.achievements, lang);
      onFinished?.(result.attempt);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      notify({ kind: 'error', title: L('Илгээж чадсангүй', 'Could not submit'), body: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  }, [answers, attempt, celebrate, lang, notify, onFinished, submit, submitting, L]);

  useEffect(() => {
    if (!timeLimitSec || attempt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timeLimitSec, attempt]);

  useEffect(() => {
    if (remaining === 0 && !attempt && !submitting) void doSubmit();
  }, [remaining, attempt, submitting, doSubmit]);

  const sections = useMemo(() => {
    const map = new Map<string, number[]>();
    questions.forEach((x, i) => {
      const key = x.section || '';
      map.set(key, [...(map.get(key) ?? []), i]);
    });
    return [...map.entries()];
  }, [questions]);

  if (attempt) {
    return (
      <QuizResults
        attempt={attempt}
        disclaimer={disclaimer}
        extra={resultExtra?.(attempt)}
        onRetry={
          onRetry
            ? () => {
                setAttempt(null);
                setAnswers({});
                setIndex(0);
                started.current = Date.now();
                onRetry();
              }
            : undefined
        }
      />
    );
  }

  if (!q) return null;
  const setAnswer = (v: string) => setAnswers((a) => ({ ...a, [q.id]: v }));
  const last = index === questions.length - 1;
  const goNext = () => (last ? setConfirm(true) : setIndex((i) => i + 1));

  const navigator = mode === 'exam' && (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium text-ink">{L('Асуултууд', 'Questions')}</span>
        <span className="tabular-nums text-muted">
          {answeredCount}/{questions.length}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {sections.map(([key, idxs]) => (
          <div key={key}>
            {key && <p className="mb-1.5 text-xs font-medium text-muted">{sectionLabel(key, lang)}</p>}
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-6">
              {idxs.map((i) => {
                const answered = isAnswered(questions[i], answers[questions[i].id]);
                return (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    className={cx(
                      'relative grid aspect-square place-items-center rounded-lg text-xs font-semibold tabular-nums transition-colors',
                      i === index ? 'bg-shu text-white' : answered ? 'bg-ai-soft text-ai' : 'bg-surface-2 text-muted hover:text-ink',
                    )}
                    aria-label={`${L('Асуулт', 'Question')} ${i + 1}`}
                  >
                    {i + 1}
                    {flags.has(i) && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-yamabuki" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      {header}
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-sm font-medium tabular-nums text-ink-2">
          {index + 1} / {questions.length}
        </span>
        <ProgressBar value={mode === 'exam' ? answeredCount : index + 1} max={questions.length} className="flex-1" />
        {remaining !== null && (
          <span className={cx('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums', remaining < 300 ? 'bg-shu-soft text-shu' : 'bg-surface-2 text-ink-2')} aria-live="off">
            <Clock className="size-4" />
            {formatClock(remaining)}
          </span>
        )}
      </div>

      <div className={cx('grid gap-4', mode === 'exam' && 'lg:grid-cols-[1fr_17rem]')}>
        <Card className="p-5 sm:p-7">
          {mode === 'exam' && q.section && <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-shu">{sectionLabel(q.section, lang)}</p>}
          <QuestionView key={q.id} q={q} value={answers[q.id] ?? ''} onChange={setAnswer} showAudio={showAudio} onEnter={goNext} />
          <div className="mt-6 flex items-center justify-between gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">{L('Өмнөх', 'Previous')}</span>
            </Button>
            <div className="flex items-center gap-2">
              {mode === 'exam' && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setFlags((f) => {
                      const next = new Set(f);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                  }
                  aria-pressed={flags.has(index)}
                >
                  <Flag className={cx('size-4', flags.has(index) && 'fill-yamabuki text-yamabuki')} />
                  <span className="hidden sm:inline">{L('Тэмдэглэх', 'Flag')}</span>
                </Button>
              )}
              {last ? (
                <Button onClick={() => setConfirm(true)} loading={submitting}>
                  <Send className="size-4" />
                  {L('Илгээх', 'Submit')}
                </Button>
              ) : (
                <Button onClick={goNext} variant={isAnswered(q, answers[q.id]) ? 'primary' : 'secondary'}>
                  {L('Дараах', 'Next')}
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </Card>
        {navigator && (
          <div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
            {navigator}
            <Button onClick={() => setConfirm(true)} loading={submitting} className="w-full">
              <Send className="size-4" />
              {L('Шалгалтаа илгээх', 'Submit exam')}
            </Button>
          </div>
        )}
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={L('Хариултаа илгээх үү?', 'Submit your answers?')}>
        <p className="text-sm text-ink-2">
          {answeredCount < questions.length
            ? L(`${questions.length - answeredCount} асуултад хариулаагүй байна. Хариулаагүй асуулт буруу гэж тооцогдоно.`, `${questions.length - answeredCount} question(s) are unanswered and will count as incorrect.`)
            : L('Бүх асуултад хариулсан байна.', 'All questions are answered.')}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            {L('Буцах', 'Go back')}
          </Button>
          <Button onClick={doSubmit} loading={submitting}>
            {L('Илгээх', 'Submit')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
