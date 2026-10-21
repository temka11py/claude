import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Check, Plus, Search, Star } from 'lucide-react';
import type { Kanji } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Button, Card, EmptyState, ErrorState, Jp, PageHeader, Segmented, SpeakButton, Spinner, StateBadge, cx } from '../components/ui';
import { KanjiReadings, KanjiTile, useItemActions } from '../components/cards';
import { StrokeOrder, WritingCanvas } from '../components/writing';
import { PracticeRunner } from '../components/quiz/runners';

export function KanjiList() {
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<{ kanji: Kanji[] }>('/kanji');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'quiz'>('all');
  const [quiz, setQuiz] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const term = q.trim().toLowerCase();
  const filtered = data.kanji.filter((k) => !term || k.char.includes(term) || k.meaning.toLowerCase().includes(term) || k.meaningEn.toLowerCase().includes(term) || k.onyomi.includes(term) || k.kunyomi.includes(term));
  const groups = new Map<string, Kanji[]>();
  for (const k of filtered) {
    const key = k.lesson?.title ?? '—';
    groups.set(key, [...(groups.get(key) ?? []), k]);
  }
  const learned = data.kanji.filter((k) => k.state === 'review' || k.state === 'mastered').length;

  return (
    <div>
      <PageHeader
        titleJa="かんじ"
        title={L('Ханз', 'Kanji')}
        subtitle={L(`JLPT N5-ийн ${data.kanji.length} ханз · ${learned} нь цээжилсэн`, `${data.kanji.length} JLPT N5 kanji · ${learned} learned`)}
        actions={
          <Segmented
            value={tab}
            onChange={(t) => {
              setTab(t);
              setQuiz(null);
            }}
            options={[
              { value: 'all', label: L('Бүх ханз', 'All kanji') },
              { value: 'quiz', label: L('Шалгалт', 'Quiz') },
            ]}
          />
        }
      />
      {tab === 'quiz' ? (
        quiz ? (
          <div>
            <Button variant="ghost" size="sm" className="mb-3" onClick={() => setQuiz(null)}>
              <ArrowLeft className="size-4" />
              {L('Буцах', 'Back')}
            </Button>
            <PracticeRunner query={quiz} title={L('Ханзны дасгал', 'Kanji practice')} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { q: 'prefix=kanji-mean&count=10', mn: 'Утга', en: 'Meaning', dmn: 'Ханзыг хараад утгыг нь сонгох', den: 'See a kanji, choose its meaning' },
              { q: 'prefix=kanji-read,vocab-read&count=10', mn: 'Уншлага', en: 'Reading', dmn: 'Ханзтай үгийн уншлагыг сонгох', den: 'Choose the reading of a kanji word' },
              { q: 'prefix=kanji-mean,kanji-read,vocab-read&count=20', mn: 'Холимог', en: 'Mixed', dmn: '20 асуулттай холимог шалгалт', den: '20 mixed questions' },
            ].map((m) => (
              <button key={m.q} onClick={() => setQuiz(m.q)} className="rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-shu">
                <p className="text-lg font-semibold text-ink">{L(m.mn, m.en)}</p>
                <p className="mt-1 text-sm text-muted">{L(m.dmn, m.den)}</p>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="relative mb-5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Хайх: 日, нар, ニチ…', 'Search: 日, sun, ニチ…')} className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-ink outline-none focus:border-shu" aria-label={L('Хайх', 'Search')} />
          </div>
          {filtered.length === 0 && <EmptyState title={L('Ханз олдсонгүй', 'No kanji found')} />}
          <div className="flex flex-col gap-6">
            {[...groups.entries()].map(([title, list]) => (
              <section key={title}>
                <h2 className="mb-2.5 text-sm font-semibold text-ink-2">{title}</h2>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
                  {list.map((k) => (
                    <KanjiTile key={k.id} k={k} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function KanjiDetail() {
  const { char = '' } = useParams();
  const { L, lang } = useI18n();
  const actions = useItemActions();
  const { data, error, loading, reload, setData } = useApi<{ item: Kanji }>(`/kanji/${encodeURIComponent(char)}`);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.status === 404 ? L('Ханз олдсонгүй', 'Kanji not found') : error.message} onRetry={reload} />;
  if (!data) return null;
  const k = data.item;
  const update = (patch: Partial<Kanji>) => setData((d) => (d ? { item: { ...d.item, ...patch } } : d));
  return (
    <div>
      <Link to="/kanji" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {L('Бүх ханз', 'All kanji')}
      </Link>
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="flex flex-col items-center gap-4 text-center">
          <span className="brush text-[7rem] leading-none text-ink">{k.char}</span>
          <div>
            <p className="text-2xl font-semibold text-ink">{lang === 'en' ? k.meaningEn : k.meaning}</p>
            {lang === 'mn' && <p className="text-sm text-muted">{k.meaningEn}</p>}
          </div>
          <StateBadge state={k.state} />
          <div className="w-full text-left">
            <KanjiReadings k={k} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={async () => update({ favorite: await actions.toggleFavorite('kanji', k.id) })}>
              <Star className={cx('size-4', k.favorite && 'fill-shu text-shu')} />
              {L('Дуртай', 'Favorite')}
            </Button>
            <Button size="sm" variant="secondary" onClick={async () => update({ state: await actions.markKnown('kanji', k.id) })}>
              <Check className="size-4" />
              {L('Мэднэ', 'Known')}
            </Button>
            <Button size="sm" variant="secondary" onClick={async () => update({ state: await actions.addToReview('kanji', k.id) })}>
              <Plus className="size-4" />
              {L('Давтах', 'Review')}
            </Button>
          </div>
          {k.lesson && (
            <Link to={`/lessons/${k.lesson.id}`} className="text-sm font-medium text-ai hover:underline">
              {k.lesson.title}
            </Link>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-4 font-semibold text-ink">{L('Бичих', 'Writing')}</h2>
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-around">
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs font-medium text-muted">{L('Зураасны дараалал', 'Stroke order')}</p>
                <StrokeOrder char={k.char} size={200} />
              </div>
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs font-medium text-muted">{L('Өөрөө бичиж үзэх', 'Try it yourself')}</p>
                <WritingCanvas char={k.char} size={240} />
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-muted">
              {L('Энэ талбай гар бичмэлийг автоматаар үнэлэхгүй — загвартайгаа харьцуулж өөрөө шалгаарай.', 'Your handwriting is not graded automatically — compare it with the model.')}
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-ink">{L('Жишээ үгс', 'Example words')}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {k.examples.map((ex) => (
                <li key={ex.word} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                  <SpeakButton text={ex.reading} size="sm" />
                  <div className="min-w-0">
                    <p className="jp text-lg text-ink">
                      {ex.word} <span className="text-sm text-ai">{ex.reading}</span>
                    </p>
                    <p className="truncate text-sm text-muted">{ex.meaning}</p>
                  </div>
                </li>
              ))}
            </ul>
            {k.sentences.length > 0 && (
              <>
                <h3 className="mb-2 mt-5 text-sm font-semibold text-ink">{L('Жишээ өгүүлбэр', 'Example sentence')}</h3>
                {k.sentences.map((s) => (
                  <div key={s.ja} className="flex items-start gap-2">
                    <SpeakButton text={s.ja} size="sm" />
                    <div>
                      <Jp text={s.ja} className="jp block text-lg leading-loose text-ink" />
                      <p className="text-sm text-muted">{s.mn}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </Card>

          {k.vocabulary && k.vocabulary.length > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold text-ink">{L('Энэ ханз орсон үгс', 'Vocabulary using this kanji')}</h2>
              <div className="flex flex-wrap gap-2">
                {k.vocabulary.map((v) => (
                  <span key={v.id} className="rounded-xl border border-line px-3 py-1.5 text-sm">
                    <span className="jp font-medium text-ink">{v.word}</span> <span className="jp text-muted">{v.kana}</span> · <span className="text-ink-2">{v.meaning}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
