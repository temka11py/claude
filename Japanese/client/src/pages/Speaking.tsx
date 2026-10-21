import { useEffect, useRef, useState } from 'react';
import { Check, Eye, EyeOff, Info, Lightbulb, Mic, Square, X } from 'lucide-react';
import { post } from '../api/client';
import type { Achievement } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../i18n';
import { createRecognizer, type Recognizer } from '../lib/speech';
import { Badge, Button, Card, ErrorState, Jp, PageHeader, ProgressRing, SpeakButton, Spinner, cx } from '../components/ui';

interface Keyword {
  ja: string;
  alts?: string[];
  mn: string;
}

interface Prompt {
  id: number;
  slug: string;
  title: string;
  prompt: string;
  promptMn: string;
  hint: string;
  expected: string[];
  keywords: Keyword[];
  bestScore: number | null;
}

interface AttemptResult {
  score: number;
  matched: Keyword[];
  missing: Keyword[];
  achievements: Achievement[];
}

function feedbackText(score: number, L: (mn: string, en: string) => string) {
  if (score >= 80) return L('Маш сайн! Гол үгс бүгд сонсогдлоо.', 'Great! All the key words were heard.');
  if (score >= 50) return L('Сайн байна. Дутуу үгсийг нэмж дахин хэлж үзээрэй.', 'Good. Try again and include the missing words.');
  return L('Жишээ өгүүлбэрийг сонсоод, удаан, тод дуудаж дахин оролдоорой.', 'Listen to the model, then try again slowly and clearly.');
}

export default function Speaking() {
  const { L, lang } = useI18n();
  const { celebrate } = useToast();
  const { data, error, loading, reload, setData } = useApi<{ prompts: Prompt[] }>('/speaking');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [showModel, setShowModel] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [recError, setRecError] = useState('');
  const [checking, setChecking] = useState(false);
  const recognizer = useRef<Recognizer | null>(null);
  const interimRef = useRef('');
  const [supported] = useState(() => createRecognizer() !== null);

  useEffect(() => () => recognizer.current?.stop(), []);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const active = data.prompts.find((p) => p.slug === activeSlug) ?? data.prompts[0];

  const select = (slug: string) => {
    recognizer.current?.stop();
    setActiveSlug(slug);
    setTranscript('');
    setInterim('');
    setResult(null);
    setShowModel(false);
    setRecError('');
  };

  const start = () => {
    const r = createRecognizer();
    if (!r) return;
    recognizer.current = r;
    setTranscript('');
    setInterim('');
    setResult(null);
    setRecError('');
    r.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      setTranscript(finalText);
      setInterim(interimText);
      interimRef.current = interimText;
    };
    r.onerror = (e) => {
      setRecError(
        e.error === 'not-allowed'
          ? L('Микрофоны зөвшөөрөл өгөгдөөгүй байна. Хөтчийн тохиргооноос зөвшөөрнө үү.', 'Microphone permission was denied. Allow it in your browser settings.')
          : e.error === 'no-speech'
            ? L('Яриа сонсогдсонгүй. Дахин оролдоно уу.', 'No speech was detected. Please try again.')
            : L('Яриа таних үед алдаа гарлаа.', 'Speech recognition error.') + ` (${e.error})`,
      );
      setRecording(false);
    };
    r.onend = () => {
      setRecording(false);
      const pending = interimRef.current;
      if (pending) setTranscript((t) => t + pending);
      setInterim('');
    };
    r.start();
    setRecording(true);
  };

  const stop = () => recognizer.current?.stop();

  const check = async () => {
    const text = (transcript + interim).trim();
    if (!text) return;
    setChecking(true);
    try {
      const r = await post<AttemptResult>(`/speaking/${active.slug}/attempt`, { transcript: text });
      setResult(r);
      celebrate(r.achievements, lang);
      setData((d) => (d ? { prompts: d.prompts.map((p) => (p.slug === active.slug ? { ...p, bestScore: Math.max(p.bestScore ?? 0, r.score) } : p)) } : d));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <PageHeader titleJa="はなす" title={L('Ярих дасгал', 'Speaking')} subtitle={L('Даалгаврыг уншаад япон хэлээр чангаар хэлээрэй. Систем таны яриаг бичвэр болгож, гол үгсийг шалгана.', 'Read the task and answer aloud in Japanese. Your speech is transcribed and key words are checked.')} />
      <p className="mb-5 flex items-start gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
        <Info className="mt-0.5 size-4 shrink-0 text-muted" />
        {L('Анхаар: энэ нь зөвхөн түлхүүр үг таарч буйг шалгах энгийн тусламж бөгөөд мэргэжлийн дуудлагын үнэлгээ биш.', 'Note: this is a simple key-word check, not a professional pronunciation assessment.')}
      </p>
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin lg:flex-col lg:overflow-visible" aria-label={L('Даалгаврууд', 'Tasks')}>
          {data.prompts.map((p, i) => (
            <button key={p.slug} onClick={() => select(p.slug)} className={cx('flex min-w-48 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors lg:min-w-0', p.slug === active.slug ? 'border-shu bg-shu-soft' : 'border-line bg-surface hover:bg-surface-2')}>
              <span className="text-xs font-semibold tabular-nums text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.title}</span>
              {p.bestScore !== null && <Badge tone={p.bestScore >= 80 ? 'matcha' : 'yamabuki'}>{p.bestScore}%</Badge>}
            </button>
          ))}
        </nav>

        <Card className="flex flex-col gap-5 p-5 sm:p-7">
          <div>
            <div className="flex items-start gap-2">
              <Jp text={active.prompt} className="jp block text-2xl font-medium leading-loose text-ink sm:text-3xl" />
              <SpeakButton text={active.prompt} />
            </div>
            <p className="mt-1 text-ink-2">{active.promptMn}</p>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-yamabuki" />
              {active.hint}
            </p>
          </div>

          <div>
            <button onClick={() => setShowModel((s) => !s)} className="flex items-center gap-1.5 text-sm font-medium text-ai hover:underline">
              {showModel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {showModel ? L('Жишээ хариултыг нуух', 'Hide model answer') : L('Жишээ хариулт харах', 'Show model answer')}
            </button>
            {showModel && (
              <ul className="animate-rise mt-2 flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3">
                {active.expected.map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <SpeakButton text={s} size="sm" />
                    <Jp text={s} className="jp leading-loose text-ink" />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {supported ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <button
                onClick={recording ? stop : start}
                className={cx('grid size-20 place-items-center rounded-full text-white shadow-md transition-transform active:scale-95', recording ? 'animate-pulse bg-shu-strong' : 'bg-shu')}
                aria-label={recording ? L('Бичлэг зогсоох', 'Stop recording') : L('Бичлэг эхлүүлэх', 'Start recording')}
              >
                {recording ? <Square className="size-7 fill-current" /> : <Mic className="size-8" />}
              </button>
              <p className="text-sm text-muted">{recording ? L('Сонсож байна… Дуусаад зогсоох товчийг дарна уу.', 'Listening… press stop when you finish.') : L('Бичлэг эхлүүлэх', 'Start recording')}</p>
            </div>
          ) : (
            <p className="rounded-xl bg-yamabuki-soft px-4 py-3 text-sm text-yamabuki">
              {L('Таны хөтөч яриа таних (Web Speech API) боломжгүй байна. Chrome эсвэл Edge ашиглана уу. Одоохондоо хэлсэн зүйлээ доор бичиж шалгуулж болно.', 'Your browser does not support speech recognition. Use Chrome or Edge — or type what you said below to check it.')}
            </p>
          )}
          {recError && <p className="rounded-xl bg-shu-soft px-4 py-2 text-sm text-shu">{recError}</p>}

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">{L('Танигдсан бичвэр', 'Recognised text')}</p>
            <textarea
              value={transcript + interim}
              onChange={(e) => {
                setTranscript(e.target.value);
                setInterim('');
              }}
              rows={3}
              lang="ja"
              placeholder={supported ? L('Таны яриа энд гарна…', 'Your speech will appear here…') : 'わたしは…'}
              className="jp w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-lg outline-none focus:border-shu"
            />
          </div>
          <Button size="lg" onClick={check} loading={checking} disabled={!(transcript + interim).trim() || recording}>
            {L('Шалгах', 'Check')}
          </Button>

          {result && (
            <div className="animate-rise flex flex-col gap-4 rounded-2xl border border-line p-4 sm:flex-row sm:items-center">
              <ProgressRing value={result.score} size={84}>
                <span className="text-lg font-semibold tabular-nums text-ink">{result.score}%</span>
              </ProgressRing>
              <div className="flex-1">
                <p className="font-medium text-ink">{feedbackText(result.score, L)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.matched.map((k) => (
                    <Badge key={k.ja} tone="matcha">
                      <Check className="size-3" />
                      <span className="jp">{k.ja}</span> · {k.mn}
                    </Badge>
                  ))}
                  {result.missing.map((k) => (
                    <Badge key={k.ja} tone="shu">
                      <X className="size-3" />
                      <span className="jp">{k.ja}</span> · {k.mn}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
