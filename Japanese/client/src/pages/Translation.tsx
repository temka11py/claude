import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react';
import { api, post } from '../api/client';
import type { Feedback, Question } from '../api/types';
import { useI18n } from '../i18n';
import { useToast } from '../hooks/useToast';
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, Segmented, SpeakButton, Spinner, cx } from '../components/ui';
import { submitPractice } from '../components/quiz/runners';

type Direction = 'ja_to_mn' | 'mn_to_ja';

interface CheckResult {
  correct: boolean;
  expected: string;
  feedback?: Feedback;
  explanation: string;
}

export default function Translation() {
  const { L, lang } = useI18n();
  const { celebrate } = useToast();
  const [direction, setDirection] = useState<Direction>('ja_to_mn');
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<number, CheckResult>>({});
  const [checking, setChecking] = useState(false);
  const [finished, setFinished] = useState<{ correct: number; total: number } | null>(null);
  const [round, setRound] = useState(0);
  const started = useRef(Date.now());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    setQuestions(null);
    setI(0);
    setAnswer('');
    setAnswers({});
    setResults({});
    setFinished(null);
    started.current = Date.now();
    api<{ questions: Question[] }>(`/quiz/practice?categories=translation&types=${direction}&count=6`).then((r) => alive && setQuestions(r.questions));
    return () => {
      alive = false;
    };
  }, [direction, round]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [i, questions]);

  if (!questions) return <Spinner />;
  if (questions.length === 0) return <EmptyState title={L('Дасгал олдсонгүй', 'No exercises found')} />;
  const q = questions[i];
  const result = results[q?.id];

  const check = async () => {
    if (!answer.trim() || result) return;
    setChecking(true);
    try {
      const r = await post<CheckResult>('/quiz/check', { questionId: q.id, answer });
      setResults((x) => ({ ...x, [q.id]: r }));
      setAnswers((x) => ({ ...x, [q.id]: answer }));
    } finally {
      setChecking(false);
    }
  };

  const next = async () => {
    if (i + 1 < questions.length) {
      setI(i + 1);
      setAnswer('');
      return;
    }
    const r = await submitPractice(
      questions.map((x) => x.id),
      answers,
      Math.round((Date.now() - started.current) / 1000),
      'translation',
      L('Орчуулгын дасгал', 'Translation practice'),
    );
    celebrate(r.achievements, lang);
    setFinished({ correct: r.attempt.correct, total: r.attempt.total });
  };

  return (
    <div>
      <PageHeader
        titleJa="ほんやく"
        title={L('Орчуулга', 'Translation')}
        subtitle={L('Өгүүлбэрийг орчуулаад шалгуулаарай. Цэг таслал, жижиг ялгааг үл тооцож, гол үгсээр нь шалгана.', 'Translate the sentence and check it. Punctuation is ignored; the key words are checked.')}
        actions={
          <Segmented
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'ja_to_mn', label: L('Япон → Монгол', 'Japanese → Mongolian') },
              { value: 'mn_to_ja', label: L('Монгол → Япон', 'Mongolian → Japanese') },
            ]}
          />
        }
      />

      {finished ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-4xl font-semibold tabular-nums text-ink">
            {finished.correct}/{finished.total}
          </p>
          <p className="text-sm text-muted">{L('өгүүлбэрийг зөв орчууллаа', 'sentences translated correctly')}</p>
          <Button onClick={() => setRound((r) => r + 1)}>
            <RotateCcw className="size-4" />
            {L('Шинэ өгүүлбэрүүд', 'New sentences')}
          </Button>
        </Card>
      ) : (
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums text-muted">
              {i + 1} / {questions.length}
            </span>
            <ProgressBar value={i + (result ? 1 : 0)} max={questions.length} />
          </div>
          <Card className="flex flex-col gap-4 p-5 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{direction === 'ja_to_mn' ? L('Монгол хэл рүү орчуулна уу', 'Translate into Mongolian') : L('Япон хэл рүү орчуулна уу', 'Translate into Japanese')}</p>
            <div className="flex items-start gap-3">
              {direction === 'ja_to_mn' && <SpeakButton text={q.prompt} className="mt-1" />}
              <p className={cx('text-2xl font-medium leading-relaxed text-ink', direction === 'ja_to_mn' && 'jp')}>{q.prompt}</p>
            </div>
            <textarea
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={!!result}
              rows={3}
              lang={direction === 'mn_to_ja' ? 'ja' : 'mn'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (result) void next();
                  else void check();
                }
              }}
              placeholder={direction === 'mn_to_ja' ? L('日本語で書いてください…', '日本語で書いてください…') : L('Монгол орчуулга…', 'Mongolian translation…')}
              className={cx('w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-lg outline-none focus:border-shu', direction === 'mn_to_ja' && 'jp')}
            />
            {result && (
              <div className={cx('animate-rise flex flex-col gap-3 rounded-2xl p-4', result.correct ? 'bg-matcha-soft' : 'bg-shu-soft')}>
                <p className={cx('flex items-center gap-2 font-semibold', result.correct ? 'text-matcha' : 'text-shu')}>
                  {result.correct ? <Check className="size-5" /> : <X className="size-5" />}
                  {result.correct ? L('Зөв! Сайн байна.', 'Correct! Well done.') : L('Бүрэн зөв биш байна.', 'Not quite right.')}
                </p>
                {result.feedback && (result.feedback.matched.length > 0 || result.feedback.missing.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-ink-2">{L('Гол үгс:', 'Key words:')}</span>
                    {result.feedback.matched.map((k) => (
                      <Badge key={k} tone="matcha">
                        <Check className="size-3" />
                        {k}
                      </Badge>
                    ))}
                    {result.feedback.missing.map((k) => (
                      <Badge key={k} tone="shu">
                        <X className="size-3" />
                        {k}
                      </Badge>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-xs text-ink-2">{L('Жишээ зөв хариулт', 'Model answer')}</p>
                  <div className="flex items-center gap-2">
                    <p className={cx('text-lg font-medium text-ink', direction === 'mn_to_ja' && 'jp')}>{result.expected}</p>
                    {direction === 'mn_to_ja' && <SpeakButton text={result.expected} size="sm" />}
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              {result ? (
                <Button onClick={next}>
                  {i + 1 < questions.length ? L('Дараах', 'Next') : L('Дуусгах', 'Finish')}
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setAnswers((x) => ({ ...x, [q.id]: '' }));
                      setResults((x) => ({ ...x, [q.id]: { correct: false, expected: '', explanation: '' } }));
                      void post<CheckResult>('/quiz/check', { questionId: q.id, answer: '' }).then((r) => setResults((x) => ({ ...x, [q.id]: r })));
                    }}
                  >
                    {L('Хариуг харах', 'Show answer')}
                  </Button>
                  <Button onClick={check} loading={checking} disabled={!answer.trim()}>
                    {L('Шалгах', 'Check')}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
