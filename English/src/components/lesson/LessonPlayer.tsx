import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Trophy, X } from 'lucide-react';
import { get, post } from '../../lib/api';
import { useToast } from '../../lib/context';
import type { CompletionResult, LessonPayload, StepView } from '../../lib/types';
import { stopSpeaking } from '../../lib/tts';
import { ListeningActivity } from '../activities/Listening';
import { ReadingActivity } from '../activities/Reading';
import { SpeakingActivity } from '../activities/Speaking';
import { WritingActivity } from '../activities/Writing';
import { DictationActivity } from '../activities/Dictation';
import { PronunciationActivity } from '../activities/Shadowing';
import { QuestionSequence } from '../QuestionSequence';
import { Button, ButtonLink, Callout, ErrorState, LevelBadge, ProgressBar, Ring, SkillBadge, Spinner } from '../ui';
import { GrammarStep, ObjectivesStep, PhrasesStep, QuizStep, VocabPracticeStep, VocabularyStep, WarmupStep, type StepResult } from './Steps';

type Scores = Record<string, { sum: number; n: number }>;

function nextLink(next: CompletionResult['next']): { to: string; label: string } | null {
  if (next.type === 'lesson') return { to: `/lesson/${next.lessonId}`, label: `Next: ${next.lessonTitle}` };
  if (next.type === 'module_test') return { to: `/test/module/${next.moduleId}`, label: `Take the module test` };
  if (next.type === 'level_exam') return { to: `/test/level/${encodeURIComponent(next.level)}`, label: `Take the ${next.level} level exam` };
  return null;
}

export function LessonPlayerView({
  lessonId,
  fromStep,
  toStep,
  onExit,
  onRangeComplete,
  embedded,
}: {
  lessonId: string;
  fromStep?: number;
  toStep?: number;
  onExit: () => void;
  /** Called when the requested step range is finished (session mode). */
  onRangeComplete?: (completed: CompletionResult | null) => void;
  embedded?: boolean;
}) {
  const q = useQuery({ queryKey: ['lesson', lessonId], queryFn: () => get<LessonPayload>(`/lessons/${lessonId}`), staleTime: Infinity, gcTime: 0 });
  const [index, setIndex] = useState<number | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scores = useRef<Scores>({});
  const quizScore = useRef<number | null>(null);
  const started = useRef(Date.now());
  const rangeAlreadyDone = useRef(false);
  const { reward } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!q.data || index !== null) return;
    const { status, currentStep } = q.data.progress;
    if (fromStep === undefined) {
      setIndex(currentStep);
      return;
    }
    // A session segment resumes where the learner really is, so steps already done
    // (before leaving the page, or from the course page) are never repeated.
    const start = status === 'in_progress' ? Math.max(fromStep, currentStep) : fromStep;
    if (toStep === undefined || start <= toStep) setIndex(start);
    else if (!rangeAlreadyDone.current) {
      rangeAlreadyDone.current = true;
      onRangeComplete?.(null);
    }
  }, [q.data, index, fromStep, toStep, onRangeComplete]);
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [index]);

  if (q.isLoading || index === null) return <Spinner label="Loading lesson…" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const data = q.data;
  const steps = data.steps;
  const step: StepView | undefined = steps[index];
  const lastIndex = steps.length - 1;

  async function complete() {
    setFinishing(true);
    setError(null);
    try {
      const skillScores: Record<string, number> = {};
      for (const [k, v] of Object.entries(scores.current)) if (v.n) skillScores[k] = v.sum / v.n;
      const res = await post<CompletionResult>(`/lessons/${lessonId}/complete`, {
        score: quizScore.current ?? 1,
        skillScores,
        minutes: Math.min(120, (Date.now() - started.current) / 60000),
      });
      reward(res);
      setCompletion(res);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['course'] });
      void qc.invalidateQueries({ queryKey: ['module'] });
      return res;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setFinishing(false);
    }
  }

  async function onStepDone(r: StepResult) {
    if (r.seq && step?.kind !== 'warmup') {
      for (const [skill, v] of Object.entries(r.seq.bySkill)) {
        scores.current[skill] ??= { sum: 0, n: 0 };
        scores.current[skill].sum += v.sum;
        scores.current[skill].n += v.n;
      }
      if (step?.kind === 'quiz') quizScore.current = r.seq.score;
    }
    stopSpeaking();
    if (index === lastIndex) {
      const res = await complete();
      if (res && onRangeComplete) onRangeComplete(res);
      return;
    }
    const next = index! + 1;
    void post(`/lessons/${lessonId}/progress`, { step: next }).catch(() => undefined);
    if (toStep !== undefined && index! >= toStep) {
      onRangeComplete?.(null);
      return;
    }
    setIndex(next);
  }

  if (completion) {
    const link = nextLink(completion.next);
    return (
      <div className="animate-pop mx-auto max-w-lg py-6 text-center">
        <Ring value={completion.score} size={120} stroke={10} label={`Quiz score ${Math.round(completion.score * 100)}%`}>
          <div>
            <div className="text-3xl font-bold">{Math.round(completion.score * 100)}%</div>
            <div className="text-xs text-muted">quiz</div>
          </div>
        </Ring>
        <h2 className="mt-4 text-2xl font-bold">Lesson complete!</h2>
        <p className="mt-1 text-muted">{data.lesson.title}</p>
        <div className="mt-4">
          <Callout kind={completion.action === 'review_prerequisites' ? 'warning' : completion.action === 'increase' ? 'success' : 'info'}>{completion.message}</Callout>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-xl bg-accent-soft p-3">
            <div className="text-xl font-bold text-accent">+{completion.xp}</div>XP
          </div>
          <div className="rounded-xl bg-primary-soft p-3">
            <div className="text-xl font-bold text-primary">{completion.lessonWords}</div>words to review
          </div>
          <div className="rounded-xl bg-success-soft p-3">
            <div className="text-xl font-bold text-success">{Math.round(completion.moduleProgress * 100)}%</div>module
          </div>
        </div>
        {completion.achievements.length > 0 && (
          <div className="mt-4 rounded-xl bg-surface p-3 ring-1 ring-border">
            {completion.achievements.map((a) => (
              <div key={a.code} className="flex items-center justify-center gap-2 font-semibold">
                <Trophy className="size-4 text-accent" /> {a.title}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-sm text-muted">New words will come back for review later today and in 2 days.</p>
        <div className="mt-5 flex flex-col gap-2">
          {onRangeComplete ? (
            <Button size="lg" onClick={() => onRangeComplete(completion)}>
              Continue session
            </Button>
          ) : (
            <>
              {link && (
                <ButtonLink to={link.to} size="lg" icon={<ArrowRight className="size-5" />}>
                  {link.label}
                </ButtonLink>
              )}
              <Button variant="secondary" size="lg" onClick={() => navigate(`/module/${data.module.id}`)}>
                Back to module
              </Button>
              {completion.action === 'review_prerequisites' && (
                <Button variant="ghost" onClick={() => window.location.reload()}>
                  Repeat this lesson
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const context = { type: 'lesson', id: lessonId };
  let body: React.ReactNode;
  if (!step) body = <Button onClick={() => void complete()}>Finish lesson</Button>;
  else
    switch (step.kind) {
      case 'warmup':
        body = <WarmupStep step={step} lessonId={lessonId} onDone={onStepDone} />;
        break;
      case 'objectives':
        body = <ObjectivesStep step={step} onDone={onStepDone} />;
        break;
      case 'vocabulary':
        body = <VocabularyStep step={step} onDone={onStepDone} />;
        break;
      case 'vocab_practice':
        body = <VocabPracticeStep step={step} lessonId={lessonId} onDone={onStepDone} />;
        break;
      case 'phrases':
        body = <PhrasesStep step={step} onDone={onStepDone} />;
        break;
      case 'grammar':
        body = <GrammarStep step={step} onDone={onStepDone} />;
        break;
      case 'reading':
        body = <ReadingActivity material={step.material} questions={step.material.questions} context={context} onComplete={(seq) => onStepDone({ seq })} />;
        break;
      case 'listening':
        body = (
          <ListeningActivity
            material={step.material}
            gist={step.material.gist}
            detail={step.material.detail}
            rate={step.rate}
            context={context}
            onComplete={(seq) => onStepDone({ seq })}
          />
        );
        break;
      case 'pronunciation':
        body = <PronunciationActivity topic={step.topic} onComplete={() => onStepDone({})} />;
        break;
      case 'speaking':
        body = (
          <SpeakingActivity
            task={step.task}
            context={`lesson:${lessonId}`}
            onComplete={(r) => onStepDone(r.score !== null ? { seq: { correct: 0, total: 1, score: r.score, bySkill: { speaking: { sum: r.score, n: 1 } } } } : {})}
          />
        );
        break;
      case 'writing':
        body = (
          <WritingActivity
            task={step.task}
            context={`lesson:${lessonId}`}
            onComplete={(r) => onStepDone(r.score !== null ? { seq: { correct: 0, total: 1, score: r.score, bySkill: { writing: { sum: r.score, n: 1 } } } } : {})}
          />
        );
        break;
      case 'quiz':
        body = <QuizStep step={step} lessonId={lessonId} onDone={onStepDone} />;
        break;
      case 'grammar_mix':
        body = <QuestionSequence questions={step.questions} context={context} onComplete={(seq) => onStepDone({ seq })} />;
        break;
      case 'dictation':
        body = (
          <DictationActivity
            sentences={step.sentences.map((s) => ({ ...s, source: data.lesson.title, level: data.lesson.level }))}
            rate={step.rate}
            onComplete={(r) => onStepDone({ seq: { correct: 0, total: 1, score: r.score, bySkill: { listening: { sum: r.score, n: 1 } } } })}
          />
        );
        break;
      case 'reading_mix':
        body = (
          <div>
            <p className="mb-3 text-sm text-muted">From “{step.source}”.</p>
            <QuestionSequence questions={[step.question]} context={context} onComplete={(seq) => onStepDone({ seq })} />
          </div>
        );
        break;
    }

  return (
    <div className={embedded ? '' : 'mx-auto max-w-3xl px-4 pb-16 pt-3 sm:px-6'}>
      {!embedded && (
        <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onExit} className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2" aria-label="Leave lesson (progress is saved)">
              <X className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted">
                <LevelBadge level={data.module.level} />
                <span className="truncate">{data.module.title}</span>
              </div>
              <div className="truncate text-sm font-semibold">{data.lesson.title}</div>
            </div>
            <span className="hidden shrink-0 items-center gap-1 text-xs text-muted sm:flex">
              <Clock className="size-3.5" /> {data.lesson.minutes} min
            </span>
          </div>
          <div className="mt-2 flex gap-1" aria-label={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((s, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i < index ? 'bg-success' : i === index ? 'bg-primary' : 'bg-surface-2'}`} title={s.title} />
            ))}
          </div>
        </header>
      )}
      {step && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{step.title}</h2>
          <SkillBadge skill={step.skill} />
        </div>
      )}
      {embedded && <ProgressBar value={index / steps.length} size="sm" className="mb-4" label="Lesson progress" />}
      <div key={index} className="animate-slide-up">
        {body}
      </div>
      {finishing && <Spinner label="Saving your progress…" />}
      {error && (
        <div className="mt-4">
          <Callout kind="warning" title="Couldn't save the lesson">
            {error}
            <div className="mt-2">
              <Button size="sm" onClick={() => void complete()}>
                Try again
              </Button>
            </div>
          </Callout>
        </div>
      )}
    </div>
  );
}
