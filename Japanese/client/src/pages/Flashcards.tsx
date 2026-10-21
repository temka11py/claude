import { useState } from 'react';
import { ArrowLeft, Layers, Star } from 'lucide-react';
import { post } from '../api/client';
import type { Vocab } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../i18n';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SectionTitle, Spinner, cx } from '../components/ui';
import FlashDeck from '../components/day/FlashDeck';

interface Deck {
  id: string;
  title: string;
  titleJa?: string;
  count: number;
  done?: boolean;
}

interface Decks {
  today: Deck | null;
  studied: Deck[];
  topics: Deck[];
  special: Deck[];
}

function DeckButton({ deck, onOpen, highlight }: { deck: Deck; onOpen: (d: Deck) => void; highlight?: boolean }) {
  const { L } = useI18n();
  return (
    <button
      disabled={deck.count === 0}
      onClick={() => onOpen(deck)}
      className={cx('flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors disabled:opacity-50', highlight ? 'border-shu bg-shu-soft/50 hover:bg-shu-soft' : 'border-line bg-surface hover:border-ink-2/30')}
    >
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', highlight ? 'bg-shu text-white' : 'bg-surface-2 text-ink-2')}>
        <Layers className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink">{deck.title}</span>
        {deck.titleJa && <span className="jp block truncate text-xs text-muted">{deck.titleJa}</span>}
      </span>
      <Badge tone={deck.done ? 'matcha' : 'neutral'}>
        {deck.count} {L('үг', 'words')}
      </Badge>
    </button>
  );
}

function DeckSession({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const { L, lang } = useI18n();
  const { notify, celebrate } = useToast();
  const { data, error, loading, reload } = useApi<{ cards: Vocab[] }>(`/flashcards?deck=${encodeURIComponent(deck.id)}`);
  const [run, setRun] = useState(0);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const finish = async (_known: number, unknownIds: number[]) => {
    // Words you did not know go into spaced repetition, due now.
    await Promise.all(unknownIds.map((itemId) => post('/review/add', { itemType: 'vocab', itemId }).catch(() => undefined)));
    const r = await post<{ achievements: never[] }>('/xp', { source: 'flashcards', amount: Math.min(20, Math.max(2, Math.round(data.cards.length / 2))) }).catch(() => null);
    if (r) celebrate(r.achievements, lang);
    notify({
      kind: 'info',
      title: L('Багц дууслаа', 'Deck finished'),
      body: unknownIds.length ? L(`Мэдэхгүй ${unknownIds.length} үгийг давталтад нэмлээ.`, `${unknownIds.length} unknown words were added to review.`) : L('Бүгдийг мэдэж байна!', 'You knew them all!'),
    });
    setRun((r) => r + 1);
  };
  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="flex items-center gap-1 self-start text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {L('Багцууд', 'Decks')}
      </button>
      <h2 className="text-xl font-semibold text-ink">{deck.title}</h2>
      {data.cards.length ? <FlashDeck key={run} cards={[...data.cards].sort(() => Math.random() - 0.5)} onFinish={(k, u) => void finish(k, u)} /> : <EmptyState title={L('Энэ багцад үг алга', 'No words in this deck')} />}
    </div>
  );
}

export default function Flashcards() {
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<Decks>('/flashcards/decks');
  const [open, setOpen] = useState<Deck | null>(null);
  if (open) return <DeckSession deck={open} onBack={() => setOpen(null)} />;
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  return (
    <div>
      <PageHeader
        title={L('Флэш карт', 'Flashcards')}
        titleJa="たんごカード"
        subtitle={L('Картыг дарж эргүүлнэ (Space). 1 = дахин, 2 = мэдэж байна. Мэдэхгүй үгс автоматаар давталтад орно.', 'Tap to flip (Space). 1 = again, 2 = knew it. Unknown words go to your review deck.')}
      />
      <div className="flex flex-col gap-6">
        {data.today && data.today.count > 0 && (
          <section>
            <SectionTitle>{L('Өнөөдрийн үгс', 'Today’s words')}</SectionTitle>
            <DeckButton deck={data.today} onOpen={setOpen} highlight />
          </section>
        )}
        <section>
          <SectionTitle>{L('Миний багцууд', 'My decks')}</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-3">
            {data.special.map((d) => (
              <DeckButton key={d.id} deck={d} onOpen={setOpen} />
            ))}
          </div>
        </section>
        {data.studied.length > 0 && (
          <section>
            <SectionTitle>{L('Үзсэн өдрүүд', 'Days studied')}</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.studied.map((d) => (
                <DeckButton key={d.id} deck={d} onOpen={setOpen} />
              ))}
            </div>
          </section>
        )}
        <section>
          <SectionTitle action={<Star className="size-4 text-muted" />}>{L('Сэдвээр', 'By topic')}</SectionTitle>
          <Card className="p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.topics.map((d) => (
                <DeckButton key={d.id} deck={d} onOpen={setOpen} />
              ))}
            </div>
          </Card>
        </section>
      </div>
      <Button variant="ghost" className="mt-6" onClick={() => void reload()}>
        {L('Шинэчлэх', 'Refresh')}
      </Button>
    </div>
  );
}
