import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AudioLines, BookOpen, Ear, Gamepad2, Lock, Mic, PenLine, Puzzle, Repeat, Swords, Target, Wrench } from 'lucide-react';
import { get } from '../lib/api';
import type { GameInfo, PracticeLibrary } from '../lib/types';
import { Badge, Card, EmptyState, PageHeader, SectionTitle, SkillBadge, Spinner, clsx, useDocumentTitle } from '../components/ui';

function Tile({ to, icon, title, body, badge, disabled }: { to: string; icon: React.ReactNode; title: string; body: string; badge?: React.ReactNode; disabled?: string | null }) {
  const inner = (
    <div className={clsx('flex h-full items-start gap-3 rounded-2xl bg-surface p-4 ring-1 ring-border transition', disabled ? 'opacity-60' : 'hover:-translate-y-0.5 hover:ring-primary/60 hover:shadow-sm')}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">{icon}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-semibold">
          {title} {badge}
        </div>
        <p className="text-sm text-muted">{disabled ?? body}</p>
      </div>
    </div>
  );
  return disabled ? <div aria-disabled>{inner}</div> : <Link to={to}>{inner}</Link>;
}

const GAME_ICONS: Record<string, React.ReactNode> = {
  boss: <Swords className="size-5" />,
  'grammar-duel': <Swords className="size-5" />,
  'sentence-builder': <Puzzle className="size-5" />,
  'listening-detective': <Ear className="size-5" />,
};

const GAME_BODY: Record<string, string> = {
  'word-match': 'Match words with meanings as fast as you can.',
  memory: 'Flip cards to find word pairs.',
  speed: 'How many words in 60 seconds?',
  collocation: 'Which words go together?',
  'synonym-battle': 'Closest meaning or opposite — five lives.',
  'missing-word': 'Pick the word that fits the sentence.',
  'word-builder': 'Build the word from its letters.',
  'sentence-builder': 'Put the words in the right order.',
  'grammar-duel': 'Beat the rival to the right answer.',
  'listening-detective': 'Listen and find the missing word.',
  'vocab-race': 'Race the pace line for 90 seconds.',
  boss: 'Defeat the boss with everything you know.',
};

export default function Practice() {
  const lib = useQuery({ queryKey: ['practice-library'], queryFn: () => get<PracticeLibrary>('/practice/library') });
  const games = useQuery({ queryKey: ['games'], queryFn: () => get<GameInfo[]>('/games') });
  useDocumentTitle('Practice');
  const l = lib.data;
  const noLessons = l && !l.listening.length && !l.reading.length && !l.speaking.length;

  return (
    <div className="space-y-6">
      <PageHeader title="Practice" subtitle="Extra practice with material you have already studied — pick anything that looks fun." />

      <section>
        <SectionTitle>Quick practice</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile to="/practice/challenge" icon={<Target className="size-5" />} title="Daily challenge" body="One special task every day." badge={<Badge tone="accent">+30 XP</Badge>} />
          <Tile to="/practice/mistakes" icon={<Wrench className="size-5" />} title="Fix my mistakes" body="Correct the errors you made before." />
          <Tile to="/practice/grammar" icon={<Repeat className="size-5" />} title="Grammar review" body="Mixed questions from your grammar topics." disabled={l && !l.grammarQuestions ? 'Complete a grammar lesson first.' : null} />
          <Tile to="/practice/dictation" icon={<Ear className="size-5" />} title="Dictation" body="Listen and type — trains listening and spelling." disabled={l && !l.listening.length ? 'Complete a listening lesson first.' : null} />
          <Tile to="/practice/shadowing" icon={<AudioLines className="size-5" />} title="Shadowing" body="Listen, repeat, record, compare." disabled={l && !l.listening.length && !l.pronunciation.length ? 'Complete a lesson first.' : null} />
          <Tile to="/conversation" icon={<Mic className="size-5" />} title="Conversation" body="Role-play real situations." />
        </div>
      </section>

      <section>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Gamepad2 className="size-5" /> Games
          </span>
        </SectionTitle>
        {games.isLoading ? (
          <Spinner />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(games.data ?? []).map((g) => (
              <Tile
                key={g.id}
                to={`/games/${g.id}`}
                icon={g.available ? GAME_ICONS[g.id] ?? <Gamepad2 className="size-5" /> : <Lock className="size-5" />}
                title={g.title}
                body={`${GAME_BODY[g.id] ?? ''}${g.best !== null ? ` Best: ${Math.round(g.best * 100)}%` : ''}`}
                disabled={g.available ? null : g.requirement}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Skills library</SectionTitle>
        {lib.isLoading ? (
          <Spinner />
        ) : noLessons ? (
          <EmptyState title="Your library fills up as you learn" body="Listening, reading, speaking and writing tasks from completed lessons appear here for extra practice." />
        ) : (
          l && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <SkillBadge skill="listening" /> Listening
                </h3>
                <ul className="space-y-1">
                  {l.listening.map((m) => (
                    <li key={m.id}>
                      <Link to={`/practice/listening/${m.id}`} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                        {m.title} <span className="text-xs text-muted">· {m.level}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <SkillBadge skill="reading" /> Reading
                </h3>
                <ul className="space-y-1">
                  {l.reading.map((m) => (
                    <li key={m.id}>
                      <Link to={`/practice/reading/${m.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                        <BookOpen className="size-3.5 text-muted" /> {m.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <SkillBadge skill="speaking" /> Speaking
                </h3>
                <ul className="space-y-1">
                  {(l.speaking as { id: string; prompt: string; type: string }[]).map((t) => (
                    <li key={t.id}>
                      <Link to={`/practice/speaking/${t.id}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                        <Mic className="mt-0.5 size-3.5 shrink-0 text-muted" /> <span className="line-clamp-2">{t.prompt}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <SkillBadge skill="writing" /> Writing
                </h3>
                <ul className="space-y-1">
                  {(l.writing as { id: string; prompt: string }[]).map((t) => (
                    <li key={t.id}>
                      <Link to={`/practice/writing/${t.id}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                        <PenLine className="mt-0.5 size-3.5 shrink-0 text-muted" /> <span className="line-clamp-2">{t.prompt}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
              {l.pronunciation.length > 0 && (
                <Card className="md:col-span-2">
                  <h3 className="mb-2 flex items-center gap-2 font-semibold">
                    <SkillBadge skill="pronunciation" /> Pronunciation
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(l.pronunciation as { id: string; title: string }[]).map((t) => (
                      <Link key={t.id} to={`/practice/pronunciation/${t.id}`} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm hover:bg-primary-soft">
                        {t.title}
                      </Link>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )
        )}
      </section>
    </div>
  );
}
