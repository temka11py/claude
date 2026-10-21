import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, BookOpenCheck, CheckCircle2, Pause, Play, Plus } from 'lucide-react';
import { post } from '../api/client';
import type { Achievement, StoryDetail, StoryToken } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../i18n';
import { posLabel } from '../lib/labels';
import { speakScript, stopAudio, ttsSupported } from '../lib/speech';
import { Badge, Button, Card, ErrorState, Modal, PageHeader, Ruby, Segmented, SpeakButton, Spinner, cx } from '../components/ui';
import { useItemActions } from '../components/cards';
import { QuizRunner } from '../components/quiz/runners';

interface StoryListItem {
  id: number;
  slug: string;
  title: string;
  titleJa: string;
  topic: string;
  summary: string;
  sentenceCount: number;
  completed: boolean;
  bestScore: number | null;
}

export function Stories() {
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<{ stories: StoryListItem[] }>('/stories');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const done = data.stories.filter((s) => s.completed).length;
  return (
    <div>
      <PageHeader
        titleJa="よみもの"
        title={L('Өгүүллэг', 'Stories')}
        subtitle={L('N5 түвшний богино өгүүллэгүүд. Фуригана, ромаджи, орчуулгыг хэрэгтэй үедээ л нээгээрэй.', 'Short N5 stories. Reveal furigana, romaji and translation only when you need them.')}
        actions={
          <div className="rounded-xl border border-line bg-surface px-4 py-2 text-sm">
            <span className="font-semibold tabular-nums text-ink">{done}</span>
            <span className="text-muted">
              {' '}
              / {data.stories.length} {L('уншсан', 'read')}
            </span>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.stories.map((s, i) => (
          <Link key={s.id} to={`/stories/${s.slug}`} className="group flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-shu">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold tabular-nums text-muted">{String(i + 1).padStart(2, '0')}</span>
              {s.completed ? (
                <Badge tone="matcha">
                  <CheckCircle2 className="size-3" />
                  {s.bestScore !== null ? `${s.bestScore}%` : L('Уншсан', 'Read')}
                </Badge>
              ) : (
                <Badge>{s.topic}</Badge>
              )}
            </div>
            <p className="jp text-2xl font-medium text-ink group-hover:text-shu">{s.titleJa}</p>
            <p className="font-medium text-ink-2">{s.title}</p>
            <p className="line-clamp-2 text-sm text-muted">{s.summary}</p>
            <p className="mt-auto pt-1 text-xs text-muted">
              {s.sentenceCount} {L('өгүүлбэр', 'sentences')}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function TokenInfo({ token, story }: { token: StoryToken; story: StoryDetail }) {
  const { L, lang } = useI18n();
  const actions = useItemActions();
  const vocab = token.vocabId ? story.vocabulary.find((v) => v.id === token.vocabId) : undefined;
  if (vocab) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <p className="text-3xl font-medium text-ink">
            <Ruby text={vocab.word} reading={vocab.word !== vocab.kana ? vocab.kana : undefined} show />
          </p>
          <SpeakButton text={vocab.kana} />
        </div>
        <p className="text-sm text-muted">{vocab.romaji}</p>
        <p className="text-lg font-semibold text-ink">{lang === 'en' ? vocab.meaningEn : vocab.meaning}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{posLabel(vocab.partOfSpeech, lang)}</Badge>
          {token.s !== vocab.word && (
            <span className="text-xs text-muted">
              {L('Текст дэх хэлбэр:', 'Form in text:')} <span className="jp">{token.s}</span>
            </span>
          )}
        </div>
        <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={() => actions.addToReview('vocab', vocab.id)}>
          <Plus className="size-4" />
          {L('Давталтад нэмэх', 'Add to review')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <p className="text-3xl font-medium text-ink">
          <Ruby text={token.s} reading={token.r} show />
        </p>
        <SpeakButton text={token.r ?? token.s} />
      </div>
      {token.ro && <p className="text-sm text-muted">{token.ro}</p>}
      <p className="text-lg text-ink">{token.gloss}</p>
    </div>
  );
}

export function StoryPage() {
  const { slug = '' } = useParams();
  const { L, lang } = useI18n();
  const { settings } = useAuth();
  const { celebrate } = useToast();
  const { data, error, loading, reload, setData } = useApi<{ story: StoryDetail }>(`/stories/${slug}`);
  const [furigana, setFurigana] = useState(settings.showFurigana);
  const [romaji, setRomaji] = useState(false);
  const [translation, setTranslation] = useState(false);
  const [selected, setSelected] = useState<StoryToken | null>(null);
  const [tab, setTab] = useState<'vocab' | 'kanji' | 'grammar' | 'quiz'>('vocab');
  const [playing, setPlaying] = useState<number | 'all' | null>(null);

  useEffect(() => () => stopAudio(), []);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.status === 404 ? L('Өгүүллэг олдсонгүй', 'Story not found') : error.message} onRetry={reload} />;
  if (!data) return null;
  const story = data.story;
  const sentenceText = (i: number) => story.sentences[i].tokens.map((t) => t.r ?? t.s).join('');

  const playAll = async () => {
    if (playing !== null) {
      stopAudio();
      setPlaying(null);
      return;
    }
    setPlaying('all');
    await speakScript(story.sentences.map((_, i) => ({ speaker: '', text: sentenceText(i) })), settings.speechRate);
    setPlaying(null);
  };
  const markRead = async () => {
    const r = await post<{ achievements: Achievement[] }>(`/stories/${story.slug}/complete`);
    celebrate(r.achievements, lang);
    setData((d) => (d ? { story: { ...d.story, completed: true } } : d));
  };

  const Chip = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
    <button onClick={() => set(!on)} aria-pressed={on} className={cx('rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors', on ? 'border-ai bg-ai-soft text-ai' : 'border-line bg-surface text-ink-2 hover:bg-surface-2')}>
      {label}
    </button>
  );

  return (
    <div>
      <Link to="/stories" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {L('Бүх өгүүллэг', 'All stories')}
      </Link>
      <header className="mb-5">
        <p className="jp text-3xl font-medium text-ink sm:text-4xl">{story.titleJa}</p>
        <p className="mt-1 text-lg font-medium text-ink-2">{story.title}</p>
        <p className="mt-1 text-sm text-muted">{story.summary}</p>
      </header>

      <div className="sticky top-14 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-y border-line bg-paper/95 px-4 py-2.5 backdrop-blur lg:top-0 lg:mx-0 lg:rounded-2xl lg:border lg:px-3">
        <Chip on={furigana} set={setFurigana} label={L('Фуригана', 'Furigana')} />
        <Chip on={romaji} set={setRomaji} label={L('Ромаджи', 'Romaji')} />
        <Chip on={translation} set={setTranslation} label={L('Орчуулга', 'Translation')} />
        {ttsSupported && (
          <Button variant="secondary" size="sm" className="ml-auto" onClick={playAll}>
            {playing === 'all' ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playing === 'all' ? L('Зогсоох', 'Stop') : L('Бүгдийг сонсох', 'Play all')}
          </Button>
        )}
      </div>

      <Card className="mb-5 p-5 sm:p-8">
        <p className="mb-4 text-xs text-muted">{L('Үг дээр дарж утгыг нь хараарай.', 'Tap any word to see its meaning.')}</p>
        <div className="flex flex-col gap-5">
          {story.sentences.map((s, i) => (
            <div key={i} className="group flex items-start gap-2">
              <SpeakButton text={sentenceText(i)} size="sm" className="mt-1.5 opacity-60 group-hover:opacity-100" />
              <div className="min-w-0">
                <p className={cx('jp text-xl text-ink sm:text-2xl', furigana ? 'leading-[2.4]' : 'leading-relaxed')}>
                  {s.tokens.map((t, j) =>
                    t.vocabId || t.gloss ? (
                      <button key={j} onClick={() => setSelected(t)} className={cx('rounded px-px transition-colors hover:bg-shu-soft hover:text-shu', selected === t && 'bg-shu-soft text-shu')}>
                        <Ruby text={t.s} reading={t.r} show={furigana} />
                      </button>
                    ) : (
                      <span key={j}>{t.s}</span>
                    ),
                  )}
                </p>
                {romaji && <p className="mt-0.5 text-sm text-ai">{s.tokens.filter((t) => t.ro).map((t) => t.ro).join(' ')}</p>}
                {translation && <p className="mt-0.5 text-sm text-muted">{s.mn}</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end border-t border-line pt-4">
          {story.completed ? (
            <Badge tone="matcha">
              <CheckCircle2 className="size-3.5" />
              {L('Уншсан', 'Read')}
            </Badge>
          ) : (
            <Button variant="secondary" onClick={markRead}>
              <BookOpenCheck className="size-4" />
              {L('Уншиж дууслаа', 'Mark as read')}
            </Button>
          )}
        </div>
      </Card>

      <div className="mb-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'vocab', label: L(`Үгс (${story.vocabulary.length})`, `Words (${story.vocabulary.length})`) },
            { value: 'kanji', label: L(`Ханз (${story.kanji.length})`, `Kanji (${story.kanji.length})`) },
            { value: 'grammar', label: L('Дүрэм', 'Grammar') },
            { value: 'quiz', label: L('Асуулт', 'Questions') },
          ]}
        />
      </div>
      {tab === 'vocab' && (
        <Card>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {story.vocabulary.map((v) => (
              <li key={v.id} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
                <SpeakButton text={v.kana} size="sm" />
                <span className="jp font-medium text-ink">{v.word}</span>
                {v.word !== v.kana && <span className="jp text-sm text-muted">{v.kana}</span>}
                <span className="ml-auto text-right text-sm text-ink-2">{lang === 'en' ? v.meaningEn : v.meaning}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {tab === 'kanji' && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
          {story.kanji.map((k) => (
            <Link key={k.id} to={`/kanji/${encodeURIComponent(k.char)}`} className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-surface p-3 hover:border-shu">
              <span className="brush text-3xl text-ink">{k.char}</span>
              <span className="text-xs text-muted">{k.meaning}</span>
            </Link>
          ))}
        </div>
      )}
      {tab === 'grammar' && (
        <Card>
          <ul className="flex flex-col gap-3">
            {story.grammarNotes.map((g) => (
              <li key={g.point}>
                <p className="jp font-semibold text-ink">{g.point}</p>
                <p className="text-sm text-ink-2">{g.explanation}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {tab === 'quiz' && story.quizId && <QuizRunner quizId={story.quizId} onFinished={() => setData((d) => (d ? { story: { ...d.story, completed: true } } : d))} />}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={L('Үгийн тайлбар', 'Word')}>
        {selected && <TokenInfo token={selected} story={story} />}
      </Modal>
    </div>
  );
}
