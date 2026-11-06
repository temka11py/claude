import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import type { AnswerValue } from '@shared/scoring';
import { wordCount } from '@shared/text';
import type { ListeningMaterial, ReadingMaterial } from '@shared/contentSchema';
import type { RecordingResult } from '../lib/speech';
import type { Paper } from '../lib/types';
import { QuestionView, type AnyQuestion } from './QuestionView';
import { ListeningPlayer } from './activities/Listening';
import { ReadingText } from './activities/Reading';
import { RecorderPanel } from './activities/Speaking';
import { Badge, Button, Callout, Card, Mn, SkillBadge, Textarea, clsx } from './ui';

export interface PaperSubmission {
  answers: Record<string, AnswerValue>;
  writing: { text: string } | null;
  speaking: { transcript: string | null; durationSec: number | null; selfRating: number | null } | null;
  minutes: number;
}

interface Saved {
  answers: Record<string, AnswerValue>;
  writing: string;
  speakingTranscript: string;
  speakingDuration: number | null;
  selfChecks: boolean[];
}

const SELF = ['I spoke for most of the time', 'I answered the task fully', 'I used a range of words', 'I spoke clearly'];

export function PaperRunner({ paper, onSubmit, submitting, optionalSections = [] }: { paper: Paper; onSubmit: (s: PaperSubmission) => void; submitting: boolean; optionalSections?: string[] }) {
  const key = `fp-paper:${paper.attemptId}`;
  const initial = useMemo<Saved>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as Saved;
    } catch {
      /* ignore */
    }
    return { answers: {}, writing: '', speakingTranscript: '', speakingDuration: null, selfChecks: SELF.map(() => false) };
  }, [key]);
  const [state, setState] = useState<Saved>(initial);
  const [section, setSection] = useState(0);
  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [started] = useState(Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [key, state]);

  const sections = paper.sections;
  const s = sections[section];
  const totalQuestions = sections.reduce((a, x) => a + x.questions.length, 0);
  const answered = Object.values(state.answers).filter((v) => v !== null && v !== '' && !(Array.isArray(v) && v.every((x) => !x))).length;

  function setAnswer(id: string, v: AnswerValue) {
    setState((prev) => ({ ...prev, answers: { ...prev.answers, [id]: v } }));
  }

  function submit() {
    const hasWriting = sections.some((x) => x.skill === 'writing' && x.task);
    const hasSpeaking = sections.some((x) => x.skill === 'speaking' && x.task);
    const speakingDone = !!(state.speakingTranscript.trim() || state.selfChecks.some(Boolean) || state.speakingDuration);
    onSubmit({
      answers: state.answers,
      writing: hasWriting && state.writing.trim() ? { text: state.writing } : null,
      speaking:
        hasSpeaking && speakingDone
          ? { transcript: state.speakingTranscript.trim() || null, durationSec: state.speakingDuration, selfRating: state.selfChecks.filter(Boolean).length / SELF.length }
          : null,
      minutes: Math.min(240, (Date.now() - started) / 60000),
    });
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  const sectionBody = () => {
    if (s.skill === 'writing' && s.task) {
      const t = s.task as { prompt: string; promptMn?: string; minWords: number; maxWords: number; points?: string[] };
      const wc = wordCount(state.writing);
      return (
        <div className="space-y-3">
          <Card>
            <p className="text-[17px] font-medium">{t.prompt}</p>
            <Mn>{t.promptMn}</Mn>
            {t.points && t.points.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-[15px]">
                {t.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </Card>
          <Textarea rows={12} value={state.writing} onChange={(e) => setState({ ...state, writing: e.target.value })} aria-label="Your answer" placeholder="Write your answer…" />
          <div className={clsx('text-xs font-semibold', wc >= t.minWords ? 'text-success' : 'text-muted')}>
            {wc} words (target {t.minWords}–{t.maxWords})
          </div>
        </div>
      );
    }
    if (s.skill === 'speaking' && s.task) {
      const t = s.task as { prompt: string; promptMn?: string; speakSeconds: number; points?: string[] };
      return (
        <div className="space-y-3">
          {optionalSections.includes('speaking') && <Callout kind="info">This section is optional. Skip it if you can't record right now.</Callout>}
          <Card>
            <p className="text-[17px] font-medium">{t.prompt}</p>
            <Mn>{t.promptMn}</Mn>
            {t.points && t.points.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-[15px]">
                {t.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </Card>
          <RecorderPanel
            targetSeconds={t.speakSeconds}
            onDone={(r) => {
              setRecording(r);
              setState((prev) => ({ ...prev, speakingTranscript: r.transcript, speakingDuration: Math.round(r.durationSec) }));
            }}
          />
          {recording?.url && <audio controls src={recording.url} className="w-full" />}
          {(state.speakingDuration || state.speakingTranscript) && (
            <div>
              <label htmlFor="sp-tr" className="text-sm font-semibold">
                Transcript (edit recognition errors if needed)
              </label>
              <Textarea id="sp-tr" rows={3} value={state.speakingTranscript} onChange={(e) => setState({ ...state, speakingTranscript: e.target.value })} />
            </div>
          )}
          <fieldset className="rounded-xl bg-surface p-3 ring-1 ring-border">
            <legend className="px-1 text-sm font-semibold">Self-check (used if there is no transcript)</legend>
            {SELF.map((c, i) => (
              <label key={c} className="mt-1 flex items-center gap-2 text-[15px]">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={state.selfChecks[i]} onChange={(e) => setState({ ...state, selfChecks: state.selfChecks.map((x, j) => (j === i ? e.target.checked : x)) })} />
                {c}
              </label>
            ))}
          </fieldset>
        </div>
      );
    }
    return (
      <div className={clsx(s.materials?.length ? 'grid gap-4 lg:grid-cols-2 lg:items-start' : '')}>
        {s.materials && s.materials.length > 0 && (
          <div className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            {s.materials.map((m, i) =>
              s.skill === 'reading' ? (
                <ReadingText key={i} material={m as Omit<ReadingMaterial, 'questions'>} />
              ) : (
                <div key={i}>
                  <Card className="mb-2">
                    <div className="font-semibold">{(m as unknown as ListeningMaterial).title}</div>
                    <p className="text-sm text-muted">{(m as unknown as ListeningMaterial).context}</p>
                  </Card>
                  <ListeningPlayer material={m as unknown as ListeningMaterial} baseRate={(m as { rate?: number }).rate ?? 1} allowTranscript={false} maxPlays={2} />
                </div>
              ),
            )}
          </div>
        )}
        <ol className="space-y-4">
          {s.questions.map((qq, i) => (
            <li key={qq.id}>
              <Card>
                <div className="mb-2 text-xs font-semibold text-muted">Question {i + 1}</div>
                <QuestionView question={qq as unknown as AnyQuestion} mode="test" value={state.answers[qq.id] ?? ((qq as Record<string, unknown>).type === 'correct' ? ((qq as Record<string, unknown>).sentence as string | undefined) ?? null : null)} onChange={(v) => setAnswer(qq.id, v)} />
              </Card>
            </li>
          ))}
        </ol>
      </div>
    );
  };

  return (
    <div>
      <nav className="mb-4 flex gap-1 overflow-x-auto" aria-label="Test sections">
        {sections.map((x, i) => {
          const done = x.questions.length ? x.questions.every((qq) => state.answers[qq.id] != null && state.answers[qq.id] !== '') : x.skill === 'writing' ? !!state.writing.trim() : !!(state.speakingDuration || state.selfChecks.some(Boolean));
          return (
            <button key={x.skill} type="button" onClick={() => setSection(i)} className={clsx('whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold', i === section ? 'bg-primary text-on-primary' : done ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted')}>
              {x.title}
            </button>
          );
        })}
      </nav>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SkillBadge skill={s.skill} />
        {paper.kind !== 'placement' && <Badge>{s.weight}% of the score</Badge>}
        <span className="text-sm text-muted">{s.instructions}</span>
      </div>
      <div key={section} className="animate-fade-in">
        {sectionBody()}
      </div>
      <div className="mt-6 flex gap-2">
        <Button variant="secondary" size="lg" disabled={section === 0} onClick={() => setSection(section - 1)} icon={<ArrowLeft className="size-5" />}>
          Back
        </Button>
        {section < sections.length - 1 ? (
          <Button className="flex-1" size="lg" onClick={() => setSection(section + 1)} icon={<ArrowRight className="size-5" />}>
            Next section
          </Button>
        ) : (
          <Button className="flex-1" size="lg" onClick={() => setConfirm(true)} icon={<Send className="size-5" />}>
            Finish
          </Button>
        )}
      </div>
      {confirm && (
        <div className="mt-4">
          <Callout kind={answered < totalQuestions ? 'warning' : 'info'} title="Submit your answers?">
            You answered {answered} of {totalQuestions} questions{sections.some((x) => x.skill === 'writing') && !state.writing.trim() ? ', and the writing task is empty' : ''}. You can't change answers after submitting.
            <div className="mt-3 flex gap-2">
              <Button loading={submitting} onClick={submit}>
                Submit
              </Button>
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Keep working
              </Button>
            </div>
          </Callout>
        </div>
      )}
    </div>
  );
}
