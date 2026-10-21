import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Eye, EyeOff, Headphones, Mic, PenLine, Play, Square } from 'lucide-react';
import { api, post } from '../../api/client';
import type { Achievement, DayContent, Kana, ReviewCard, StepContent, StoryDetail } from '../../api/types';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../i18n';
import { requestFurigana } from '../../lib/furigana';
import { createRecognizer, playSource, speakScript, stopAudio, type Recognizer } from '../../lib/speech';
import { Badge, Button, Card, EmptyState, Jp, ProgressRing, Ruby, SpeakButton, Spinner, cx } from '../ui';
import { GrammarBlock, KanjiReadings } from '../cards';
import { KanaCell, KanaDetail, romajiOf } from '../kana';
import { StrokeOrder, WritingCanvas } from '../writing';
import DrillRunner from './DrillRunner';
import FlashDeck from './FlashDeck';
import { MatchGame, Sudoku } from './games';

export interface StepProps {
  step: StepContent;
  content: DayContent;
  onDone: (score?: number) => void;
}

const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

function ContinueButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { L } = useI18n();
  return (
    <Button size="lg" onClick={onClick} className="w-full sm:w-auto sm:self-end">
      {label ?? L('Үргэлжлүүлэх', 'Continue')}
      <ArrowRight className="size-4" />
    </Button>
  );
}

// ───────────── Review (spaced repetition warm-up) ─────────────

export function ReviewStep({ onDone }: StepProps) {
  const { L, lang } = useI18n();
  const { settings } = useAuth();
  const { celebrate } = useToast();
  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ total: 0, good: 0 });
  const again = useRef(new Set<number>());

  useEffect(() => {
    api<{ items: ReviewCard[] }>('/review/due?limit=10').then((r) => setQueue(r.items));
  }, []);

  if (!queue) return <Spinner />;
  const card = queue[0];
  if (!card) {
    if (stats.total === 0) {
      return (
        <EmptyState
          title={L('Одоогоор давтах карт алга', 'Nothing to review right now')}
          body={L('Шинэ үг, ханз сурах тусам энд өдөр бүр давтах карт гарч ирнэ.', 'As you learn words and kanji, cards to review will show up here every day.')}
          action={<ContinueButton onClick={() => onDone(100)} />}
        />
      );
    }
    const pct = Math.round((stats.good / stats.total) * 100);
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <ProgressRing value={pct} size={96}>
          <span className="text-xl font-semibold tabular-nums">{pct}%</span>
        </ProgressRing>
        <p className="text-sm text-muted">{L(`${stats.total} карт давтлаа`, `${stats.total} cards reviewed`)}</p>
        <ContinueButton onClick={() => onDone(pct)} />
      </Card>
    );
  }

  const rate = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    const r = await post<{ achievements: Achievement[] }>('/review', { reviewItemId: card.id, rating });
    celebrate(r.achievements, lang);
    const first = !again.current.has(card.id);
    if (rating === 'again' && first) again.current.add(card.id);
    setStats((s) => (first ? { total: s.total + 1, good: s.good + (rating === 'again' ? 0 : 1) } : s));
    setRevealed(false);
    setQueue((q) => {
      const rest = q!.slice(1);
      return rating === 'again' && first ? [...rest, card] : rest;
    });
  };

  const typeLabel = { vocab: L('Үг', 'Word'), kanji: L('Ханз', 'Kanji'), grammar: L('Дүрэм', 'Grammar'), kana: L('Кана', 'Kana') }[card.itemType];
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted">{L(`${queue.length} карт үлдлээ`, `${queue.length} cards left`)}</p>
      <button onClick={() => setRevealed(true)} className="flex min-h-64 w-full max-w-md flex-col items-center justify-center gap-3 rounded-3xl border-2 border-line bg-surface p-6 text-center">
        <Badge tone="ai">{typeLabel}</Badge>
        <span className={cx('jp font-medium text-ink', card.front.length > 6 ? 'text-3xl' : 'text-6xl')}>{card.front}</span>
        {revealed ? (
          <span className="animate-rise flex flex-col items-center gap-1">
            {card.reading && card.reading !== card.front && <span className="jp text-lg text-ai">{card.reading}</span>}
            <span className="text-lg font-semibold text-ink">{lang === 'en' && card.meaningEn ? card.meaningEn : card.meaning}</span>
            {card.example && card.itemType !== 'kana' && (
              <span className="mt-1 text-sm">
                <Jp text={card.example} className="jp block leading-loose" />
                <span className="text-muted">{card.exampleMn}</span>
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Eye className="size-4" />
            {L('Санаад, дараа нь дарж шалгаарай', 'Recall it, then tap to check')}
          </span>
        )}
      </button>
      {card.speak && <SpeakButton text={card.speak} label={L('Сонсох', 'Listen')} />}
      {revealed ? (
        <div className="grid w-full max-w-md grid-cols-4 gap-2">
          {(['again', 'hard', 'good', 'easy'] as const).map((r) => (
            <Button key={r} variant={r === 'again' ? 'danger' : r === 'good' ? 'success' : 'secondary'} onClick={() => void rate(r)} className="flex-col !gap-0 py-6">
              <span>{{ again: L('Мартсан', 'Again'), hard: L('Хэцүү', 'Hard'), good: L('Санасан', 'Good'), easy: L('Амархан', 'Easy') }[r]}</span>
            </Button>
          ))}
        </div>
      ) : (
        <Button size="lg" className="w-full max-w-md" onClick={() => setRevealed(true)}>
          {L('Хариуг харах', 'Show answer')}
        </Button>
      )}
      {settings.showRomaji && card.romaji && revealed && <p className="text-xs text-muted">{card.romaji}</p>}
    </div>
  );
}

// ───────────── Kana ─────────────

function KanaDrill({ kana, pool, onDone }: { kana: Kana[]; pool: Kana[]; onDone: (score: number) => void }) {
  const { L } = useI18n();
  const items = useMemo(() => shuffle(kana.filter((k) => romajiOf(k))), [kana]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const correct = useRef(0);
  const k = items[i];
  const options = useMemo(() => {
    if (!k) return [];
    const others = shuffle(pool.filter((o) => romajiOf(o) && romajiOf(o) !== romajiOf(k))).slice(0, 3).map(romajiOf);
    return shuffle([romajiOf(k), ...others]);
  }, [k, pool]);
  if (!k) return null;
  const choose = (o: string) => {
    if (picked) return;
    setPicked(o);
    void playSource({ text: k.char });
    if (o === romajiOf(k)) correct.current++;
  };
  const next = () => {
    setPicked(null);
    if (i + 1 >= items.length) onDone(Math.round((correct.current / items.length) * 100));
    else setI(i + 1);
  };
  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-sm text-muted">
        {L('Энэ үсэг юу гэж дуудагдах вэ?', 'How is this read?')} · {i + 1}/{items.length}
      </p>
      <span className="brush grid size-36 place-items-center rounded-3xl bg-shu-soft text-7xl text-shu">{k.char}</span>
      <div className="grid w-full max-w-sm grid-cols-2 gap-2.5">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => choose(o)}
            className={cx(
              'h-14 rounded-xl border-2 text-lg font-semibold transition-colors',
              !picked ? 'border-line bg-surface hover:border-ai' : o === romajiOf(k) ? 'border-matcha bg-matcha-soft text-matcha' : o === picked ? 'border-shu bg-shu-soft text-shu' : 'border-line opacity-50',
            )}
          >
            {o}
          </button>
        ))}
      </div>
      {picked && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-ink-2">
            {k.char} = <b>{romajiOf(k)}</b> · {k.example}（{k.exampleReading}）— {k.exampleMeaning}
          </p>
          <ContinueButton onClick={next} />
        </div>
      )}
    </div>
  );
}

export function KanaStep({ step, content, onDone }: StepProps) {
  const { L } = useI18n();
  const kana = content.kana.filter((k) => step.kanaIds?.includes(k.id)).sort((a, b) => a.order - b.order);
  const [phase, setPhase] = useState<'learn' | 'drill'>('learn');
  const [selected, setSelected] = useState<Kana | null>(null);
  if (phase === 'drill') return <KanaDrill kana={kana} pool={content.kana} onDone={onDone} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{L('Үсэг бүр дээр дарж дуудлага, жишээ үг, зураасны дарааллыг хараарай. Дараа нь богино дасгал хийнэ.', 'Tap each character to hear it and see an example and stroke order. Then a short drill follows.')}</p>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        {kana.map((k) => (
          <KanaCell key={k.id} k={k} onSelect={(x) => {
            setSelected(x);
            void playSource({ text: x.char });
          }} />
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" onClick={() => void speakScript(kana.map((k) => ({ speaker: '', text: k.char })), 0.8)}>
          <Play className="size-4" />
          {L('Бүгдийг сонсох', 'Hear all')}
        </Button>
        <ContinueButton onClick={() => setPhase('drill')} label={L('Дасгал хийх', 'Practice')} />
      </div>
      <KanaDetail k={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ───────────── Words ─────────────

export function WordsStep({ step, content, onDone }: StepProps) {
  const { L } = useI18n();
  const words = content.vocab.filter((v) => step.vocabIds?.includes(v.id));
  const [phase, setPhase] = useState<'list' | 'cards' | 'match'>('list');
  const pairs = useMemo(() => shuffle(words).slice(0, 6).map((v) => ({ id: String(v.id), left: v.word, right: v.meaning })), [words.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'list') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{L(`Өнөөдрийн ${words.length} шинэ үг. Нэг харж, сонсоод флэш карт руу орно.`, `${words.length} new words. Look and listen, then practise with flashcards.`)}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {words.map((v) => (
            <li key={v.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
              <SpeakButton text={v.kana} size="sm" />
              <span className="jp min-w-[5rem] text-xl font-medium leading-loose text-ink">
                <Ruby text={v.word} reading={v.word !== v.kana ? v.kana : undefined} />
              </span>
              <span className="min-w-0 text-sm text-ink-2">{v.meaning}</span>
            </li>
          ))}
        </ul>
        <ContinueButton onClick={() => setPhase('cards')} label={L('Флэш карт эхлэх', 'Start flashcards')} />
      </div>
    );
  }
  if (phase === 'cards') {
    return <FlashDeck cards={words} onFinish={() => (pairs.length >= 3 ? setPhase('match') : onDone())} finishLabel={L('Дараах: үг холбох', 'Next: match')} />;
  }
  return <MatchGame pairs={pairs} onDone={(score) => setTimeout(() => onDone(score), 900)} />;
}

// ───────────── Kanji ─────────────

export function KanjiStep({ step, content, onDone }: StepProps) {
  const { L, lang } = useI18n();
  const kanji = content.kanji.filter((k) => step.kanjiIds?.includes(k.id)).sort((a, b) => a.order - b.order);
  const [i, setI] = useState(0);
  const [tool, setTool] = useState<'none' | 'order' | 'write'>('none');
  const [drill, setDrill] = useState(false);
  if (drill && step.questions?.length) return <DrillRunner questions={step.questions} title={step.title} onComplete={onDone} />;
  const k = kanji[i];
  if (!k) return <ContinueButton onClick={() => onDone()} />;
  const last = i === kanji.length - 1;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {L('Ханз', 'Kanji')} {i + 1}/{kanji.length}
      </p>
      <Card className="flex flex-col gap-5 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <span className="brush grid size-32 place-items-center rounded-3xl bg-shu-soft text-7xl text-shu">{k.char}</span>
          <div className="flex gap-1">
            <Button size="sm" variant={tool === 'order' ? 'primary' : 'secondary'} onClick={() => setTool(tool === 'order' ? 'none' : 'order')}>
              {L('Дараалал', 'Order')}
            </Button>
            <Button size="sm" variant={tool === 'write' ? 'primary' : 'secondary'} onClick={() => setTool(tool === 'write' ? 'none' : 'write')}>
              <PenLine className="size-3.5" />
              {L('Бичих', 'Write')}
            </Button>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-semibold text-ink">{lang === 'en' ? k.meaningEn : k.meaning}</p>
          <div className="mt-2">
            <KanjiReadings k={k} />
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {k.examples.map((ex) => (
              <li key={ex.word} className="flex items-center gap-2 text-sm">
                <SpeakButton text={ex.reading} size="sm" />
                <span className="jp text-lg font-medium leading-loose text-ink">
                  <Ruby text={ex.word} reading={ex.word !== ex.reading ? ex.reading : undefined} />
                </span>
                <span className="text-ink-2">— {ex.meaning}</span>
              </li>
            ))}
          </ul>
          {k.sentences.map((s) => (
            <div key={s.ja} className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 p-3">
              <SpeakButton text={s.ja} size="sm" />
              <div>
                <Jp text={s.ja} className="jp block text-base leading-loose text-ink" furigana />
                <p className="text-sm text-muted">{s.mn}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {tool === 'order' && (
        <Card className="flex justify-center">
          <StrokeOrder key={k.char} char={k.char} autoPlay />
        </Card>
      )}
      {tool === 'write' && (
        <Card className="flex justify-center">
          <WritingCanvas key={k.char} char={k.char} />
        </Card>
      )}
      <div className="flex justify-between gap-2">
        <Button variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
          <ChevronLeft className="size-4" />
          {L('Өмнөх', 'Back')}
        </Button>
        {last ? (
          <ContinueButton onClick={() => (step.questions?.length ? setDrill(true) : onDone())} label={step.questions?.length ? L('Шалгах', 'Check yourself') : undefined} />
        ) : (
          <Button
            onClick={() => {
              setI(i + 1);
              setTool('none');
            }}
          >
            {L('Дараах ханз', 'Next kanji')}
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ───────────── Grammar ─────────────

export function GrammarStep({ step, content, onDone }: StepProps) {
  const { L } = useI18n();
  const grammar = content.grammar.filter((g) => step.grammarIds?.includes(g.id));
  const [drill, setDrill] = useState(false);
  if (drill && step.questions?.length) return <DrillRunner questions={step.questions} title={step.title} onComplete={onDone} />;
  return (
    <div className="flex flex-col gap-4">
      {grammar.map((g) => (
        <GrammarBlock key={g.id} g={{ ...g, lesson: null, _count: { questions: 0 }, state: null }} />
      ))}
      <ContinueButton onClick={() => (step.questions?.length ? setDrill(true) : onDone())} label={step.questions?.length ? L(`Дасгал (${step.questions.length} асуулт)`, `Practice (${step.questions.length})`) : undefined} />
    </div>
  );
}

// ───────────── Sentences, dialogue, reading ─────────────

function SentenceList({ sentences, dialogue }: { sentences: { ja: string; mn: string; speaker?: string }[]; dialogue?: boolean }) {
  const { L } = useI18n();
  const { settings } = useAuth();
  const [showAll, setShowAll] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={() => void speakScript(sentences.map((s) => ({ speaker: s.speaker ?? '', text: s.ja })), settings.speechRate)}>
          <Play className="size-4" />
          {L('Бүгдийг сонсох', 'Play all')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
          {showAll ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {showAll ? L('Орчуулга нуух', 'Hide translations') : L('Орчуулга харах', 'Show translations')}
        </Button>
      </div>
      <p className="text-xs text-muted">{L('Өгүүлбэр дээр дарж орчуулгыг харна.', 'Tap a sentence to see its translation.')}</p>
      <ul className="flex flex-col gap-2.5">
        {sentences.map((s, i) => {
          const open = showAll || shown.has(i);
          const right = dialogue && i % 2 === 1;
          return (
            <li key={i} className={cx('flex items-start gap-2', right && 'flex-row-reverse text-right')}>
              {dialogue && s.speaker && <span className={cx('jp grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold', right ? 'bg-ai-soft text-ai' : 'bg-shu-soft text-shu')}>{s.speaker.slice(0, 2)}</span>}
              <button
                onClick={() => setShown((x) => new Set(x).add(i))}
                className={cx('max-w-[85%] rounded-2xl px-4 py-2.5 text-left', dialogue ? (right ? 'bg-ai-soft' : 'bg-surface-2') : 'w-full max-w-none border border-line bg-surface')}
              >
                <Jp text={s.ja} className="jp block text-lg leading-loose text-ink" />
                {open ? <span className="block text-sm text-muted">{s.mn}</span> : <span className="block text-xs text-muted/70">{L('орчуулга…', 'translation…')}</span>}
              </button>
              <SpeakButton text={s.ja} size="sm" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DialogueStep({ step, onDone }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <SentenceList sentences={step.sentences ?? []} dialogue />
      <ContinueButton onClick={() => onDone()} />
    </div>
  );
}

function StoryReader({ slug }: { slug: string }) {
  const { L } = useI18n();
  const { settings } = useAuth();
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [shown, setShown] = useState<Set<number>>(new Set());
  useEffect(() => {
    api<{ story: StoryDetail }>(`/stories/${slug}`).then((r) => setStory(r.story));
  }, [slug]);
  if (!story) return <Spinner />;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="jp text-xl font-semibold text-ink">{story.titleJa}</p>
          <p className="text-sm text-muted">{story.title}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void speakScript(story.sentences.map((s) => ({ speaker: '', text: s.tokens.map((t) => t.s).join('') })), settings.speechRate)}>
          <Play className="size-4" />
          {L('Сонсох', 'Listen')}
        </Button>
      </div>
      <p className="text-xs text-muted">{L('Өгүүлбэр дээр дарж орчуулгыг харна.', 'Tap a sentence to see its translation.')}</p>
      {story.sentences.map((s, i) => (
        <button key={i} onClick={() => setShown((x) => new Set(x).add(i))} className="rounded-xl px-2 py-1 text-left hover:bg-surface-2">
          <span className="jp block text-lg leading-[2.4] text-ink">
            {s.tokens.map((t, j) => (
              <Ruby key={j} text={t.s} reading={t.r} />
            ))}
          </span>
          {shown.has(i) && <span className="block text-sm text-muted">{s.mn}</span>}
        </button>
      ))}
    </Card>
  );
}

export function ReadingStep({ step, content, onDone }: StepProps) {
  const { L } = useI18n();
  const [drill, setDrill] = useState(false);
  const story = content.stories.find((s) => s.id === step.storyId);
  if (drill && step.questions?.length) return <DrillRunner questions={step.questions} title={step.title} onComplete={onDone} intro={L('Текстээ санаад асуултад хариулаарай.', 'Answer from what you read.')} />;
  return (
    <div className="flex flex-col gap-4">
      {story && <StoryReader slug={story.slug} />}
      {step.passages?.map((p) => (
        <Card key={p}>
          <Jp text={p} className="jp block whitespace-pre-line text-lg leading-[2.4] text-ink" />
        </Card>
      ))}
      {step.sentences && <SentenceList sentences={step.sentences} />}
      <ContinueButton onClick={() => (step.questions?.length ? setDrill(true) : onDone())} label={step.questions?.length ? L('Асуултад хариулах', 'Answer questions') : undefined} />
    </div>
  );
}

// ───────────── Listening ─────────────

export function ListeningStep({ step, content, onDone }: StepProps) {
  const { L } = useI18n();
  const { settings } = useAuth();
  const items = content.listening.filter((l) => step.listeningIds?.includes(l.id));
  const [phase, setPhase] = useState<'listen' | 'questions' | 'transcript'>(items.length ? 'listen' : 'questions');
  const [plays, setPlays] = useState(0);
  const [score, setScore] = useState<number | undefined>();
  useEffect(() => () => stopAudio(), []);

  if (phase === 'questions') {
    if (!step.questions?.length) {
      return <ContinueButton onClick={() => (items.length ? setPhase('transcript') : onDone())} />;
    }
    return (
      <DrillRunner
        questions={step.questions}
        title={step.title}
        intro={items.length ? undefined : L('Өгүүлбэрийг сонсоод (▶) утгыг нь сонгоно уу. Текстийг харахгүйгээр!', 'Listen (▶) and choose the meaning — no text!')}
        onComplete={(pct) => {
          setScore(pct);
          if (items.length) setPhase('transcript');
          else onDone(pct);
        }}
      />
    );
  }
  const play = (i: number) => {
    setPlays((p) => p + 1);
    void speakScript(items[i].script.map((l) => ({ speaker: l.speaker, text: l.ja })), settings.speechRate);
  };
  if (phase === 'transcript') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{L('Сонссон яриагаа текстээр нь шалгаарай.', 'Check what you heard against the transcript.')}</p>
        {items.map((l) => (
          <SentenceList key={l.id} sentences={l.script} dialogue />
        ))}
        <ContinueButton onClick={() => onDone(score)} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {items.map((l, i) => (
        <Card key={l.id} className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Headphones className="mt-0.5 size-5 shrink-0 text-ai" />
            <p className="text-ink-2">{l.context}</p>
          </div>
          <button onClick={() => play(i)} className="flex items-center gap-3 self-center rounded-full bg-ai px-6 py-3 font-semibold text-white shadow-sm">
            <Play className="size-5" />
            {plays ? L('Дахин сонсох', 'Play again') : L('Яриаг сонсох', 'Play the conversation')}
          </button>
          {l.vocabulary.length > 0 && (
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="mb-1.5 text-xs font-semibold text-muted">{L('Туслах үгс', 'Helpful words')}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {l.vocabulary.map((v) => (
                  <span key={v.word}>
                    <Ruby text={v.word} reading={v.word !== v.reading ? v.reading : undefined} /> — {v.meaning}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      ))}
      <ContinueButton onClick={() => setPhase('questions')} label={L('Асуултад хариулах', 'Answer questions')} />
    </div>
  );
}

// ───────────── Speaking ─────────────

const KATA = /[ァ-ヶ]/g;
const toHira = (s: string) => s.replace(KATA, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
async function readingOf(text: string) {
  const segs = await requestFurigana(text);
  return toHira(segs.map((s) => s.rt ?? s.text).join('')).replace(/[^ぁ-んー一-龯]/g, '');
}
function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return Math.round(((2 * dp[a.length][b.length]) / (a.length + b.length)) * 100);
}

function useRecorder() {
  const { L } = useI18n();
  const rec = useRef<Recognizer | null>(null);
  const [supported] = useState(() => createRecognizer() !== null);
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => () => rec.current?.stop(), []);
  const start = () => {
    const r = createRecognizer();
    if (!r) return;
    rec.current = r;
    setText('');
    setError('');
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      finalText = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setText(finalText + interim);
    };
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' ? L('Микрофоны зөвшөөрөл өгнө үү.', 'Please allow the microphone.') : e.error === 'no-speech' ? L('Яриа сонсогдсонгүй.', 'No speech heard.') : e.error);
      setRecording(false);
    };
    r.onend = () => setRecording(false);
    r.start();
    setRecording(true);
  };
  const stop = () => rec.current?.stop();
  return { supported, recording, text, error, start, stop, reset: () => setText('') };
}

function ShadowSentence({ s, onScore }: { s: { ja: string; mn: string }; onScore: (score: number) => void }) {
  const { L } = useI18n();
  const { settings } = useAuth();
  const r = useRecorder();
  const [score, setScore] = useState<number | null>(null);
  useEffect(() => {
    if (r.recording || !r.text) return;
    void Promise.all([readingOf(s.ja), readingOf(r.text)]).then(([a, b]) => {
      const v = similarity(a, b);
      setScore(v);
      onScore(v);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.recording]);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <SpeakButton text={s.ja} />
        <div>
          <Jp text={s.ja} className="jp block text-xl leading-loose text-ink" furigana />
          <p className="text-sm text-muted">{s.mn}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => void playSource({ text: s.ja }, Math.max(0.6, settings.speechRate - 0.2))}>
          <Play className="size-4" />
          {L('Удаан сонсох', 'Slow')}
        </Button>
        {r.supported ? (
          r.recording ? (
            <Button size="sm" variant="danger" onClick={r.stop}>
              <Square className="size-4" />
              {L('Зогсоох', 'Stop')}
            </Button>
          ) : (
            <Button size="sm" onClick={r.start}>
              <Mic className="size-4" />
              {score === null ? L('Давтаж хэлэх', 'Say it') : L('Дахин хэлэх', 'Try again')}
            </Button>
          )
        ) : (
          <Button size="sm" variant={score === null ? 'primary' : 'success'} onClick={() => {
            setScore(100);
            onScore(100);
          }}>
            <Check className="size-4" />
            {L('Чангаар давтан хэллээ', 'I said it aloud')}
          </Button>
        )}
        {score !== null && r.supported && <Badge tone={score >= 80 ? 'matcha' : score >= 50 ? 'yamabuki' : 'shu'}>{score}%</Badge>}
      </div>
      {r.text && (
        <p className="text-sm text-ink-2">
          {L('Таны хэлсэн:', 'You said:')} <span className="jp">{r.text}</span>
        </p>
      )}
      {r.error && <p className="text-sm text-shu">{r.error}</p>}
    </Card>
  );
}

function FreeSpeaking({ prompt, onScore }: { prompt: DayContent['speaking'][number]; onScore: (score: number) => void }) {
  const { L } = useI18n();
  const r = useRecorder();
  const [result, setResult] = useState<{ score: number; matched: { ja: string; mn: string }[]; missing: { ja: string; mn: string }[] } | null>(null);
  const [showModel, setShowModel] = useState(false);
  const check = async () => {
    const res = await post<{ score: number; matched: { ja: string; mn: string }[]; missing: { ja: string; mn: string }[] }>(`/speaking/${prompt.slug}/attempt`, { transcript: r.text });
    setResult(res);
    onScore(res.score);
  };
  return (
    <Card className="flex flex-col gap-3 border-ai/30">
      <Badge tone="ai" className="self-start">{L('Өөрөө ярих', 'Speak freely')}</Badge>
      <Jp text={prompt.prompt} className="jp text-xl leading-loose text-ink" furigana />
      <p className="text-ink-2">{prompt.promptMn}</p>
      <p className="text-sm text-muted">💡 {prompt.hint}</p>
      {r.supported ? (
        <div className="flex flex-wrap gap-2">
          {r.recording ? (
            <Button variant="danger" onClick={r.stop}>
              <Square className="size-4" />
              {L('Зогсоох', 'Stop')}
            </Button>
          ) : (
            <Button onClick={r.start}>
              <Mic className="size-4" />
              {L('Ярьж эхлэх', 'Start speaking')}
            </Button>
          )}
          {r.text && !r.recording && (
            <Button variant="secondary" onClick={() => void check()}>
              {L('Шалгах', 'Check')}
            </Button>
          )}
        </div>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setShowModel(true);
            onScore(100);
          }}
        >
          {L('Чангаар хариуллаа — жишээ хариулт харах', 'I answered aloud — show a model answer')}
        </Button>
      )}
      {r.text && <p className="jp text-sm text-ink-2">「{r.text}」</p>}
      {result && (
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <p className="font-semibold text-ink">{result.score}%</p>
          {result.matched.length > 0 && <p className="text-matcha">✓ {result.matched.map((m) => m.ja).join('、')}</p>}
          {result.missing.length > 0 && <p className="text-shu">＋ {result.missing.map((m) => `${m.ja} (${m.mn})`).join('、')}</p>}
        </div>
      )}
      <button onClick={() => setShowModel((s) => !s)} className="self-start text-sm font-medium text-ai hover:underline">
        {showModel ? L('Жишээг нуух', 'Hide model answer') : L('Жишээ хариулт', 'Model answer')}
      </button>
      {showModel && (
        <div className="flex flex-col gap-1">
          {prompt.expected.map((e) => (
            <p key={e} className="flex items-center gap-2">
              <SpeakButton text={e} size="sm" />
              <Jp text={e} className="jp leading-loose" furigana />
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

export function SpeakingStep({ step, content, onDone }: StepProps) {
  const { L } = useI18n();
  const sentences = step.sentences ?? [];
  const prompt = content.speaking.find((p) => p.id === step.speakingId);
  const [scores, setScores] = useState<Record<string, number>>({});
  const needed = sentences.length + (prompt ? 1 : 0);
  const have = Object.keys(scores).length;
  const avg = have ? Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / have) : 0;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{L('Өгүүлбэр бүрийг сонсоод чангаар давтаж хэлээрэй. Микрофон танихгүй бол өөрөө давтаад тэмдэглэнэ.', 'Listen to each sentence and repeat it aloud. If the microphone is not available, repeat it and tick it off.')}</p>
      {sentences.map((s, i) => (
        <ShadowSentence key={s.ja} s={s} onScore={(v) => setScores((x) => ({ ...x, [`s${i}`]: Math.max(x[`s${i}`] ?? 0, v) }))} />
      ))}
      {prompt && <FreeSpeaking prompt={prompt} onScore={(v) => setScores((x) => ({ ...x, prompt: Math.max(x.prompt ?? 0, v) }))} />}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">
          {have}/{needed} {L('хийсэн', 'done')}
        </span>
        <ContinueButton onClick={() => onDone(avg)} label={have < needed ? L('Дараа нь хийх — үргэлжлүүлэх', 'Continue anyway') : undefined} />
      </div>
    </div>
  );
}

// ───────────── Game ─────────────

export function GameStep({ step, content, onDone }: StepProps) {
  const { L } = useI18n();
  const [result, setResult] = useState<number | null>(null);
  const pairs = useMemo(() => {
    if (step.kanaIds?.length) return content.kana.filter((k) => step.kanaIds!.includes(k.id)).map((k) => ({ id: String(k.id), left: k.char, right: romajiOf(k) }));
    return content.vocab.filter((v) => step.vocabIds?.includes(v.id)).map((v) => ({ id: String(v.id), left: v.word, right: v.meaning }));
  }, [step, content]);
  return (
    <div className="flex flex-col gap-4">
      {step.game === 'sudoku' && step.sudoku ? (
        <Sudoku size={step.sudoku.size} symbols={step.sudoku.symbols} hints={step.sudoku.hints} onSolved={(_s, mistakes) => setResult(Math.max(40, 100 - mistakes * 10))} />
      ) : (
        <MatchGame pairs={pairs} onDone={(score) => setResult(score)} />
      )}
      {result !== null && <ContinueButton onClick={() => onDone(result)} />}
      {result === null && <p className="text-center text-xs text-muted">{L('Тоглоом нь заавал биш — хүссэн үедээ гарч болно.', 'Games are optional — you can leave any time.')}</p>}
    </div>
  );
}

// ───────────── Quiz ─────────────

export function QuizStep({ step, onDone }: StepProps) {
  if (!step.questions?.length) return <ContinueButton onClick={() => onDone()} />;
  return <DrillRunner questions={step.questions} title={step.title} onComplete={onDone} />;
}

export const STEP_COMPONENTS: Record<string, (p: StepProps) => ReactElement> = {
  review: ReviewStep,
  kana: KanaStep,
  words: WordsStep,
  kanji: KanjiStep,
  grammar: GrammarStep,
  dialogue: DialogueStep,
  reading: ReadingStep,
  listening: ListeningStep,
  speaking: SpeakingStep,
  game: GameStep,
  quiz: QuizStep,
};

