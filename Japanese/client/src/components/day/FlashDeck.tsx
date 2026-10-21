import { useEffect, useState } from 'react';
import { ArrowLeftRight, Check, Eye, RotateCcw, Shuffle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../i18n';
import { playSource } from '../../lib/speech';
import { Button, Card, Jp, ProgressBar, Ruby, SpeakButton, cx } from '../ui';

export interface FlashCardData {
  id: number;
  word: string;
  kana: string;
  romaji: string;
  meaning: string;
  example: string;
  exampleMn: string;
}

const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

/**
 * Flip cards: Japanese → meaning (or the reverse). Space flips, 1 = again,
 * 2 = I knew it. Unknown cards can be repeated straight away.
 */
export default function FlashDeck({ cards, onFinish, finishLabel }: { cards: FlashCardData[]; onFinish?: (known: number, unknownIds: number[]) => void; finishLabel?: string }) {
  const { L } = useI18n();
  const { settings } = useAuth();
  const [deck, setDeck] = useState(cards);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [unknown, setUnknown] = useState<Set<number>>(new Set());
  const [reverse, setReverse] = useState(false);
  const [furigana, setFurigana] = useState(true);
  const [done, setDone] = useState(false);
  const card = deck[i];

  const flip = () => {
    setFlipped((f) => {
      if (!f && card && settings.autoplayAudio) void playSource({ text: card.kana }, settings.speechRate);
      return !f;
    });
  };
  const answer = (knew: boolean) => {
    if (!card) return;
    const k = new Set(known);
    const u = new Set(unknown);
    if (knew) {
      k.add(card.id);
      u.delete(card.id);
    } else u.add(card.id);
    setKnown(k);
    setUnknown(u);
    setFlipped(false);
    if (i + 1 >= deck.length) setDone(true);
    else setI(i + 1);
  };
  const restart = (list: FlashCardData[]) => {
    setDeck(list);
    setI(0);
    setFlipped(false);
    setDone(false);
  };

  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === ' ') {
        e.preventDefault();
        flip();
      } else if (flipped && e.key === '1') answer(false);
      else if (flipped && e.key === '2') answer(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (done) {
    const again = cards.filter((c) => unknown.has(c.id));
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-4xl font-semibold tabular-nums text-ink">
          {cards.length - again.length}/{cards.length}
        </p>
        <p className="text-sm text-muted">{L('үгийг мэдэж байна', 'words known')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {again.length > 0 && (
            <Button variant="secondary" onClick={() => restart(again)}>
              <RotateCcw className="size-4" />
              {L(`Мэдэхгүй ${again.length} үгээ давтах`, `Repeat ${again.length} unknown`)}
            </Button>
          )}
          <Button variant="ghost" onClick={() => restart(shuffle(cards))}>
            <Shuffle className="size-4" />
            {L('Холиод дахин', 'Shuffle & restart')}
          </Button>
          {onFinish && (
            <Button onClick={() => onFinish(cards.length - again.length, again.map((c) => c.id))}>
              <Check className="size-4" />
              {finishLabel ?? L('Дуусгах', 'Finish')}
            </Button>
          )}
        </div>
      </Card>
    );
  }
  if (!card) return null;

  const front = reverse ? (
    <span className="text-2xl font-semibold text-ink sm:text-3xl">{card.meaning}</span>
  ) : (
    <span className="jp text-5xl font-medium leading-loose text-ink sm:text-6xl">
      <Ruby text={card.word} reading={card.word !== card.kana ? card.kana : undefined} show={furigana} />
    </span>
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-md items-center gap-3">
        <ProgressBar value={i} max={deck.length} tone="matcha" />
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {i + 1}/{deck.length}
        </span>
      </div>
      <div className="flex w-full max-w-md justify-end gap-1">
        <button onClick={() => setReverse((r) => !r)} className={cx('flex items-center gap-1 rounded-lg px-2 py-1 text-xs', reverse ? 'bg-ai-soft text-ai' : 'text-muted hover:bg-surface-2')} title={L('Чиглэл солих', 'Swap direction')}>
          <ArrowLeftRight className="size-3.5" />
          {reverse ? L('МН → ЯП', 'MN → JA') : L('ЯП → МН', 'JA → MN')}
        </button>
        {!reverse && (
          <button onClick={() => setFurigana((f) => !f)} className={cx('rounded-lg px-2 py-1 text-xs', furigana ? 'bg-ai-soft text-ai' : 'text-muted hover:bg-surface-2')}>
            {L('Фуригана', 'Furigana')}
          </button>
        )}
      </div>
      <button
        onClick={flip}
        className={cx('flex min-h-72 w-full max-w-md flex-col items-center justify-center gap-3 rounded-3xl border-2 bg-surface p-6 text-center shadow-sm transition-colors', flipped ? 'border-ai/40' : 'border-line hover:border-ink-2/30')}
        aria-label={L('Картыг эргүүлэх', 'Flip card')}
      >
        {front}
        {flipped ? (
          <span className="animate-rise flex flex-col items-center gap-1.5">
            {reverse ? (
              <span className="jp text-4xl font-medium leading-loose text-ink">
                <Ruby text={card.word} reading={card.word !== card.kana ? card.kana : undefined} show />
              </span>
            ) : (
              <span className="text-xl font-semibold text-ink">{card.meaning}</span>
            )}
            <span className="text-sm text-muted">
              {card.kana !== card.word && <span className="jp">{card.kana} · </span>}
              {card.romaji}
            </span>
            {card.example && (
              <span className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-left">
                <Jp text={card.example} className="jp block text-base leading-loose text-ink" />
                <span className="block text-xs text-muted">{card.exampleMn}</span>
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Eye className="size-4" />
            {L('Дарж хариуг харах (Space)', 'Tap to reveal (Space)')}
          </span>
        )}
      </button>
      <div className="flex items-center gap-2">
        <SpeakButton text={card.kana} label={L('Үг', 'Word')} />
        {card.example && <SpeakButton text={card.example} label={L('Жишээ', 'Example')} />}
      </div>
      {flipped ? (
        <div className="grid w-full max-w-md grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => answer(false)}>
            {L('Дахин', 'Again')} <span className="text-xs text-muted">1</span>
          </Button>
          <Button variant="success" size="lg" onClick={() => answer(true)}>
            {L('Мэдэж байна', 'I knew it')} <span className="text-xs opacity-70">2</span>
          </Button>
        </div>
      ) : (
        <Button size="lg" onClick={flip} className="w-full max-w-md">
          {L('Хариуг харах', 'Show answer')}
        </Button>
      )}
    </div>
  );
}
