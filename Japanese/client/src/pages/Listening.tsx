import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, CheckCircle2, Headphones, Pause, Play, RotateCcw } from 'lucide-react';
import type { Question, ScriptLine } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { playSource, stopAudio, ttsSupported } from '../lib/speech';
import { Badge, Card, ErrorState, Jp, PageHeader, SpeakButton, Spinner, cx } from '../components/ui';
import QuizEngine from '../components/quiz/QuizEngine';
import { submitQuiz } from '../components/quiz/runners';

const TYPE_LABEL: Record<string, [string, string]> = {
  numbers: ['Тоо, цаг', 'Numbers & time'],
  task: ['Даалгаварт суурилсан', 'Task-based'],
  point: ['Гол санаа', 'Key point'],
  utterance: ['Хэллэг сонгох', 'Utterances'],
  response: ['Хурдан хариулт', 'Quick response'],
};

interface ExerciseListItem {
  id: number;
  slug: string;
  title: string;
  type: string;
  context: string;
  quizId: number | null;
  questionCount: number;
  bestScore: number | null;
}

export function ListeningList() {
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<{ exercises: ExerciseListItem[] }>('/listening');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  return (
    <div>
      <PageHeader
        titleJa="ちょうかい"
        title={L('Сонсгол', 'Listening')}
        subtitle={L('Яриаг сонсоод асуултад хариулна. Бичвэр (транскрипт) нь хариулт илгээсний дараа л харагдана.', 'Listen and answer. The transcript appears only after you submit.')}
      />
      {!ttsSupported && <p className="mb-4 rounded-xl bg-yamabuki-soft p-3 text-sm text-yamabuki">{L('Таны хөтөч дуу гаргах (Speech Synthesis) боломжгүй. Chrome, Edge, Safari ашиглана уу.', 'Your browser does not support speech synthesis. Please use Chrome, Edge or Safari.')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {data.exercises.map((e, i) => (
          <Link key={e.id} to={`/listening/${e.slug}`} className="flex gap-4 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-shu">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ai-soft text-ai">
              <Headphones className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-ink">
                  <span className="mr-1.5 tabular-nums text-muted">{i + 1}.</span>
                  {e.title}
                </p>
                {e.bestScore !== null && (
                  <Badge tone={e.bestScore >= 60 ? 'matcha' : 'yamabuki'}>
                    <CheckCircle2 className="size-3" />
                    {e.bestScore}%
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted">{e.context}</p>
              <p className="mt-2 text-xs text-muted">
                {L(...(TYPE_LABEL[e.type] ?? [e.type, e.type]))} · {e.questionCount} {L('асуулт', 'questions')}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

interface ExerciseDetail {
  id: number;
  slug: string;
  title: string;
  type: string;
  context: string;
  audioUrl: string | null;
  script: ScriptLine[];
  vocabulary: { word: string; reading: string; meaning: string }[];
  grammarNote: string;
  quiz: { id: number; title: string; questions: Question[] } | null;
}

function Player({ script, audioUrl }: { script: ScriptLine[]; audioUrl: string | null }) {
  const { settings } = useAuth();
  const { L } = useI18n();
  const [rate, setRate] = useState(settings.speechRate);
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stopAudio(), []);
  const text = script.map((l) => `${l.speaker}：${l.ja}`).join('\n');
  const play = async () => {
    if (playing) {
      stopAudio();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    setPlays((p) => p + 1);
    await playSource({ audioUrl, text }, rate);
    setPlaying(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-ai-soft p-4">
      <button onClick={play} className="grid size-14 place-items-center rounded-full bg-ai text-white shadow-sm" aria-label={playing ? L('Зогсоох', 'Stop') : L('Тоглуулах', 'Play')}>
        {playing ? <Pause className="size-6" /> : plays ? <RotateCcw className="size-6" /> : <Play className="ml-1 size-6" />}
      </button>
      <div className="flex-1">
        <p className="font-semibold text-ai">{playing ? L('Тоглуулж байна…', 'Playing…') : L('Яриаг сонсох', 'Play the conversation')}</p>
        <p className="text-xs text-muted">{L(`${plays} удаа сонссон · ${script.length} мөр`, `Played ${plays}× · ${script.length} lines`)}</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        {L('Хурд', 'Speed')}
        <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm">
          {[0.6, 0.75, 0.9, 1, 1.15].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ListeningExercise() {
  const { slug = '' } = useParams();
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<{ exercise: ExerciseDetail }>(`/listening/${slug}`);
  const [run, setRun] = useState(0);
  const [showMn, setShowMn] = useState(false);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.status === 404 ? L('Дасгал олдсонгүй', 'Exercise not found') : error.message} onRetry={reload} />;
  if (!data) return null;
  const ex = data.exercise;
  const perQuestionAudio = ex.type === 'utterance' || ex.type === 'response';

  const transcript = (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-ink">{L('Бичвэр (транскрипт)', 'Transcript')}</h3>
        <button onClick={() => setShowMn((s) => !s)} className="text-sm font-medium text-ai hover:underline">
          {showMn ? L('Орчуулгыг нуух', 'Hide translation') : L('Орчуулга харах', 'Show translation')}
        </button>
      </div>
      <ul className="flex flex-col gap-2.5">
        {ex.script.map((line, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="jp mt-1 w-16 shrink-0 text-xs font-semibold text-muted">{line.speaker}</span>
            <div className="min-w-0 flex-1">
              <Jp text={line.ja} className="jp block leading-loose text-ink" />
              {showMn && <p className="text-sm text-muted">{line.mn}</p>}
            </div>
            <SpeakButton text={line.ja} size="sm" />
          </li>
        ))}
      </ul>
      {ex.vocabulary.length > 0 && (
        <>
          <h4 className="mb-2 mt-5 text-sm font-semibold text-ink">{L('Үгс', 'Vocabulary')}</h4>
          <div className="flex flex-wrap gap-2">
            {ex.vocabulary.map((v) => (
              <span key={v.word} className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
                <span className="jp font-medium">{v.word}</span> <span className="jp text-muted">{v.reading}</span> — {v.meaning}
              </span>
            ))}
          </div>
        </>
      )}
      <h4 className="mb-1 mt-5 text-sm font-semibold text-ink">{L('Дүрмийн тайлбар', 'Grammar note')}</h4>
      <p className="text-sm text-ink-2">{ex.grammarNote}</p>
    </Card>
  );

  return (
    <div>
      <Link to="/listening" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {L('Бүх сонсгол', 'All listening')}
      </Link>
      <header className="mb-4">
        <Badge tone="ai" className="mb-2">
          {L(...(TYPE_LABEL[ex.type] ?? [ex.type, ex.type]))}
        </Badge>
        <h1 className="text-2xl font-semibold text-ink">{ex.title}</h1>
        <p className="mt-1 text-sm text-muted">{ex.context}</p>
      </header>
      <div className="flex flex-col gap-4">
        {!perQuestionAudio && <Player script={ex.script} audioUrl={ex.audioUrl} />}
        {ex.quiz && (
          <div className={cx(perQuestionAudio && 'mt-1')}>
            <QuizEngine
              key={run}
              questions={ex.quiz.questions}
              showAudio={perQuestionAudio}
              submit={(answers, d) => submitQuiz(ex.quiz!.id, answers, d)}
              onRetry={() => setRun((r) => r + 1)}
              resultExtra={() => transcript}
            />
          </div>
        )}
      </div>
    </div>
  );
}
