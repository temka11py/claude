import { useRef, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AnswerValue, CheckResult } from '@shared/scoring';
import { post } from '../lib/api';
import { QuestionView, type AnyQuestion } from './QuestionView';
import { Button, ProgressBar, SkillBadge } from './ui';

export interface SequenceResult {
  correct: number;
  total: number;
  /** Average credit 0–1. */
  score: number;
  bySkill: Record<string, { sum: number; n: number }>;
}

function describe(q: AnyQuestion, value: AnswerValue): string {
  if (value === null || value === undefined) return '';
  if (q.type === 'mcq') return (q.options as string[])[Number(value)] ?? '';
  if (q.type === 'error') return (q.segments as string[])[Number(value)] ?? '';
  if (Array.isArray(value)) return value.join(' ');
  return String(value);
}

function fill(prompt: string, text: string): string {
  return prompt.split('\n')[0].replace(/_{3,}/, text);
}

/** What goes to the server for analytics and the mistakes notebook. */
export function responseFor(q: AnyQuestion, value: AnswerValue, result: CheckResult) {
  const skill = (q.skill as string) ?? 'grammar';
  const base = {
    questionId: q.id,
    skill,
    qtype: q.type,
    tag: (q.tag as string) ?? null,
    level: (q.level as string) ?? null,
    difficulty: (q.difficulty as number) ?? null,
    correct: result.correct,
    score: result.score,
  };
  const languageError = !result.correct && ['grammar', 'vocabulary'].includes(skill) && !['order', 'match', 'summary'].includes(q.type);
  if (!languageError) return base;
  const given = describe(q, value);
  let wrong: string;
  let right: string;
  if ((q.type === 'gap' || q.type === 'mcq') && /_{3,}/.test(q.prompt)) {
    wrong = fill(q.prompt, given);
    right = fill(q.prompt, result.expected);
  } else if (q.type === 'correct') {
    wrong = String(q.sentence);
    right = result.expected;
  } else {
    wrong = given;
    right = result.expected;
  }
  return {
    ...base,
    wrong: wrong.slice(0, 500),
    right: right.slice(0, 500),
    explanation: (q.explanation as string) ?? null,
    explanationMn: (q.explanationMn as string) ?? null,
    errorCategory: result.feedback === 'almost' ? ('spelling' as const) : null,
  };
}

export interface ResponsePayload {
  questionId?: string | null;
  skill: string;
  qtype: string;
  tag?: string | null;
  level?: string | null;
  difficulty?: number | null;
  correct: boolean;
  score: number;
  wrong?: string;
  right?: string;
  explanation?: string | null;
  explanationMn?: string | null;
  errorCategory?: string | null;
}

export function postResponses(context: { type: string; id?: string | null }, answers: ResponsePayload[]) {
  if (!answers.length) return;
  void post('/practice/answers', { context, answers }).catch(() => {
    /* analytics only — never block the learner */
  });
}

export function QuestionSequence({
  questions,
  context,
  onComplete,
  header,
  finishLabel = 'Continue',
}: {
  questions: AnyQuestion[];
  context: { type: string; id?: string | null };
  onComplete: (r: SequenceResult) => void;
  header?: ReactNode;
  finishLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const results = useRef<{ skill: string; score: number; correct: boolean }[]>([]);

  if (!questions.length) {
    return (
      <Button block size="lg" onClick={() => onComplete({ correct: 0, total: 0, score: 1, bySkill: {} })}>
        {finishLabel}
      </Button>
    );
  }

  const q = questions[index];
  const last = index === questions.length - 1;

  function next() {
    if (last) {
      const bySkill: SequenceResult['bySkill'] = {};
      for (const r of results.current) {
        bySkill[r.skill] ??= { sum: 0, n: 0 };
        bySkill[r.skill].sum += r.score;
        bySkill[r.skill].n += 1;
      }
      const total = results.current.length;
      onComplete({
        correct: results.current.filter((r) => r.correct).length,
        total,
        score: total ? results.current.reduce((a, r) => a + r.score, 0) / total : 1,
        bySkill,
      });
      return;
    }
    setIndex(index + 1);
    setAnswered(false);
  }

  return (
    <div>
      {header}
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={index / questions.length} size="sm" label="Question progress" />
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
          {index + 1}/{questions.length}
        </span>
      </div>
      {q.skill && <SkillBadge skill={q.skill as string} className="mb-3" />}
      <QuestionView
        key={q.id}
        question={q}
        mode="practice"
        onAnswered={({ value, result }) => {
          results.current.push({ skill: (q.skill as string) ?? 'grammar', score: result.score, correct: result.correct });
          postResponses(context, [responseFor(q, value, result)]);
          setAnswered(true);
        }}
        footer={
          answered && (
            <div className="mt-4">
              <Button block size="lg" onClick={next} icon={<ArrowRight className="size-5" />} autoFocus>
                {last ? finishLabel : 'Next'}
              </Button>
            </div>
          )
        }
      />
    </div>
  );
}
