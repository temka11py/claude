import { useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Eye, Plus, Shuffle, Star } from 'lucide-react';
import { post } from '../api/client';
import type { Achievement, Grammar, Kanji, Vocab } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../i18n';
import { posLabel } from '../lib/labels';
import { Badge, Button, Card, Ruby, SpeakButton, StateBadge, cx } from './ui';

// ───────────── item actions (favorite / known / review) ─────────────

export function useItemActions() {
  const { notify, celebrate } = useToast();
  const { L, lang } = useI18n();
  return {
    toggleFavorite: async (itemType: 'vocab' | 'kanji', itemId: number) => {
      const r = await post<{ favorite: boolean }>('/favorites/toggle', { itemType, itemId });
      return r.favorite;
    },
    markKnown: async (itemType: 'vocab' | 'kanji' | 'grammar' | 'kana', itemId: number) => {
      const r = await post<{ state: string; achievements: Achievement[] }>('/review/known', { itemType, itemId });
      notify({ kind: 'info', title: L('Мэддэг гэж тэмдэглэлээ', 'Marked as known'), body: L('7 хоногийн дараа давтана.', 'You will review it in 7 days.') });
      celebrate(r.achievements, lang);
      return r.state;
    },
    addToReview: async (itemType: 'vocab' | 'kanji' | 'grammar' | 'kana', itemId: number) => {
      const r = await post<{ state: string; added: boolean }>('/review/add', { itemType, itemId });
      notify({ kind: 'info', title: r.added ? L('Давталтад нэмлээ', 'Added to review') : L('Одоо давтахаар тэмдэглэлээ', 'Scheduled for review now') });
      return r.state;
    },
  };
}

function IconAction({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx('grid size-8 place-items-center rounded-full transition-colors hover:bg-surface-2', active ? 'text-shu' : 'text-muted')}
    >
      {children}
    </button>
  );
}

// ───────────── vocabulary ─────────────

export function VocabItem({ v, onChange, expanded: initiallyExpanded = false }: { v: Vocab; onChange?: (v: Vocab) => void; expanded?: boolean }) {
  const { settings } = useAuth();
  const { L, lang } = useI18n();
  const actions = useItemActions();
  const [open, setOpen] = useState(initiallyExpanded);
  const [item, setItem] = useState(v);
  const update = (patch: Partial<Vocab>) => {
    const next = { ...item, ...patch };
    setItem(next);
    onChange?.(next);
  };
  const meaning = lang === 'en' && item.meaningEn ? item.meaningEn : item.meaning;
  return (
    <li className="rounded-2xl border border-line bg-surface">
      <div role="button" tabIndex={0} onClick={() => setOpen((o) => !o)} onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)} className="flex cursor-pointer items-center gap-3 p-3.5 sm:gap-4">
        <div className="min-w-[5.5rem] sm:min-w-[8rem]">
          <p className="text-xl font-medium text-ink sm:text-2xl">
            <Ruby text={item.word} reading={item.word !== item.kana ? item.kana : undefined} />
          </p>
          {settings.showRomaji && <p className="text-xs text-muted">{item.romaji}</p>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-ink sm:text-base">{meaning}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge>{posLabel(item.partOfSpeech, lang)}</Badge>
            <StateBadge state={item.state} />
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <SpeakButton text={item.kana} size="sm" />
          <IconAction label={L('Дуртай', 'Favorite')} active={item.favorite} onClick={async () => update({ favorite: await actions.toggleFavorite('vocab', item.id) })}>
            <Star className={cx('size-4', item.favorite && 'fill-current')} />
          </IconAction>
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 pb-4 pt-3">
          <div className="flex items-start gap-2">
            <SpeakButton text={item.example} size="sm" />
            <div>
              <p className="jp text-base text-ink">{item.example}</p>
              <p className="text-sm text-muted">{item.exampleMn}</p>
            </div>
          </div>
          {item.kanji && item.kanji.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-xs text-muted">{L('Холбоотой ханз:', 'Related kanji:')}</span>
              {item.kanji.map((k) => (
                <Link key={k.id} to={`/kanji/${encodeURIComponent(k.char)}`} className="rounded-lg bg-surface-2 px-2 py-1 hover:bg-ai-soft">
                  <span className="jp font-medium">{k.char}</span> <span className="text-xs text-muted">{k.meaning}</span>
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={async () => update({ state: await actions.markKnown('vocab', item.id) })}>
              <Check className="size-4" />
              {L('Мэднэ', 'Known')}
            </Button>
            <Button size="sm" variant="secondary" onClick={async () => update({ state: await actions.addToReview('vocab', item.id) })}>
              <Plus className="size-4" />
              {L('Давталтад нэмэх', 'Add to review')}
            </Button>
            {item.lesson && (
              <Link to={`/lessons/${item.lesson.id}`} className="self-center text-xs text-ai hover:underline">
                {item.lesson.title}
              </Link>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// ───────────── kanji ─────────────

export function KanjiTile({ k }: { k: Kanji }) {
  const { lang } = useI18n();
  return (
    <Link to={`/kanji/${encodeURIComponent(k.char)}`} className="group relative flex flex-col items-center gap-1 rounded-2xl border border-line bg-surface p-3 text-center transition-colors hover:border-shu">
      {k.state && <span className={cx('absolute right-2 top-2 size-2 rounded-full', k.state === 'mastered' ? 'bg-matcha' : k.state === 'review' ? 'bg-ai' : 'bg-yamabuki')} />}
      <span className="brush text-4xl text-ink group-hover:text-shu">{k.char}</span>
      <span className="line-clamp-1 text-xs text-muted">{lang === 'en' ? k.meaningEn : k.meaning}</span>
    </Link>
  );
}

export function KanjiReadings({ k }: { k: Pick<Kanji, 'onyomi' | 'kunyomi' | 'strokes'> }) {
  const { L } = useI18n();
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted">{L('Он (音)', 'On (音)')}</dt>
      <dd className="jp text-ink">{k.onyomi}</dd>
      <dt className="text-muted">{L('Кун (訓)', 'Kun (訓)')}</dt>
      <dd className="jp text-ink">{k.kunyomi}</dd>
      <dt className="text-muted">{L('Зураас', 'Strokes')}</dt>
      <dd className="text-ink">{k.strokes}</dd>
    </dl>
  );
}

// ───────────── grammar ─────────────

export function GrammarBlock({ g, compact }: { g: Grammar; compact?: boolean }) {
  const { L } = useI18n();
  return (
    <Card as="article" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="jp text-2xl font-semibold text-ink">{g.title}</h3>
          <p className="mt-0.5 text-sm font-medium text-shu">{g.meaning}</p>
        </div>
        {compact && (
          <Link to={`/grammar/${g.slug}`} className="text-sm font-medium text-ai hover:underline">
            {L('Дэлгэрэнгүй', 'Details')} →
          </Link>
        )}
      </div>
      <div className="jp rounded-xl bg-ai-soft px-4 py-3 text-base font-medium text-ai">{g.structure}</div>
      <p className="leading-relaxed text-ink-2">{g.explanation}</p>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{L('Жишээ', 'Examples')}</p>
        <ul className="flex flex-col gap-2.5">
          {g.examples.map((ex) => (
            <li key={ex.ja} className="flex items-start gap-2">
              <SpeakButton text={ex.ja.replace(/[→—].*$/, '')} size="sm" />
              <div>
                <p className="jp text-base text-ink">{ex.ja}</p>
                <p className="text-sm text-muted">{ex.mn}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {g.mistakes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{L('Түгээмэл алдаа', 'Common mistakes')}</p>
          <ul className="flex flex-col gap-2">
            {g.mistakes.map((m) => (
              <li key={m.wrong} className="rounded-xl border border-line p-3 text-sm">
                <p className="jp text-shu line-through decoration-shu/50">✕ {m.wrong}</p>
                <p className="jp font-medium text-matcha">○ {m.right}</p>
                <p className="mt-1 flex items-start gap-1.5 text-ink-2">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-muted" />
                  {m.note}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ───────────── flashcards (lesson practice) ─────────────

export interface Flashcard {
  key: string;
  front: string;
  reading?: string;
  back: string;
  sub?: string;
  speak: string;
}

export function Flashcards({ cards, onFinish }: { cards: Flashcard[]; onFinish?: (known: number) => void }) {
  const { L } = useI18n();
  const [deck, setDeck] = useState(cards);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  const card = deck[i];
  const next = (knew: boolean) => {
    if (knew) setKnown((k) => new Set(k).add(card.key));
    setFlipped(false);
    if (i + 1 >= deck.length) {
      setDone(true);
      onFinish?.(known.size + (knew ? 1 : 0));
    } else setI(i + 1);
  };
  if (done) {
    const again = deck.filter((c) => !known.has(c.key));
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-4xl font-semibold tabular-nums text-ink">
          {known.size}/{deck.length}
        </p>
        <p className="text-sm text-muted">{L('карт мэдэж байна гэж тэмдэглэлээ', 'cards marked as known')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {again.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                setDeck(again);
                setI(0);
                setKnown(new Set());
                setDone(false);
              }}
            >
              {L(`Мэдэхгүй ${again.length} картыг давтах`, `Repeat ${again.length} unknown`)}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setDeck([...cards].sort(() => Math.random() - 0.5));
              setI(0);
              setKnown(new Set());
              setDone(false);
            }}
          >
            <Shuffle className="size-4" />
            {L('Холиод дахин', 'Shuffle & restart')}
          </Button>
        </div>
      </Card>
    );
  }
  if (!card) return null;
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm tabular-nums text-muted">
        {i + 1} / {deck.length}
      </p>
      <button
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-64 w-full max-w-md flex-col items-center justify-center gap-3 rounded-3xl border border-line bg-surface p-8 text-center shadow-sm transition-colors hover:border-ink-2/30"
        aria-label={L('Картыг эргүүлэх', 'Flip card')}
      >
        <span className="brush text-6xl text-ink">{card.front}</span>
        {flipped ? (
          <span className="animate-rise flex flex-col items-center gap-1">
            {card.reading && <span className="jp text-lg text-ai">{card.reading}</span>}
            <span className="text-lg font-medium text-ink">{card.back}</span>
            {card.sub && <span className="text-sm text-muted">{card.sub}</span>}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Eye className="size-4" />
            {L('Хариултыг харах', 'Show answer')}
          </span>
        )}
      </button>
      <div className="flex items-center gap-2">
        <SpeakButton text={card.speak} label={L('Сонсох', 'Listen')} />
      </div>
      {flipped ? (
        <div className="grid w-full max-w-md grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => next(false)}>
            <ChevronLeft className="size-4" />
            {L('Дахин', 'Again')}
          </Button>
          <Button variant="success" size="lg" onClick={() => next(true)}>
            {L('Мэдэж байна', 'I knew it')}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : (
        <Button size="lg" onClick={() => setFlipped(true)} className="w-full max-w-md">
          {L('Хариултыг харах', 'Show answer')}
        </Button>
      )}
    </div>
  );
}
