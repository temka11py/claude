import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye, Plus, Search, Star } from 'lucide-react';
import { api } from '../api/client';
import type { Vocab } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { posLabel } from '../lib/labels';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Ruby, Segmented, SpeakButton, Spinner, StateBadge, cx } from '../components/ui';
import { VocabItem, useItemActions } from '../components/cards';

interface VocabResponse {
  total: number;
  page: number;
  pageSize: number;
  topics: string[];
  items: Vocab[];
}

const POS_FILTERS = ['', 'noun', 'verb1', 'verb2', 'verb3', 'i-adj', 'na-adj', 'adverb', 'expression'];

function StudyCard({ items, onUpdate }: { items: Vocab[]; onUpdate: (v: Vocab) => void }) {
  const { L, lang } = useI18n();
  const { settings } = useAuth();
  const actions = useItemActions();
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setI(0);
    setRevealed(false);
  }, [items.length]);
  const v = items[Math.min(i, items.length - 1)];
  if (!v) return null;
  const move = (d: number) => {
    setI((x) => (x + d + items.length) % items.length);
    setRevealed(false);
  };
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
      <p className="text-sm tabular-nums text-muted">
        {i + 1} / {items.length}
      </p>
      <Card className="flex min-h-72 w-full flex-col items-center justify-center gap-3 text-center">
        <StateBadge state={v.state} />
        <p className="text-5xl font-medium text-ink sm:text-6xl">
          <Ruby text={v.word} reading={revealed && v.word !== v.kana ? v.kana : undefined} show={revealed} />
        </p>
        {revealed ? (
          <div className="animate-rise flex flex-col items-center gap-1.5">
            {settings.showRomaji && <p className="text-sm text-muted">{v.romaji}</p>}
            <p className="text-xl font-semibold text-ink">{lang === 'en' ? v.meaningEn : v.meaning}</p>
            <Badge>{posLabel(v.partOfSpeech, lang)}</Badge>
            <div className="mt-3 rounded-xl bg-surface-2 px-4 py-2.5">
              <p className="jp text-ink">{v.example}</p>
              <p className="text-sm text-muted">{v.exampleMn}</p>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setRevealed(true)}>
            <Eye className="size-4" />
            {L('Хариултыг харах', 'Show answer')}
          </Button>
        )}
      </Card>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <SpeakButton text={v.kana} label={L('Сонсох', 'Listen')} />
        <Button variant="secondary" size="sm" onClick={async () => onUpdate({ ...v, favorite: await actions.toggleFavorite('vocab', v.id) })}>
          <Star className={cx('size-4', v.favorite && 'fill-shu text-shu')} />
          {L('Дуртай', 'Favorite')}
        </Button>
        <Button variant="secondary" size="sm" onClick={async () => onUpdate({ ...v, state: await actions.markKnown('vocab', v.id) })}>
          <Check className="size-4" />
          {L('Мэднэ', 'Known')}
        </Button>
        <Button variant="secondary" size="sm" onClick={async () => onUpdate({ ...v, state: await actions.addToReview('vocab', v.id) })}>
          <Plus className="size-4" />
          {L('Давтах', 'Review')}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => move(-1)}>
          <ChevronLeft className="size-4" />
          {L('Өмнөх', 'Previous')}
        </Button>
        <Button onClick={() => move(1)}>
          {L('Дараах', 'Next')}
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Vocabulary() {
  const { L, lang } = useI18n();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [topic, setTopic] = useState('');
  const [pos, setPos] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'learned' | 'new'>('all');
  const [view, setView] = useState<'list' | 'cards'>('list');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VocabResponse | null>(null);
  const [items, setItems] = useState<Vocab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debounced, topic, pos, filter]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '60', filter });
    if (debounced) params.set('q', debounced);
    if (topic) params.set('topic', topic);
    if (pos) params.set('pos', pos);
    api<VocabResponse>(`/vocabulary?${params}`)
      .then((r) => {
        if (!alive) return;
        setData(r);
        setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items]));
        setError('');
      })
      .catch((e) => alive && setError(String(e.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [page, debounced, topic, pos, filter]);

  const update = (v: Vocab) => setItems((list) => list.map((x) => (x.id === v.id ? v : x)));

  return (
    <div>
      <PageHeader
        titleJa="ごい"
        title={L('Үгсийн сан', 'Vocabulary')}
        subtitle={L(`JLPT N5 түвшний ${data?.total ?? '…'} үг — жишээ өгүүлбэр, монгол орчуулгатай.`, `${data?.total ?? '…'} JLPT N5 words with example sentences.`)}
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: L('Жагсаалт', 'List') },
              { value: 'cards', label: L('Карт', 'Cards') },
            ]}
          />
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L('Хайх: 食べる, たべる, taberu, идэх…', 'Search: 食べる, たべる, taberu, eat…')}
            className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-ink outline-none focus:border-shu"
            aria-label={L('Хайх', 'Search')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: L('Бүгд', 'All') },
              { value: 'new', label: L('Сураагүй', 'Not learned') },
              { value: 'learned', label: L('Сурсан', 'Learned') },
              { value: 'favorites', label: L('Дуртай', 'Favorites') },
            ]}
          />
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-3 text-sm text-ink" aria-label={L('Сэдэв', 'Topic')}>
            <option value="">{L('Бүх сэдэв', 'All topics')}</option>
            {data?.topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={pos} onChange={(e) => setPos(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-3 text-sm text-ink" aria-label={L('Үгийн аймаг', 'Part of speech')}>
            {POS_FILTERS.map((p) => (
              <option key={p} value={p}>
                {p ? posLabel(p, lang) : L('Бүх үгийн аймаг', 'All parts of speech')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setPage(1)} />
      ) : loading && items.length === 0 ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon={<Search className="size-6" />} title={L('Үг олдсонгүй', 'No words found')} body={L('Хайлт эсвэл шүүлтүүрээ өөрчилнө үү.', 'Try another search or filter.')} />
      ) : view === 'cards' ? (
        <StudyCard items={items} onUpdate={update} />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((v) => (
              <VocabItem key={v.id} v={v} onChange={update} />
            ))}
          </ul>
          {data && items.length < data.total && (
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" loading={loading} onClick={() => setPage((p) => p + 1)}>
                {L(`Цааш үзэх (${data.total - items.length})`, `Load more (${data.total - items.length})`)}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
