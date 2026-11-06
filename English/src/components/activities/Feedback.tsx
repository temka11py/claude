import { useState } from 'react';
import { ArrowRight, Bot, Gauge, Sparkles } from 'lucide-react';
import type { SpeakingFeedback, WritingFeedback } from '../../lib/types';
import { Badge, Callout, Card, Mn, Ring, SpeakButton, clsx } from '../ui';

type Fb = WritingFeedback | SpeakingFeedback;

const CRITERIA_LABEL: Record<string, string> = {
  taskAchievement: 'Task',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  coherence: 'Organisation',
  register: 'Register',
  fluency: 'Fluency',
};

export function FeedbackView({ feedback: f, sample, sampleLabel = 'Model answer' }: { feedback: Fb; sample?: string; sampleLabel?: string }) {
  const [showSample, setShowSample] = useState(false);
  const isWriting = 'analysis' in f;
  return (
    <div className="animate-slide-up space-y-4">
      <Card>
        <div className="flex items-start gap-4">
          {f.score !== null && (
            <Ring value={(f.score ?? 0) / 100} size={72} label={`Score ${f.score} out of 100`}>
              <span className="text-lg font-bold">{f.score}</span>
            </Ring>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={f.source === 'ai' ? 'primary' : f.source === 'self' ? 'neutral' : 'accent'}>
                {f.source === 'ai' ? (
                  <>
                    <Bot className="size-3" /> AI feedback
                  </>
                ) : f.source === 'self' ? (
                  'Self-assessed'
                ) : (
                  <>
                    <Gauge className="size-3" /> Automatic estimate
                  </>
                )}
              </Badge>
              {f.levelEstimate && <Badge tone="success">About {f.levelEstimate}</Badge>}
            </div>
            <p className="mt-2 text-[15px]">{f.summary}</p>
          </div>
        </div>
        {f.criteria && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {Object.entries(f.criteria).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface-2 px-3 py-2 text-center">
                <div className="text-xs font-semibold text-muted">{CRITERIA_LABEL[k] ?? k}</div>
                <div className="font-bold">{v}/5</div>
              </div>
            ))}
          </div>
        )}
        {f.note && <p className="mt-3 text-xs text-muted">{f.note}</p>}
      </Card>

      {(f.strengths.length > 0 || f.improvements.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {f.strengths.length > 0 && (
            <Card>
              <h4 className="mb-2 font-semibold text-success">What you did well</h4>
              <ul className="list-disc space-y-1 pl-5 text-[15px]">
                {f.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Card>
          )}
          {f.improvements.length > 0 && (
            <Card>
              <h4 className="mb-2 font-semibold text-accent">What to improve</h4>
              <ul className="list-disc space-y-1 pl-5 text-[15px]">
                {f.improvements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {f.corrections.length > 0 && (
        <Card>
          <h4 className="mb-3 font-semibold">Corrections</h4>
          <ul className="space-y-3">
            {f.corrections.map((c, i) => (
              <li key={i} className="rounded-xl bg-surface-2 p-3">
                <div className="text-[15px] text-danger line-through decoration-danger/50">{c.original}</div>
                <div className="mt-1 flex items-start gap-1.5 text-[15px] font-medium text-success">
                  <ArrowRight className="mt-1 size-4 shrink-0" /> {c.improved}
                </div>
                <p className="mt-1.5 text-sm text-muted">
                  <span className="mr-1 rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold uppercase">{c.category.replace('_', ' ')}</span>
                  {c.explanation}
                </p>
                <Mn>{c.explanationMn}</Mn>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">These corrections were added to “My mistakes” so you can review them later.</p>
        </Card>
      )}

      {'fluencyNote' in f && (f.fluencyNote || f.pronunciationNote) && (
        <Card>
          {f.fluencyNote && (
            <p className="text-[15px]">
              <strong>Fluency: </strong>
              {f.fluencyNote}
            </p>
          )}
          {f.pronunciationNote && (
            <p className="mt-2 text-sm text-muted">
              <strong>Pronunciation: </strong>
              {f.pronunciationNote}
            </p>
          )}
        </Card>
      )}

      {f.betterVersion && (
        <Card>
          <h4 className="mb-2 flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" /> A better version
          </h4>
          <p className="whitespace-pre-line text-[15px] leading-relaxed">{f.betterVersion}</p>
        </Card>
      )}

      {f.usefulVocabulary.length > 0 && (
        <Card>
          <h4 className="mb-2 font-semibold">Useful vocabulary</h4>
          <ul className="space-y-1 text-[15px]">
            {f.usefulVocabulary.map((v) => (
              <li key={v.phrase}>
                <strong>{v.phrase}</strong>
                {v.meaning && <span className="text-muted"> — {v.meaning}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isWriting && (
        <Card>
          <h4 className="mb-2 font-semibold">Text statistics</h4>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              Words: <strong>{f.analysis.wordCount}</strong>
            </div>
            <div>
              Sentences: <strong>{f.analysis.sentenceCount}</strong>
            </div>
            <div>
              Avg. sentence: <strong>{f.analysis.averageSentenceLength}</strong> words
            </div>
            <div>
              Word variety: <strong>{Math.round(f.analysis.lexicalVariety * 100)}%</strong>
            </div>
          </div>
          {f.analysis.linkersUsed.length > 0 && <p className="mt-2 text-sm text-muted">Linkers used: {f.analysis.linkersUsed.map((l) => l.phrase).join(', ')}</p>}
        </Card>
      )}

      {sample && (
        <div>
          {!showSample ? (
            <button type="button" onClick={() => setShowSample(true)} className="text-sm font-semibold text-primary hover:underline">
              Show {sampleLabel.toLowerCase()}
            </button>
          ) : (
            <Callout kind="tip" title={sampleLabel}>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-line">{sample}</p>
                <SpeakButton text={sample} size="sm" label="Listen to the model answer" />
              </div>
            </Callout>
          )}
        </div>
      )}
    </div>
  );
}

export function ScoreLine({ label, value, className }: { label: string; value: number | null; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between text-sm', className)}>
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value === null ? '—' : `${Math.round(value * 100)}%`}</span>
    </div>
  );
}
