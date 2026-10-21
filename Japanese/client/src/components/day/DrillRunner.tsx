import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { post } from '../../api/client';
import type { Question } from '../../api/types';
import { useI18n } from '../../i18n';
import { useToast } from '../../hooks/useToast';
import { stopAudio } from '../../lib/speech';
import { Button, Card, Jp, ProgressRing, cx } from '../ui';
import QuestionView, { isAnswered } from '../quiz/QuestionView';
import { submitPractice } from '../quiz/runners';

interface Checked {
  correct: boolean;
  expected: string;
  explanation: string;
}

/**
 * Duolingo-style runner: one question at a time with instant feedback.
 * Missed questions come back once at the end. First answers are recorded
 * as a practice attempt (weak areas, statistics); the step score is the
 * share of questions answered right the first time.
 */
export default function DrillRunner({ questions, title, onComplete, intro }: { questions: Question[]; title: string; onComplete: (percent: number) => void; intro?: string }) {
  const { L, lang } = useI18n();
  const { celebrate } = useToast();
  const [queue, setQueue] = useState(questions);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState<Checked | null>(null);
  const [busy, setBusy] = useState(false);
  const firstAnswers = useRef<Record<string, string>>({});
  const firstCorrect = useRef(new Set<number>());
  const retried = useRef(new Set<number>());
  const started = useRef(Date.now());
  const [percent, setPercent] = useState<number | null>(null);

  const q = queue[index];

  const check = useCallback(async () => {
    if (!q || busy || checked || !isAnswered(q, value)) return;
    setBusy(true);
    stopAudio();
    try {
      const r = await post<Checked>('/quiz/check', { questionId: q.id, answer: value });
      setChecked(r);
      if (!(q.id in firstAnswers.current)) {
        firstAnswers.current[q.id] = value;
        if (r.correct) firstCorrect.current.add(q.id);
      }
      if (!r.correct && !retried.current.has(q.id)) {
        retried.current.add(q.id);
        setQueue((list) => [...list, q]);
      }
    } finally {
      setBusy(false);
    }
  }, [q, busy, checked, value]);

  const finish = useCallback(async () => {
    const total = questions.length;
    const pct = total ? Math.round((firstCorrect.current.size / total) * 100) : 100;
    setPercent(pct);
    try {
      const r = await submitPractice(questions.map((x) => x.id), firstAnswers.current, Math.round((Date.now() - started.current) / 1000), 'daily', title);
      celebrate(r.achievements, lang);
    } catch {
      /* statistics only — the step still counts */
    }
  }, [questions, title, celebrate, lang]);

  const next = useCallback(() => {
    setChecked(null);
    setValue('');
    if (index + 1 >= queue.length) void finish();
    else setIndex((i) => i + 1);
  }, [index, queue.length, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (checked) next();
      else void check();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [checked, next, check]);

  if (percent !== null) {
    const good = percent >= 80;
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <ProgressRing value={percent} size={110}>
          <span className="text-2xl font-semibold tabular-nums text-ink">{percent}%</span>
        </ProgressRing>
        <div>
          <p className="text-lg font-semibold text-ink">{good ? L('Маш сайн!', 'Great job!') : percent >= 50 ? L('Сайн байна!', 'Good effort!') : L('Дахиад давтаарай', 'Keep practising')}</p>
          <p className="text-sm text-muted">
            {L(`Эхний оролдлогоор ${firstCorrect.current.size}/${questions.length} зөв`, `${firstCorrect.current.size}/${questions.length} right on the first try`)}
          </p>
        </div>
        <Button size="lg" onClick={() => onComplete(percent)}>
          {L('Үргэлжлүүлэх', 'Continue')}
          <ArrowRight className="size-4" />
        </Button>
      </Card>
    );
  }
  if (!q) return null;

  return (
    <div className="flex flex-col gap-4">
      {intro && index === 0 && !checked && <p className="text-sm text-muted">{intro}</p>}
      <div className="flex items-center gap-3">
        <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-matcha transition-[width] duration-500" style={{ width: `${(index / queue.length) * 100}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted">
          {index + 1}/{queue.length}
        </span>
      </div>
      {index >= questions.length && !checked && <p className="text-xs font-medium text-yamabuki">{L('Алдсан асуултаа дахин оролдоно уу', 'Try the missed question again')}</p>}
      <Card>
        <QuestionView key={`${q.id}-${index}`} q={q} value={value} onChange={(v) => !checked && setValue(v)} disabled={!!checked} onEnter={() => void check()} />
      </Card>
      {checked ? (
        <div className={cx('animate-rise flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center', checked.correct ? 'border-matcha/30 bg-matcha-soft' : 'border-shu/30 bg-shu-soft')} role="status">
          <span className={cx('grid size-10 shrink-0 place-items-center rounded-full text-white', checked.correct ? 'bg-matcha' : 'bg-shu')}>{checked.correct ? <Check className="size-5" /> : <X className="size-5" />}</span>
          <div className="min-w-0 flex-1 text-sm">
            <p className={cx('font-semibold', checked.correct ? 'text-matcha' : 'text-shu')}>{checked.correct ? L('Зөв!', 'Correct!') : L('Буруу', 'Not quite')}</p>
            {!checked.correct && (
              <p className="text-ink">
                {L('Зөв хариулт:', 'Answer:')} <Jp text={checked.expected === 'true' ? L('Үнэн', 'True') : checked.expected === 'false' ? L('Худал', 'False') : checked.expected} className="font-medium" />
              </p>
            )}
            {checked.explanation && <Jp text={checked.explanation} className="mt-0.5 block leading-loose text-ink-2" />}
          </div>
          <Button size="lg" variant={checked.correct ? 'success' : 'primary'} onClick={next} autoFocus>
            {L('Үргэлжлүүлэх', 'Continue')}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : (
        <Button size="lg" onClick={() => void check()} loading={busy} disabled={!isAnswered(q, value)} className="w-full sm:w-auto sm:self-end">
          {L('Шалгах', 'Check')}
        </Button>
      )}
    </div>
  );
}
