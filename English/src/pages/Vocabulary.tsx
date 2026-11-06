import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotebookPen, Pencil, Plus, Search, Trash, X } from 'lucide-react';
import { del, get, post, put } from '../lib/api';
import { useToast } from '../lib/context';
import type { ActivityResult, VocabCounts, Word } from '../lib/types';
import { StateBadge, WordCard } from '../components/vocab/WordCard';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, ProgressBar, Spinner, Tabs, Textarea, clsx, useDocumentTitle } from '../components/ui';

type Filter = 'all' | 'due' | 'LEARNING' | 'FAMILIAR' | 'MASTERED' | 'REVIEW' | 'difficult' | 'custom' | 'course';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'My words' },
  { value: 'due', label: 'Due' },
  { value: 'LEARNING', label: 'Learning' },
  { value: 'FAMILIAR', label: 'Familiar' },
  { value: 'MASTERED', label: 'Mastered' },
  { value: 'difficult', label: 'Difficult' },
  { value: 'custom', label: 'Personal' },
  { value: 'course', label: 'All course words' },
];

interface FormState {
  word: string;
  pos: string;
  definition: string;
  mongolian: string;
  example: string;
  ipa: string;
  note: string;
  tags: string;
}
const empty: FormState = { word: '', pos: '', definition: '', mongolian: '', example: '', ipa: '', note: '', tags: '' };

function WordForm({ initial, id, onClose }: { initial?: FormState; id?: string; onClose: () => void }) {
  const [f, setF] = useState<FormState>(initial ?? empty);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const { reward } = useToast();
  const save = useMutation({
    mutationFn: () => {
      const body = {
        word: f.word,
        pos: f.pos || null,
        definition: f.definition,
        mongolian: f.mongolian || null,
        example: f.example || null,
        ipa: f.ipa || null,
        note: f.note || null,
        tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      };
      return id ? put(`/vocab/custom/${id}`, body) : post<ActivityResult>('/vocab/custom', body);
    },
    onSuccess: (r) => {
      if (!id) reward(r as ActivityResult);
      void qc.invalidateQueries({ queryKey: ['vocab'] });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Card className="animate-slide-up">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{id ? 'Edit word' : 'Add a word to your notebook'}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-surface-2" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Word or phrase">{(fid) => <Input id={fid} value={f.word} onChange={set('word')} required placeholder="resilient" />}</Field>
        <Field label="Part of speech">{(fid) => <Input id={fid} value={f.pos} onChange={set('pos')} placeholder="adjective" />}</Field>
        <div className="sm:col-span-2">
          <Field label="Meaning (English)">{(fid) => <Input id={fid} value={f.definition} onChange={set('definition')} required placeholder="able to recover quickly from difficulties" />}</Field>
        </div>
        <Field label="Mongolian translation">{(fid) => <Input id={fid} lang="mn" value={f.mongolian} onChange={set('mongolian')} placeholder="тэсвэртэй" />}</Field>
        <Field label="Pronunciation (optional)">{(fid) => <Input id={fid} value={f.ipa} onChange={set('ipa')} placeholder="/rɪˈzɪliənt/" />}</Field>
        <div className="sm:col-span-2">
          <Field label="Example sentence" hint="Include the word — it will be used for fill-in-the-gap practice.">
            {(fid) => <Input id={fid} value={f.example} onChange={set('example')} placeholder="Children are often more resilient than adults think." />}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="My note">{(fid) => <Textarea id={fid} rows={2} value={f.note} onChange={set('note')} placeholder="Useful word for describing someone who doesn't give up." />}</Field>
        </div>
        <Field label="Tags" hint="Comma-separated, e.g. work, personality">
          {(fid) => <Input id={fid} value={f.tags} onChange={set('tags')} />}
        </Field>
        <div className="flex items-end">
          <Button type="submit" block loading={save.isPending}>
            {id ? 'Save changes' : 'Add to my words'}
          </Button>
        </div>
        {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
      </form>
      {!id && <p className="mt-3 text-xs text-muted">New words enter spaced repetition straight away.</p>}
    </Card>
  );
}

function WordDetail({ word, onClose, onEdit }: { word: Word; onClose: () => void; onEdit: () => void }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => del(`/vocab/custom/${word.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vocab'] });
      onClose();
    },
  });
  const p = word.progress;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={word.word}>
      <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="animate-slide-up relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-bg p-4 sm:rounded-3xl">
        <div className="mb-2 flex justify-end gap-1">
          {word.custom && (
            <>
              <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={onEdit}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" icon={<Trash className="size-4" />} loading={remove.isPending} onClick={() => confirm(`Delete "${word.word}"?`) && remove.mutate()}>
                Delete
              </Button>
            </>
          )}
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-surface-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <WordCard word={word} />
        {p && (
          <Card className="mt-3">
            <h3 className="mb-2 font-semibold">Your progress</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                State: <StateBadge state={p.state} />
              </div>
              <div>Next review: {p.dueAt ? new Date(p.dueAt).toLocaleDateString() : '—'}</div>
              <div>
                Correct / wrong: {p.correct} / {p.incorrect}
              </div>
              <div>Seen: {p.exposures} times</div>
              {p.firstLearnedAt && <div>Learned: {new Date(p.firstLearnedAt).toLocaleDateString()}</div>}
              {p.lapses > 0 && <div>Forgotten: {p.lapses}×</div>}
            </div>
            <div className="mt-3 space-y-2">
              {(['recognition', 'recall', 'context', 'production', 'retention'] as const).map((d) => (
                <div key={d} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-xs">
                  <span className="capitalize text-muted">{d}</span>
                  <ProgressBar value={p.dimensions[d]} size="sm" label={d} />
                  <span className="text-right tabular-nums">{Math.round(p.dimensions[d] * 100)}%</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Mastered = strong in every dimension after reviews spread over weeks.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function Vocabulary() {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Word | null>(null);
  const [editing, setEditing] = useState<Word | null>(null);
  useDocumentTitle('My words');
  const stats = useQuery({ queryKey: ['vocab', 'stats'], queryFn: () => get<VocabCounts>('/vocab/stats') });

  const params = (offset: number) => {
    const sp = new URLSearchParams({ offset: String(offset), limit: '60' });
    if (q.trim()) sp.set('q', q.trim());
    if (filter === 'course') sp.set('scope', 'course');
    else if (filter !== 'all') sp.set('state', filter);
    return sp.toString();
  };
  const list = useInfiniteQuery({
    queryKey: ['vocab', 'list', filter, q],
    queryFn: ({ pageParam }) => get<{ words: Word[]; hasMore: boolean }>(`/vocab?${params(pageParam)}`),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length * 60 : undefined),
  });
  const words = list.data?.pages.flatMap((p) => p.words) ?? [];

  return (
    <div>
      <PageHeader
        title="My words"
        subtitle={stats.data ? `${stats.data.total} words met · ${stats.data.learned} learned · ${stats.data.byState.MASTERED} mastered` : 'Your vocabulary notebook'}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            Add word
          </Button>
        }
      />
      {adding && (
        <div className="mb-4">
          <WordForm onClose={() => setAdding(false)} />
        </div>
      )}
      {editing && (
        <div className="mb-4">
          <WordForm
            id={editing.id}
            initial={{
              word: editing.word,
              pos: editing.pos ?? '',
              definition: editing.definition,
              mongolian: editing.mongolian ?? '',
              example: editing.examples[0] ?? '',
              ipa: editing.ipa ?? '',
              note: editing.personalNote ?? '',
              tags: editing.tags.join(', '),
            }}
            onClose={() => setEditing(null)}
          />
        </div>
      )}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search words, meanings or Mongolian…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search words" />
      </div>
      <Tabs tabs={FILTERS} value={filter} onChange={setFilter} />
      {list.isLoading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : words.length === 0 ? (
        <EmptyState
          icon={<NotebookPen className="size-8" />}
          title={filter === 'custom' ? 'No personal words yet' : 'No words here yet'}
          body={filter === 'all' ? 'Words appear here as soon as you meet them in a lesson. You can also add your own.' : 'Try another filter.'}
          action={
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Add a word
            </Button>
          }
        />
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {words.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => setSelected(w)} className="flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left ring-1 ring-border transition hover:ring-primary/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{w.word}</span>
                      {w.custom && <Badge tone="accent">personal</Badge>}
                    </div>
                    <div className="truncate text-sm text-muted">{w.mongolian ?? w.definition}</div>
                  </div>
                  {w.progress ? <StateBadge state={w.progress.state} /> : <Badge>{w.level}</Badge>}
                </button>
              </li>
            ))}
          </ul>
          {list.hasNextPage && (
            <div className="mt-4 text-center">
              <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
      {selected && (
        <WordDetail
          word={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
        />
      )}
      <p className={clsx('mt-6 text-center text-xs text-muted')}>States: New → Learning → Familiar → Mastered. “Review” means a word was forgotten and is being relearned.</p>
    </div>
  );
}
