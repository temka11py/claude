import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Lightbulb, Lock, PartyPopper } from 'lucide-react';
import { post } from '../api/client';
import type { Achievement, Kana, LessonDetail, SectionKey } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../i18n';
import { Badge, Button, Card, EmptyState, ErrorState, LinkButton, ProgressBar, SpeakButton, Spinner, cx } from '../components/ui';
import { Flashcards, GrammarBlock, KanjiReadings, VocabItem, type Flashcard } from '../components/cards';
import { KanaCell, KanaDetail, romajiOf } from '../components/kana';
import { QuizRunner } from '../components/quiz/runners';

const SECTION_LABELS: Record<SectionKey, [string, string]> = {
  kana: ['Үсэг', 'Characters'],
  vocabulary: ['Үгсийн сан', 'Vocabulary'],
  grammar: ['Дүрэм', 'Grammar'],
  kanji: ['Ханз', 'Kanji'],
  examples: ['Жишээ', 'Examples'],
  practice: ['Дасгал', 'Practice'],
  quiz: ['Мини шалгалт', 'Mini quiz'],
  review: ['Дүгнэлт', 'Review'],
};

function Overview({ data }: { data: LessonDetail }) {
  const { L } = useI18n();
  const { lesson } = data;
  return (
    <Card className="mb-4">
      <p className="leading-relaxed text-ink-2">{lesson.content.intro}</p>
      {lesson.objectives.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{L('Энэ хичээлээр', 'In this lesson')}</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {lesson.objectives.map((o) => (
              <li key={o} className="flex items-start gap-2 text-sm text-ink">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-matcha" />
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function KanaSection({ kana }: { kana: Kana[] }) {
  const { L } = useI18n();
  const [selected, setSelected] = useState<Kana | null>(null);
  return (
    <>
      <p className="mb-4 text-sm text-muted">{L('Үсэг дээр дарж дуудлага, жишээ үг, зураасны дарааллыг хараарай.', 'Tap a character to hear it and see an example and the stroke order.')}</p>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        {kana.map((k) => (
          <KanaCell key={k.id} k={k} onSelect={setSelected} />
        ))}
      </div>
      <KanaDetail k={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function KanjiSection({ data }: { data: LessonDetail }) {
  const { L } = useI18n();
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.lesson.kanji.map((k) => (
        <Card key={k.id} className="flex gap-4">
          <div className="flex flex-col items-center gap-2">
            <span className="brush grid size-24 place-items-center rounded-2xl bg-shu-soft text-6xl text-shu">{k.char}</span>
            <Link to={`/kanji/${encodeURIComponent(k.char)}`} className="text-xs font-medium text-ai hover:underline">
              {L('Бичих дасгал', 'Practise')} →
            </Link>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-ink">{k.meaning}</p>
            <div className="mt-2">
              <KanjiReadings k={k} />
            </div>
            <ul className="mt-3 flex flex-col gap-1">
              {k.examples.map((ex) => (
                <li key={ex.word} className="flex items-center gap-1.5 text-sm">
                  <SpeakButton text={ex.reading} size="sm" />
                  <span className="jp font-medium text-ink">{ex.word}</span>
                  <span className="jp text-muted">{ex.reading}</span>
                  <span className="truncate text-ink-2">— {ex.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ExamplesSection({ data }: { data: LessonDetail }) {
  const { L } = useI18n();
  const [showMn, setShowMn] = useState(true);
  const { content, grammar, stories } = data.lesson;
  const grammarExamples: { ja: string; mn: string; reading?: string }[] = grammar.flatMap((g) => g.examples.slice(0, 1));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setShowMn((s) => !s)}>
          {showMn ? L('Орчуулгыг нуух', 'Hide translation') : L('Орчуулга харах', 'Show translation')}
        </Button>
      </div>
      {content.dialogue && (
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{L('Харилцан яриа', 'Dialogue')}</p>
          <div className="flex flex-col gap-3">
            {content.dialogue.map((line, i) => (
              <div key={i} className={cx('flex items-start gap-2', i % 2 === 1 && 'flex-row-reverse text-right')}>
                <span className={cx('jp grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold', i % 2 ? 'bg-ai-soft text-ai' : 'bg-shu-soft text-shu')}>{line.speaker.slice(0, 2)}</span>
                <div className={cx('max-w-[80%] rounded-2xl px-4 py-2.5', i % 2 ? 'bg-ai-soft' : 'bg-surface-2')}>
                  <p className="jp text-base text-ink">{line.ja}</p>
                  {showMn && <p className="text-sm text-muted">{line.mn}</p>}
                </div>
                <SpeakButton text={line.ja} size="sm" />
              </div>
            ))}
          </div>
        </Card>
      )}
      {(content.examples.length > 0 || grammarExamples.length > 0) && (
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{L('Жишээ өгүүлбэр', 'Example sentences')}</p>
          <ul className="flex flex-col divide-y divide-line">
            {[...content.examples, ...grammarExamples].map((ex, i) => (
              <li key={i} className="flex items-start gap-2 py-2.5">
                <SpeakButton text={ex.reading ?? ex.ja} size="sm" />
                <div>
                  <p className="jp text-lg text-ink">{ex.ja}</p>
                  {ex.reading && <p className="jp text-sm text-ai">{ex.reading}</p>}
                  {showMn && <p className="text-sm text-muted">{ex.mn}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {content.tips.length > 0 && (
        <Card className="border-yamabuki/30 bg-yamabuki-soft">
          {content.tips.map((t) => (
            <p key={t} className="flex items-start gap-2 text-sm text-ink">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-yamabuki" />
              {t}
            </p>
          ))}
        </Card>
      )}
      {(content.links.length > 0 || stories.length > 0) && (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{L('Нэмэлт дасгал', 'More practice')}</p>
          <div className="flex flex-wrap gap-2">
            {[...content.links, ...stories.filter((s) => !content.links.some((l) => l.to.endsWith(s.slug))).map((s) => ({ label: `${s.titleJa} — ${s.title}`, to: `/stories/${s.slug}` }))].map((l) => (
              <LinkButton key={l.to} to={l.to} variant="secondary" size="sm">
                {l.label}
              </LinkButton>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function practiceCards(data: LessonDetail): Flashcard[] {
  const { kana, vocabulary, kanji } = data.lesson;
  return [
    ...kana.filter((k) => romajiOf(k)).map((k) => ({ key: `k${k.id}`, front: k.char, back: romajiOf(k), sub: `${k.example} — ${k.exampleMeaning}`, speak: k.char })),
    ...vocabulary.map((v) => ({ key: `v${v.id}`, front: v.word, reading: v.word !== v.kana ? v.kana : undefined, back: v.meaning, sub: v.romaji, speak: v.kana })),
    ...kanji.map((k) => ({ key: `j${k.id}`, front: k.char, reading: [k.onyomi, k.kunyomi].filter((x) => x !== '—').join(' · '), back: k.meaning, speak: k.examples[0]?.reading ?? k.char })),
  ];
}

export default function Lesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { L, lang } = useI18n();
  const { celebrate } = useToast();
  const { data, error, loading, reload, setData } = useApi<LessonDetail>(`/lessons/${id}`);
  const [active, setActive] = useState<SectionKey | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState<{ next: { id: number; title: string } | null; added: number } | null>(null);
  const cards = useMemo(() => (data ? practiceCards(data) : []), [data]);
  useEffect(() => {
    setActive(null);
    setCompleted(null);
  }, [id]);

  if (loading && !data) return <Spinner />;
  if (error?.status === 403) {
    return <EmptyState icon={<Lock className="size-6" />} title={L('Энэ хичээл түгжээтэй байна', 'This lesson is locked')} body={L('Өмнөх хичээлээ дуусгасны дараа нээгдэнэ.', 'Complete the previous lesson to unlock it.')} action={<LinkButton to="/learn">{L('Сургалтын зам', 'Learning path')}</LinkButton>} />;
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  const { lesson, sections } = data;
  const current: SectionKey = active ?? sections.find((s) => !data.sectionsDone.includes(s)) ?? sections[0];
  const idx = sections.indexOf(current);
  const doneCount = sections.filter((s) => data.sectionsDone.includes(s)).length;

  const markDone = async (section: SectionKey) => {
    if (data.sectionsDone.includes(section)) return;
    const r = await post<{ sectionsDone: string[]; status: LessonDetail['status'] }>(`/lessons/${lesson.id}/section`, { section }).catch(() => null);
    if (r) setData((d) => (d ? { ...d, sectionsDone: r.sectionsDone, status: r.status } : d));
  };
  const go = (to: number) => {
    // Move immediately; progress is saved in the background.
    if (to > idx) void markDone(current);
    setActive(sections[Math.max(0, Math.min(sections.length - 1, to))]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const complete = async () => {
    setCompleting(true);
    try {
      const r = await post<{ achievements: Achievement[]; next: { id: number; title: string } | null; reviewItemsAdded: number }>(`/lessons/${lesson.id}/complete`);
      celebrate(r.achievements, lang);
      setCompleted({ next: r.next, added: r.reviewItemsAdded });
      setData((d) => (d ? { ...d, status: 'completed', sectionsDone: [...new Set([...d.sectionsDone, 'review'])] } : d));
    } finally {
      setCompleting(false);
    }
  };

  const quizDone = data.quizScore !== null || !lesson.quiz;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-muted">
        <Link to="/learn" className="hover:text-ink">
          {L('Сургалтын зам', 'Learn')}
        </Link>
        <span>/</span>
        <span className="truncate">
          {L('Модуль', 'Module')} {lesson.module.order} · {lesson.module.title}
        </span>
      </div>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="jp text-sm font-medium text-shu">{lesson.titleJa}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            <span className="mr-2 text-muted tabular-nums">{String(lesson.globalOrder).padStart(2, '0')}</span>
            {lesson.title}
          </h1>
        </div>
        <div className="flex items-center gap-3 sm:w-64">
          <ProgressBar value={doneCount} max={sections.length} tone={data.status === 'completed' ? 'matcha' : 'shu'} />
          <span className="shrink-0 text-sm tabular-nums text-muted">
            {doneCount}/{sections.length}
          </span>
        </div>
      </header>

      {/* Section stepper */}
      <nav className="-mx-4 mb-5 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0" aria-label={L('Хичээлийн хэсгүүд', 'Lesson sections')}>
        <ol className="flex min-w-max gap-1.5">
          {sections.map((s, i) => {
            const done = data.sectionsDone.includes(s);
            return (
              <li key={s}>
                <button
                  onClick={() => setActive(s)}
                  className={cx(
                    'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    s === current ? 'border-shu bg-shu text-white' : done ? 'border-matcha/30 bg-matcha-soft text-matcha' : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                  )}
                  aria-current={s === current ? 'step' : undefined}
                >
                  {done && s !== current ? <Check className="size-3.5" /> : <span className="tabular-nums opacity-70">{i + 1}</span>}
                  {L(...SECTION_LABELS[s])}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {idx === 0 && <Overview data={data} />}

      <section className="min-h-[40vh]">
        {current === 'kana' && <KanaSection kana={lesson.kana} />}
        {current === 'vocabulary' && (
          <ul className="flex flex-col gap-2">
            {lesson.vocabulary.map((v) => (
              <VocabItem key={v.id} v={v} />
            ))}
          </ul>
        )}
        {current === 'grammar' && (
          <div className="flex flex-col gap-4">
            {lesson.grammar.map((g) => (
              <GrammarBlock key={g.id} g={{ ...g, lesson: null, _count: { questions: 0 }, state: null }} compact />
            ))}
          </div>
        )}
        {current === 'kanji' && <KanjiSection data={data} />}
        {current === 'examples' && <ExamplesSection data={data} />}
        {current === 'practice' && <Flashcards key={lesson.id} cards={cards} onFinish={() => void markDone('practice')} />}
        {current === 'quiz' && lesson.quiz && (
          <QuizRunner
            quizId={lesson.quiz.id}
            onFinished={(a) => setData((d) => (d ? { ...d, quizScore: Math.max(d.quizScore ?? 0, a.percent), sectionsDone: [...new Set([...d.sectionsDone, 'quiz'])], status: d.status === 'completed' ? 'completed' : 'in_progress' } : d))}
          />
        )}
        {current === 'review' && (
          <Card className="flex flex-col gap-5">
            {completed || data.status === 'completed' ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="grid size-16 place-items-center rounded-full bg-matcha-soft text-matcha">
                  <PartyPopper className="size-8" />
                </span>
                <h2 className="text-xl font-semibold text-ink">{L('Хичээл дууслаа!', 'Lesson complete!')}</h2>
                {completed && completed.added > 0 && <p className="text-sm text-muted">{L(`${completed.added} зүйл давталтын жагсаалтад нэмэгдлээ.`, `${completed.added} items were added to your review deck.`)}</p>}
                <div className="flex flex-wrap justify-center gap-2">
                  {(completed?.next ?? data.next) && (
                    <Button onClick={() => navigate(`/lessons/${(completed?.next ?? data.next)!.id}`)}>
                      {L('Дараагийн хичээл', 'Next lesson')}: {(completed?.next ?? data.next)!.title}
                      <ArrowRight className="size-4" />
                    </Button>
                  )}
                  <LinkButton to="/review" variant="secondary">
                    {L('Давталт хийх', 'Go to review')}
                  </LinkButton>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-ink">{L('Хичээлийн дүгнэлт', 'Lesson summary')}</h2>
                  <p className="text-sm text-muted">{L('Хичээлийг дуусгахад доорх зүйлс таны давталтын жагсаалтад нэмэгдэнэ.', 'Completing the lesson adds these items to your review deck.')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    [lesson.kana.length, L('Үсэг', 'Kana')],
                    [lesson.vocabulary.length, L('Үг', 'Words')],
                    [lesson.kanji.length, L('Ханз', 'Kanji')],
                    [lesson.grammar.length, L('Дүрэм', 'Grammar')],
                  ].map(([n, label]) => (
                    <div key={String(label)} className="rounded-xl bg-surface-2 p-3 text-center">
                      <p className="text-2xl font-semibold tabular-nums text-ink">{n}</p>
                      <p className="text-xs text-muted">{label}</p>
                    </div>
                  ))}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {lesson.objectives.map((o) => (
                    <li key={o} className="flex items-center gap-2 text-sm text-ink-2">
                      <Check className="size-4 text-matcha" />
                      {o}
                    </li>
                  ))}
                </ul>
                {lesson.quiz && (
                  <div className="flex items-center justify-between rounded-xl border border-line p-3 text-sm">
                    <span className="text-ink-2">{L('Мини шалгалт', 'Mini quiz')}</span>
                    {data.quizScore !== null ? (
                      <Badge tone={data.quizScore >= 80 ? 'matcha' : 'yamabuki'}>{data.quizScore}%</Badge>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setActive('quiz')}>
                        {L('Шалгалт өгөх', 'Take the quiz')}
                      </Button>
                    )}
                  </div>
                )}
                {data.quizScore !== null && data.quizScore < 80 && <p className="text-sm text-yamabuki">{L('Зөвлөмж: 80%-иас доош байна. Дүрэм, үгсээ давтаад шалгалтаа дахин өгөөрэй.', 'Tip: below 80%. Review the material and retake the quiz.')}</p>}
                <Button size="lg" onClick={complete} loading={completing} disabled={!quizDone}>
                  <CheckCircle2 className="size-5" />
                  {L('Хичээлийг дуусгах', 'Complete lesson')}
                </Button>
                {!quizDone && <p className="-mt-3 text-center text-xs text-muted">{L('Эхлээд мини шалгалтаа өгнө үү.', 'Take the mini quiz first.')}</p>}
              </>
            )}
          </Card>
        )}
      </section>

      {/* Section navigation */}
      {current !== 'quiz' && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => go(idx - 1)} disabled={idx === 0}>
            <ArrowLeft className="size-4" />
            {L('Өмнөх', 'Previous')}
          </Button>
          {idx < sections.length - 1 && (
            <Button onClick={() => go(idx + 1)}>
              {L('Дараах', 'Next')}: {L(...SECTION_LABELS[sections[idx + 1]])}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      )}
      {current === 'quiz' && data.quizScore !== null && (
        <div className="mt-6 flex justify-end">
          <Button onClick={() => go(idx + 1)}>
            {L('Дүгнэлт рүү', 'Go to summary')}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      <div className="mt-10 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
        {data.prev ? (
          <Link to={`/lessons/${data.prev.id}`} className="rounded-2xl border border-line bg-surface p-4 hover:border-ink-2/30">
            <p className="text-xs text-muted">← {L('Өмнөх хичээл', 'Previous lesson')}</p>
            <p className="truncate font-medium text-ink">{data.prev.title}</p>
          </Link>
        ) : (
          <span />
        )}
        {data.next &&
          (data.next.status === 'locked' ? (
            <div className="rounded-2xl border border-dashed border-line p-4 text-right opacity-70">
              <p className="flex items-center justify-end gap-1 text-xs text-muted">
                <Lock className="size-3" />
                {L('Дараагийн хичээл', 'Next lesson')}
              </p>
              <p className="truncate font-medium text-muted">{data.next.title}</p>
            </div>
          ) : (
            <Link to={`/lessons/${data.next.id}`} className="rounded-2xl border border-line bg-surface p-4 text-right hover:border-ink-2/30">
              <p className="text-xs text-muted">{L('Дараагийн хичээл', 'Next lesson')} →</p>
              <p className="truncate font-medium text-ink">{data.next.title}</p>
            </Link>
          ))}
      </div>
    </div>
  );
}
