import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, FilePlus2, RefreshCw, Save, Trash, TriangleAlert } from 'lucide-react';
import { COURSE_LEVELS } from '@shared/cefr';
import type { ModuleDoc, VocabEntry } from '@shared/contentSchema';
import { del, get, post, put } from '../lib/api';
import { useAuth, useToast } from '../lib/context';
import { Badge, Button, Callout, Card, EmptyState, ErrorState, Field, Input, PageHeader, Spinner, Stat, Tabs, Textarea, clsx, useDocumentTitle } from '../components/ui';

interface AdminModule {
  id: string;
  level: string;
  order: number;
  title: string;
  topic: string;
  status: 'draft' | 'published' | 'planned';
  sourceFile: string | null;
  lessons: number;
  words: number;
  hasTest: number;
}
interface Lint {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

/** Templates inserted by the "Add …" buttons in the lesson editor. */
const TEMPLATES = {
  reading: {
    id: 'r-new',
    title: 'Reading title',
    genre: 'article',
    text: ['First paragraph…', 'Second paragraph…'],
    glossary: [],
    questions: [
      { type: 'mcq', tag: 'main_idea', prompt: 'What is the main idea?', options: ['A', 'B', 'C'], answer: 0 },
      { type: 'tfng', tag: 'detail', prompt: 'Statement…', answer: 'true' },
      { type: 'short', tag: 'detail', prompt: 'Question…', answers: ['answer'] },
    ],
  },
  listening: {
    id: 'l-new',
    title: 'Listening title',
    kind: 'conversation',
    context: 'Who is talking and why.',
    speakers: [
      { name: 'Anna', voice: 'female', accent: 'en-GB' },
      { name: 'Ben', voice: 'male', accent: 'en-US' },
    ],
    lines: [
      { speaker: 'Anna', text: 'Hello…' },
      { speaker: 'Ben', text: 'Hi…' },
    ],
    gist: [{ type: 'mcq', tag: 'main_idea', prompt: 'What is the conversation about?', options: ['A', 'B', 'C'], answer: 0 }],
    detail: [
      { type: 'tfng', tag: 'detail', prompt: 'Statement…', answer: 'true' },
      { type: 'gap', tag: 'detail', prompt: 'They meet at ___.', answers: ['noon'] },
    ],
    expressions: [],
  },
  speaking: { id: 's-new', type: 'opinion', prompt: 'Speaking prompt…', points: [], phrases: [], targetWords: [], prepSeconds: 30, speakSeconds: 90, sample: 'Model answer…' },
  writing: { id: 'w-new', type: 'paragraph', prompt: 'Writing prompt…', register: 'neutral', minWords: 80, maxWords: 120, points: [], phrases: [], targetWords: [], sample: 'Model answer…' },
  question: { type: 'mcq', skill: 'grammar', prompt: 'Question with ___', options: ['a', 'b', 'c'], answer: 0, explanation: 'Why…' },
};

const EMPTY_WORD: VocabEntry = { word: '', pos: 'noun', definition: '', mn: '', examples: [''], collocations: [], synonyms: [], antonyms: [], level: 'B1', difficulty: 3 };

function WordEditor({ word, onSave, onCancel }: { word: VocabEntry; onSave: (w: VocabEntry) => void; onCancel: () => void }) {
  const [w, setW] = useState<VocabEntry>(word);
  const list = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);
  return (
    <div className="grid gap-2 rounded-xl bg-surface-2 p-3 sm:grid-cols-2">
      <Field label="Word">{(id) => <Input id={id} value={w.word} onChange={(e) => setW({ ...w, word: e.target.value })} />}</Field>
      <Field label="Part of speech">{(id) => <Input id={id} value={w.pos} onChange={(e) => setW({ ...w, pos: e.target.value })} />}</Field>
      <Field label="Definition">{(id) => <Input id={id} value={w.definition} onChange={(e) => setW({ ...w, definition: e.target.value })} />}</Field>
      <Field label="Mongolian">{(id) => <Input id={id} value={w.mn} onChange={(e) => setW({ ...w, mn: e.target.value })} />}</Field>
      <Field label="IPA">{(id) => <Input id={id} value={w.ipa ?? ''} onChange={(e) => setW({ ...w, ipa: e.target.value || undefined })} />}</Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="CEFR">
          {(id) => (
            <select id={id} value={w.level} onChange={(e) => setW({ ...w, level: e.target.value as VocabEntry['level'] })} className="h-11 rounded-xl bg-surface px-2 ring-1 ring-border">
              {['A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C1+'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Difficulty 1–5">{(id) => <Input id={id} type="number" min={1} max={5} value={w.difficulty} onChange={(e) => setW({ ...w, difficulty: Number(e.target.value) })} />}</Field>
      </div>
      <Field label="Examples (one per line, must contain the word)">{(id) => <Textarea id={id} rows={2} value={w.examples.join('\n')} onChange={(e) => setW({ ...w, examples: list(e.target.value) })} />}</Field>
      <Field label="Collocations (one per line)">{(id) => <Textarea id={id} rows={2} value={w.collocations.join('\n')} onChange={(e) => setW({ ...w, collocations: list(e.target.value) })} />}</Field>
      <Field label="Synonyms (one per line)">{(id) => <Textarea id={id} rows={2} value={w.synonyms.join('\n')} onChange={(e) => setW({ ...w, synonyms: list(e.target.value) })} />}</Field>
      <Field label="Common mistake">{(id) => <Textarea id={id} rows={2} value={w.mistake ?? ''} onChange={(e) => setW({ ...w, mistake: e.target.value || undefined })} />}</Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" onClick={() => onSave(w)} disabled={!w.word || !w.definition || !w.mn}>
          Save word
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ModuleEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const q = useQuery({ queryKey: ['admin-module', id], queryFn: () => get<{ doc: ModuleDoc | null; outline: Record<string, unknown> | null; status: string }>(`/admin/modules/${id}`) });
  const [doc, setDoc] = useState<ModuleDoc | null>(null);
  const [json, setJson] = useState('');
  const [tab, setTab] = useState<'form' | 'json'>('form');
  const [lessonIdx, setLessonIdx] = useState(0);
  const [editingWord, setEditingWord] = useState<number | 'new' | null>(null);
  const [issues, setIssues] = useState<{ error: string | null; lint: Lint[] } | null>(null);

  useEffect(() => {
    if (q.data?.doc) {
      setDoc(q.data.doc);
      setJson(JSON.stringify(q.data.doc, null, 2));
    }
  }, [q.data]);

  const current = (): unknown => {
    if (tab === 'json') return JSON.parse(json);
    return doc;
  };

  const validate = useMutation({
    mutationFn: () => post<{ valid: boolean; error: string | null; lint: Lint[] }>('/admin/validate', { doc: current() }),
    onSuccess: (r) => setIssues({ error: r.error, lint: r.lint }),
    onError: (e) => setIssues({ error: (e as Error).message, lint: [] }),
  });
  const save = useMutation({
    mutationFn: () => put<{ id: string; file: string | null; lint: Lint[] }>(`/admin/modules/${id}`, { doc: current() }),
    onSuccess: (r) => {
      push({ kind: 'success', title: 'Module saved', body: r.file ? `Written to content/${r.file}` : 'Saved to the database.' });
      setIssues({ error: null, lint: r.lint });
      void qc.invalidateQueries();
    },
    onError: (e) => {
      const err = e as Error & { details?: unknown };
      setIssues({ error: typeof err.details === 'string' ? err.details : err.message, lint: [] });
    },
  });
  const createFromOutline = useMutation({
    mutationFn: () => {
      const o = q.data!.outline!;
      return post('/admin/modules', { id, level: o.level, order: o.order, title: o.title, topic: o.topic, description: o.description });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-module', id] }),
  });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  if (!q.data.doc) {
    return (
      <div>
        <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
          <ArrowLeft className="size-4" /> Modules
        </button>
        <EmptyState
          icon={<FilePlus2 className="size-8" />}
          title="This module is only planned"
          body="Create a draft from the outline, then add lessons, vocabulary and a test. Drafts are invisible to learners until you publish."
          action={
            <Button loading={createFromOutline.isPending} onClick={() => createFromOutline.mutate()}>
              Create draft
            </Button>
          }
        />
      </div>
    );
  }
  if (!doc) return <Spinner />;

  const lesson = doc.lessons[lessonIdx];
  const setLesson = (patch: Partial<ModuleDoc['lessons'][number]>) => setDoc({ ...doc, lessons: doc.lessons.map((l, i) => (i === lessonIdx ? { ...l, ...patch } : l)) });
  const addLesson = () => {
    const n = doc.lessons.length + 1;
    setDoc({
      ...doc,
      lessons: [
        ...doc.lessons,
        {
          id: `${doc.id}-l${n}`,
          title: `Lesson ${n}`,
          focus: 'vocabulary',
          difficulty: 3,
          minutes: 20,
          objectives: ['Objective one', 'Objective two'],
          warmup: { intro: 'Warm-up…', questions: [{ type: 'mcq', prompt: 'Question?', options: ['A', 'B'], answer: 0 }] },
          vocabulary: [],
          phrases: [],
          quiz: [],
        },
      ],
    });
    setLessonIdx(doc.lessons.length);
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Modules
      </button>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">
          {doc.title} <Badge tone={doc.status === 'published' ? 'success' : 'neutral'}>{doc.status}</Badge>
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" loading={validate.isPending} onClick={() => validate.mutate()}>
            Validate
          </Button>
          <Button loading={save.isPending} icon={<Save className="size-4" />} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </div>
      {issues && (
        <div className="mb-4">
          {issues.error ? (
            <Callout kind="warning" title="Not valid yet">
              <pre className="whitespace-pre-wrap text-xs">{issues.error}</pre>
            </Callout>
          ) : (
            <Callout kind="success" title={`Valid${issues.lint.length ? ` — ${issues.lint.length} suggestions` : ''}`}>
              {issues.lint.slice(0, 20).map((l, i) => (
                <div key={i} className="text-xs">
                  {l.severity === 'error' ? '⛔' : '•'} {l.path}: {l.message}
                </div>
              ))}
            </Callout>
          )}
        </div>
      )}
      <Tabs
        tabs={[
          { value: 'form', label: 'Editor' },
          { value: 'json', label: 'JSON (everything)' },
        ]}
        value={tab}
        onChange={(t) => {
          if (t === 'json') setJson(JSON.stringify(doc, null, 2));
          else {
            try {
              setDoc(JSON.parse(json) as ModuleDoc);
            } catch {
              push({ kind: 'error', title: 'The JSON has a syntax error — fix it before switching back.' });
              return;
            }
          }
          setTab(t);
        }}
      />
      {tab === 'json' ? (
        <div>
          <p className="mb-2 text-sm text-muted">The full module document. Grammar topics, readings, listenings, questions and the module test are edited here. See docs/CONTENT_GUIDE.md.</p>
          <Textarea className="font-mono text-xs" rows={30} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} aria-label="Module JSON" />
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">{(fid) => <Input id={fid} value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />}</Field>
            <Field label="Topic">{(fid) => <Input id={fid} value={doc.topic} onChange={(e) => setDoc({ ...doc, topic: e.target.value })} />}</Field>
            <Field label="CEFR level">
              {(fid) => (
                <select id={fid} value={doc.level} onChange={(e) => setDoc({ ...doc, level: e.target.value as ModuleDoc['level'] })} className="h-11 w-full rounded-xl bg-surface px-3 ring-1 ring-border">
                  {COURSE_LEVELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Order in level" hint="Modules unlock in this order (the previous module is the prerequisite).">
              {(fid) => <Input id={fid} type="number" min={1} value={doc.order} onChange={(e) => setDoc({ ...doc, order: Number(e.target.value) })} />}
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">{(fid) => <Textarea id={fid} rows={2} value={doc.description} onChange={(e) => setDoc({ ...doc, description: e.target.value })} />}</Field>
            </div>
            <Field label="Status">
              {(fid) => (
                <select id={fid} value={doc.status} onChange={(e) => setDoc({ ...doc, status: e.target.value as ModuleDoc['status'] })} className="h-11 w-full rounded-xl bg-surface px-3 ring-1 ring-border">
                  <option value="draft">draft (hidden)</option>
                  <option value="published">published</option>
                </select>
              )}
            </Field>
            <div className="text-sm text-muted">
              {doc.grammar.length} grammar topics · {doc.pronunciation.length} pronunciation topics · {doc.test ? 'has a test' : 'no test yet (required to publish)'}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {doc.lessons.map((l, i) => (
                <button key={l.id} type="button" onClick={() => setLessonIdx(i)} className={clsx('rounded-lg px-3 py-1.5 text-sm font-semibold', i === lessonIdx ? 'bg-primary text-on-primary' : 'bg-surface-2')}>
                  {i + 1}. {l.title}
                </button>
              ))}
              <Button size="sm" variant="soft" onClick={addLesson}>
                + Lesson
              </Button>
            </div>
            {lesson && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <Field label="Lesson title">{(fid) => <Input id={fid} value={lesson.title} onChange={(e) => setLesson({ title: e.target.value })} />}</Field>
                  </div>
                  <Field label="Focus skill">
                    {(fid) => (
                      <select id={fid} value={lesson.focus} onChange={(e) => setLesson({ focus: e.target.value as typeof lesson.focus })} className="h-11 w-full rounded-xl bg-surface px-3 ring-1 ring-border">
                        {['vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'pronunciation'].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Difficulty">{(fid) => <Input id={fid} type="number" min={1} max={10} value={lesson.difficulty} onChange={(e) => setLesson({ difficulty: Number(e.target.value) })} />}</Field>
                    <Field label="Minutes">{(fid) => <Input id={fid} type="number" min={5} max={90} value={lesson.minutes} onChange={(e) => setLesson({ minutes: Number(e.target.value) })} />}</Field>
                  </div>
                </div>
                <Field label="Objectives (one per line, 2–4)">
                  {(fid) => <Textarea id={fid} rows={3} value={lesson.objectives.join('\n')} onChange={(e) => setLesson({ objectives: e.target.value.split('\n').filter((x) => x.trim()) })} />}
                </Field>
                <div className="flex flex-wrap gap-2">
                  {(['reading', 'listening', 'speaking', 'writing'] as const).map((k) => (
                    <Button
                      key={k}
                      size="sm"
                      variant={lesson[k] ? 'secondary' : 'soft'}
                      onClick={() => setLesson(lesson[k] ? { [k]: undefined } : { [k]: { ...TEMPLATES[k], id: `${k[0]}-${lesson.id}` } })}
                    >
                      {lesson[k] ? `Remove ${k}` : `Add ${k}`}
                    </Button>
                  ))}
                  <Button size="sm" variant="soft" onClick={() => setLesson({ quiz: [...lesson.quiz, TEMPLATES.question as ModuleDoc['lessons'][number]['quiz'][number]] })}>
                    Add quiz question
                  </Button>
                </div>
                <p className="text-xs text-muted">Added sections start from a template — fill in the text and questions in the JSON tab. Quiz: {lesson.quiz.length} questions.</p>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold">Vocabulary ({lesson.vocabulary.length})</h3>
                    <Button size="sm" variant="soft" onClick={() => setEditingWord('new')}>
                      + Word
                    </Button>
                  </div>
                  {editingWord === 'new' && (
                    <WordEditor
                      word={{ ...EMPTY_WORD, level: doc.level === 'B1' ? 'B1' : (doc.level as VocabEntry['level']) }}
                      onCancel={() => setEditingWord(null)}
                      onSave={(w) => {
                        setLesson({ vocabulary: [...lesson.vocabulary, w] });
                        setEditingWord(null);
                      }}
                    />
                  )}
                  <ul className="mt-2 divide-y divide-border">
                    {lesson.vocabulary.map((w, i) => (
                      <li key={`${w.word}-${i}`} className="py-2">
                        {editingWord === i ? (
                          <WordEditor
                            word={w}
                            onCancel={() => setEditingWord(null)}
                            onSave={(nw) => {
                              setLesson({ vocabulary: lesson.vocabulary.map((x, j) => (j === i ? nw : x)) });
                              setEditingWord(null);
                            }}
                          />
                        ) : (
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span>
                              <strong>{w.word}</strong> <span className="text-muted">— {w.definition}</span>
                            </span>
                            <span className="flex shrink-0 gap-1">
                              <button type="button" className="text-xs font-semibold text-primary" onClick={() => setEditingWord(i)}>
                                Edit
                              </button>
                              <button type="button" className="text-xs font-semibold text-danger" onClick={() => setLesson({ vocabulary: lesson.vocabulary.filter((_, j) => j !== i) })}>
                                Remove
                              </button>
                            </span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const { status } = useAuth();
  const qc = useQueryClient();
  const { push } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ id: '', level: 'B1', order: 1, title: '', topic: '' });
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: () => get<Record<string, number | boolean>>('/admin/stats'), enabled: status?.user?.role === 'admin' });
  const modules = useQuery({ queryKey: ['admin-modules'], queryFn: () => get<AdminModule[]>('/admin/modules'), enabled: status?.user?.role === 'admin' });
  useDocumentTitle('Content admin');

  const setStatus = useMutation({
    mutationFn: ({ id, s }: { id: string; s: 'draft' | 'published' }) => post(`/admin/modules/${id}/status`, { status: s }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => push({ kind: 'error', title: 'Could not change status', body: (e as Error).message }),
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/admin/modules/${id}`), onSuccess: () => qc.invalidateQueries() });
  const reimport = useMutation({
    mutationFn: () => post<{ imported: string[]; errors: { file: string; message: string }[] }>('/admin/reimport'),
    onSuccess: (r) => {
      push({ kind: r.errors.length ? 'error' : 'success', title: `Imported ${r.imported.length} files${r.errors.length ? `, ${r.errors.length} with errors` : ''}` });
      void qc.invalidateQueries();
    },
  });
  const create = useMutation({
    mutationFn: () => post<{ id: string }>('/admin/modules', form),
    onSuccess: (r) => {
      setCreating(false);
      void qc.invalidateQueries();
      setEditing(r.id);
    },
    onError: (e) => push({ kind: 'error', title: 'Could not create', body: (e as Error).message }),
  });

  if (status?.user?.role !== 'admin') return <ErrorState error={new Error('Only the administrator can manage content.')} />;
  if (editing) return <ModuleEditor id={editing} onBack={() => setEditing(null)} />;

  return (
    <div>
      <PageHeader
        title="Content admin"
        subtitle="Create and edit modules, lessons and vocabulary. Changes are validated and written back to content/*.json."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={reimport.isPending} onClick={() => reimport.mutate()}>
              Re-import files
            </Button>
            <Button icon={<FilePlus2 className="size-4" />} onClick={() => setCreating(!creating)}>
              New module
            </Button>
          </>
        }
      />
      {stats.data && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Published modules" value={String(stats.data.modulesPublished)} hint={`${stats.data.modulesDraft} draft · ${stats.data.modulesPlanned} planned`} />
          <Stat label="Lessons" value={String(stats.data.lessons)} />
          <Stat label="Words" value={String(stats.data.words)} />
          <Stat label="Questions" value={String(stats.data.questions)} hint={`${stats.data.levelExams} level exams · ${stats.data.scenarios} scenarios`} />
        </div>
      )}
      {creating && (
        <Card className="mb-4 grid gap-3 sm:grid-cols-5">
          <Field label="Id" hint="e.g. b1-12">
            {(id) => <Input id={id} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />}
          </Field>
          <Field label="Level">
            {(id) => (
              <select id={id} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="h-11 w-full rounded-xl bg-surface px-3 ring-1 ring-border">
                {COURSE_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Order">{(id) => <Input id={id} type="number" min={1} value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />}</Field>
          <Field label="Title">{(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
          <Field label="Topic">{(id) => <Input id={id} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />}</Field>
          <div className="sm:col-span-5">
            <Button loading={create.isPending} onClick={() => create.mutate()} disabled={!form.id || !form.title || !form.topic}>
              Create draft module
            </Button>
          </div>
        </Card>
      )}
      {modules.isLoading ? (
        <Spinner />
      ) : modules.error ? (
        <ErrorState error={modules.error} />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-3 py-2">Level</th>
                <th className="px-3 py-2">Module</th>
                <th className="px-3 py-2">Content</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(modules.data ?? []).map((m) => (
                <tr key={m.id} className="border-b border-border/60">
                  <td className="px-3 py-2 font-semibold">
                    {m.level} · {m.order}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{m.title}</div>
                    <div className="text-xs text-muted">{m.id}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {m.status === 'planned' ? 'outline only' : `${m.lessons} lessons · ${m.words} words · ${m.hasTest ? 'test ✓' : 'no test'}`}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={m.status === 'published' ? 'success' : m.status === 'draft' ? 'accent' : 'neutral'}>{m.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(m.id)}>
                      {m.status === 'planned' ? 'Create' : 'Edit'}
                    </Button>
                    {m.status !== 'planned' && (
                      <Button size="sm" variant="ghost" icon={m.status === 'published' ? <TriangleAlert className="size-3.5" /> : <CircleCheck className="size-3.5" />} onClick={() => setStatus.mutate({ id: m.id, s: m.status === 'published' ? 'draft' : 'published' })}>
                        {m.status === 'published' ? 'Unpublish' : 'Publish'}
                      </Button>
                    )}
                    {m.status === 'draft' && (
                      <Button size="sm" variant="ghost" aria-label={`Delete ${m.title}`} icon={<Trash className="size-3.5" />} onClick={() => confirm(`Delete draft module "${m.title}"? The JSON file is renamed to .deleted.`) && remove.mutate(m.id)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Unpublishing hides a module from learners. Deleting is only possible for drafts. Learner progress is kept when you edit a module (words and lessons keep their ids).</p>
    </div>
  );
}
