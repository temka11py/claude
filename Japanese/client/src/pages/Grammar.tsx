import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Play, Plus, Search } from 'lucide-react';
import type { Grammar, GrammarSummary } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { categoryLabel } from '../lib/labels';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner, StateBadge, cx } from '../components/ui';
import { GrammarBlock, useItemActions } from '../components/cards';
import { PracticeRunner } from '../components/quiz/runners';

const CATEGORIES = ['particles', 'verbs', 'adjectives', 'grammar', 'numbers', 'expressions'];

export function GrammarList() {
  const { L, lang } = useI18n();
  const { data, error, loading, reload } = useApi<{ grammar: GrammarSummary[] }>('/grammar');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const term = q.trim().toLowerCase();
  const list = data.grammar.filter((g) => (!category || g.category === category) && (!term || g.title.toLowerCase().includes(term) || g.meaning.toLowerCase().includes(term) || g.structure.toLowerCase().includes(term)));
  const byModule = new Map<number, GrammarSummary[]>();
  for (const g of list) {
    const m = g.lesson?.module.order ?? 0;
    byModule.set(m, [...(byModule.get(m) ?? []), g]);
  }
  const catLabel = (c: string) => (c === 'expressions' ? L('Хэллэг', 'Expressions') : categoryLabel(c, lang));
  return (
    <div>
      <PageHeader titleJa="ぶんぽう" title={L('Дүрэм', 'Grammar')} subtitle={L(`N5 түвшний ${data.grammar.length} дүрэм — монгол тайлбар, жишээ, түгээмэл алдаа, дасгалтай.`, `${data.grammar.length} N5 grammar points with explanations, examples and practice.`)} />
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Хайх: は, て形, дуртай…', 'Search: は, て-form, like…')} className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-ink outline-none focus:border-shu" aria-label={L('Хайх', 'Search')} />
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {['', ...CATEGORIES].map((c) => (
          <button key={c || 'all'} onClick={() => setCategory(c)} className={cx('rounded-full border px-3 py-1.5 text-sm font-medium', category === c ? 'border-shu bg-shu-soft text-shu' : 'border-line bg-surface text-ink-2 hover:bg-surface-2')}>
            {c ? catLabel(c) : L('Бүгд', 'All')}
          </button>
        ))}
      </div>
      {list.length === 0 && <EmptyState title={L('Дүрэм олдсонгүй', 'No grammar found')} />}
      <div className="flex flex-col gap-6">
        {[...byModule.entries()].map(([m, items]) => (
          <section key={m}>
            <h2 className="mb-2.5 text-sm font-semibold text-ink-2">
              {L('Модуль', 'Module')} {m}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((g) => (
                <Link key={g.id} to={`/grammar/${g.slug}`} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-shu">
                  <div className="flex items-start justify-between gap-2">
                    <p className="jp text-lg font-semibold text-ink">{g.title}</p>
                    <StateBadge state={g.state} />
                  </div>
                  <p className="text-sm text-ink-2">{g.meaning}</p>
                  <p className="jp truncate text-xs text-muted">{g.structure}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge tone="ai">{catLabel(g.category)}</Badge>
                    <span className="text-xs text-muted">
                      {g._count.questions} {L('дасгал', 'questions')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function GrammarDetail() {
  const { slug = '' } = useParams();
  const { L } = useI18n();
  const actions = useItemActions();
  const { data, error, loading, reload, setData } = useApi<{ item: Grammar; related: { slug: string; title: string; meaning: string }[] }>(`/grammar/${slug}`);
  const [practice, setPractice] = useState(false);
  useEffect(() => setPractice(false), [slug]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.status === 404 ? L('Дүрэм олдсонгүй', 'Grammar point not found') : error.message} onRetry={reload} />;
  if (!data) return null;
  const g = data.item;
  return (
    <div>
      <Link to="/grammar" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {L('Бүх дүрэм', 'All grammar')}
      </Link>
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-4">
          <GrammarBlock g={g} />
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink">{L('Дасгал', 'Practice')}</h2>
                <p className="text-sm text-muted">{L(`${g._count.questions} асуулт`, `${g._count.questions} questions`)}</p>
              </div>
              {!practice && (
                <Button onClick={() => setPractice(true)}>
                  <Play className="size-4" />
                  {L('Дасгал эхлэх', 'Start practice')}
                </Button>
              )}
            </div>
            {practice && (
              <div className="mt-4">
                <PracticeRunner query={`grammarId=${g.id}&count=10`} title={`${g.title} — ${L('дасгал', 'practice')}`} />
              </div>
            )}
          </Card>
        </div>
        <aside className="flex flex-col gap-4">
          <Card>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{L('Давталт', 'Review')}</p>
            <StateBadge state={g.state} />
            <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={async () => {
                const state = await actions.addToReview('grammar', g.id);
                setData((d) => (d ? { ...d, item: { ...d.item, state } } : d));
              }}>
              <Plus className="size-4" />
              {L('Давталтад нэмэх', 'Add to review')}
            </Button>
          </Card>
          {g.lesson && (
            <Card>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{L('Холбоотой хичээл', 'Related lesson')}</p>
              <Link to={`/lessons/${g.lesson.id}`} className="font-medium text-ai hover:underline">
                {g.lesson.title}
              </Link>
            </Card>
          )}
          {data.related.length > 0 && (
            <Card>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{L('Ижил төрлийн дүрэм', 'Related grammar')}</p>
              <ul className="flex flex-col gap-2">
                {data.related.map((r) => (
                  <li key={r.slug}>
                    <Link to={`/grammar/${r.slug}`} className="block rounded-xl px-2 py-1.5 hover:bg-surface-2">
                      <p className="jp text-sm font-medium text-ink">{r.title}</p>
                      <p className="text-xs text-muted">{r.meaning}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
