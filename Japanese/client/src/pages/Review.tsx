import { useEffect, useState } from 'react';
import { Eye, Play, RotateCcw } from 'lucide-react';
import { api, post } from '../api/client';
import type { Achievement, ReviewCard } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../i18n';
import { formatDuration } from '../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Jp, LinkButton, PageHeader, ProgressBar, Segmented, SpeakButton, Spinner, StatTile, StateBadge, cx } from '../components/ui';

interface Summary {
  dueNow: number;
  dueByType: Record<string, number>;
  byState: Record<string, number>;
  byType: Record<string, number>;
  total: number;
  nextDueAt: string | null;
}

type Rating = 'again' | 'hard' | 'good' | 'easy';
const TYPES = ['vocab', 'kanji', 'grammar', 'kana'] as const;

function typeLabel(t: string, L: (mn: string, en: string) => string) {
  return { vocab: L('Үг', 'Vocab'), kanji: L('Ханз', 'Kanji'), grammar: L('Дүрэм', 'Grammar'), kana: L('Кана', 'Kana') }[t] ?? t;
}

function Session({ types, onExit }: { types: string[]; onExit: () => void }) {
  const { L, lang } = useI18n();
  const { settings } = useAuth();
  const { celebrate } = useToast();
  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState({ total: 0, correct: 0 });
  const [busy, setBusy] = useState(false);

  const load = () => {
    setQueue(null);
    api<{ items: ReviewCard[] }>(`/review/due?limit=20${types.length ? `&types=${types.join(',')}` : ''}`).then((r) => setQueue(r.items));
  };
  useEffect(load, [types.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!queue) return <Spinner />;
  const card = queue[0];
  if (!card) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-4xl font-semibold tabular-nums text-ink">{done.total}</p>
        <p className="text-sm text-muted">{L('карт давтлаа', 'cards reviewed')}{done.total ? ` · ${Math.round((done.correct / done.total) * 100)}% ${L('санасан', 'recalled')}` : ''}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}>
            <RotateCcw className="size-4" />
            {L('Дахин шалгах', 'Check for more')}
          </Button>
          <Button onClick={onExit}>{L('Дуусгах', 'Finish')}</Button>
        </div>
      </Card>
    );
  }

  const rate = async (rating: Rating) => {
    setBusy(true);
    try {
      const r = await post<{ item: { state: string }; achievements: Achievement[] }>('/review', { reviewItemId: card.id, rating });
      celebrate(r.achievements, lang);
      setDone((d) => ({ total: d.total + 1, correct: d.correct + (rating === 'again' ? 0 : 1) }));
      // "Again" cards come back at the end of this session.
      setQueue((q) => (q ? [...q.slice(1), ...(rating === 'again' ? [{ ...card, state: 'learning' }] : [])] : q));
      setRevealed(false);
    } finally {
      setBusy(false);
    }
  };

  const buttons: { r: Rating; mn: string; en: string; cls: string }[] = [
    { r: 'again', mn: 'Дахин', en: 'Again', cls: 'border-shu/40 text-shu hover:bg-shu-soft' },
    { r: 'hard', mn: 'Хэцүү', en: 'Hard', cls: 'border-yamabuki/40 text-yamabuki hover:bg-yamabuki-soft' },
    { r: 'good', mn: 'Сайн', en: 'Good', cls: 'border-ai/40 text-ai hover:bg-ai-soft' },
    { r: 'easy', mn: 'Амархан', en: 'Easy', cls: 'border-matcha/40 text-matcha hover:bg-matcha-soft' },
  ];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm tabular-nums text-muted">
          {done.total} {L('давтсан', 'done')} · {queue.length} {L('үлдсэн', 'left')}
        </span>
        <ProgressBar value={done.total} max={done.total + queue.length} />
        <Button variant="ghost" size="sm" onClick={onExit}>
          {L('Гарах', 'Exit')}
        </Button>
      </div>
      <Card className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex gap-1.5">
          <Badge tone="ai">{typeLabel(card.itemType, L)}</Badge>
          <StateBadge state={card.state} />
        </div>
        <p className={cx('text-ink', card.itemType === 'grammar' ? 'jp text-3xl font-semibold' : 'brush text-6xl sm:text-7xl')}>{card.front}</p>
        {revealed ? (
          <div className="animate-rise flex flex-col items-center gap-1.5">
            {card.reading && <p className="jp text-lg text-ai">{card.reading}</p>}
            {settings.showRomaji && card.romaji && card.romaji !== card.reading && <p className="text-sm text-muted">{card.romaji}</p>}
            <p className="text-xl font-semibold text-ink">{lang === 'en' && card.meaningEn ? card.meaningEn : card.meaning}</p>
            {card.example && card.itemType !== 'kana' && (
              <div className="mt-2 rounded-xl bg-surface-2 px-4 py-2">
                <Jp text={card.example} className="jp block leading-loose text-ink" />
                <p className="text-sm text-muted">{card.exampleMn}</p>
              </div>
            )}
            {card.speak && <SpeakButton text={card.speak} label={L('Сонсох', 'Listen')} />}
          </div>
        ) : (
          <p className="text-sm text-muted">{L('Утгыг нь санаад, дараа нь хариугаа нээгээрэй.', 'Recall the answer, then reveal it.')}</p>
        )}
      </Card>
      {revealed ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {buttons.map((b) => (
            <button key={b.r} disabled={busy} onClick={() => rate(b.r)} className={cx('flex flex-col items-center rounded-xl border bg-surface px-3 py-2.5 font-semibold transition-colors disabled:opacity-50', b.cls)}>
              {L(b.mn, b.en)}
              {card.preview && <span className="text-xs font-normal text-muted">{formatDuration(card.preview[b.r], lang)}</span>}
            </button>
          ))}
        </div>
      ) : (
        <Button size="lg" onClick={() => setRevealed(true)}>
          <Eye className="size-4" />
          {L('Хариуг харах', 'Show answer')}
        </Button>
      )}
    </div>
  );
}

function ItemsList({ state }: { state: 'learning' | 'review' | 'mastered' | 'new' }) {
  const { L, lang } = useI18n();
  const { data, loading } = useApi<{ items: ReviewCard[] }>(`/review/items?state=${state}&limit=200`);
  if (loading && !data) return <Spinner />;
  if (!data?.items.length) return <EmptyState title={L('Одоогоор хоосон байна', 'Nothing here yet')} />;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {data.items.map((c) => (
        <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
          <span className={cx('text-ink', c.itemType === 'grammar' ? 'jp text-sm font-semibold' : 'brush text-2xl')}>{c.front}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{lang === 'en' && c.meaningEn ? c.meaningEn : c.meaning}</span>
          <span className="shrink-0 text-xs text-muted">{new Date(c.dueAt) <= new Date() ? L('одоо', 'now') : formatDuration(new Date(c.dueAt).getTime() - Date.now(), lang)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Review() {
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<Summary>('/review/summary');
  const [types, setTypes] = useState<string[]>([]);
  const [session, setSession] = useState(false);
  const [tab, setTab] = useState<'learning' | 'review' | 'mastered' | 'new'>('learning');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  if (session) {
    return (
      <div>
        <PageHeader titleJa="ふくしゅう" title={L('Давталт', 'Review')} />
        <Session
          types={types}
          onExit={() => {
            setSession(false);
            void reload();
          }}
        />
      </div>
    );
  }

  const due = types.length ? types.reduce((s, t) => s + (data.dueByType[t] ?? 0), 0) : data.dueNow;
  return (
    <div>
      <PageHeader
        titleJa="ふくしゅう"
        title={L('Давталт', 'Review')}
        subtitle={L('Давталтын ухаалаг систем: санах тусам карт урт хугацааны дараа дахин гарч ирнэ.', 'Spaced repetition: the better you remember a card, the longer until you see it again.')}
      />
      {data.total === 0 ? (
        <EmptyState title={L('Давталтын жагсаалт хоосон байна', 'Your review deck is empty')} body={L('Хичээл дуусгах, эсвэл үг, ханзыг "Давталтад нэмэх" товчоор нэмээрэй.', 'Complete lessons or use "Add to review" on words and kanji.')} action={<LinkButton to="/learn">{L('Хичээл рүү', 'Go to lessons')}</LinkButton>} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={L('Одоо давтах', 'Due now')} value={data.dueNow} />
            <StatTile label={L('Сурч буй', 'Learning')} value={data.byState.learning ?? 0} />
            <StatTile label={L('Давтах шатанд', 'In review')} value={data.byState.review ?? 0} />
            <StatTile label={L('Эзэмшсэн', 'Mastered')} value={data.byState.mastered ?? 0} />
          </div>
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">{L('Төрөл', 'Card types')}</p>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
                    aria-pressed={types.includes(t)}
                    className={cx('rounded-full border px-3 py-1.5 text-sm font-medium', types.includes(t) ? 'border-shu bg-shu-soft text-shu' : 'border-line text-ink-2 hover:bg-surface-2')}
                  >
                    {typeLabel(t, L)} <span className="tabular-nums text-muted">{data.dueByType[t] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
            <Button size="lg" disabled={due === 0} onClick={() => setSession(true)}>
              <Play className="size-4" />
              {due ? L(`${due} карт давтах`, `Review ${due} cards`) : L('Давтах карт алга', 'Nothing due')}
            </Button>
          </Card>
          {due === 0 && data.nextDueAt && (
            <p className="text-center text-sm text-muted">
              {L('Дараагийн карт', 'Next card in')}: {new Date(data.nextDueAt).toLocaleString()}
            </p>
          )}
          <div>
            <div className="mb-3">
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'learning', label: L('Сурч буй', 'Learning') },
                  { value: 'review', label: L('Давтах', 'Review') },
                  { value: 'mastered', label: L('Эзэмшсэн', 'Mastered') },
                  { value: 'new', label: L('Шинэ', 'New') },
                ]}
              />
            </div>
            <ItemsList key={tab} state={tab} />
          </div>
        </div>
      )}
    </div>
  );
}
