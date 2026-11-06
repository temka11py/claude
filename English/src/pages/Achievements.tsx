import { useQuery } from '@tanstack/react-query';
import { AudioLines, BookOpen, Brain, CalendarCheck, Compass, Ear, FileText, Flag, Flame, Gamepad2, GraduationCap, Languages, Library, LockOpen, MessagesSquare, Mic, Mountain, NotebookPen, PenLine, Sparkles, Swords, Target, TreeDeciduous, Trophy, Wrench } from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'audio-lines': AudioLines, 'book-open': BookOpen, brain: Brain, 'calendar-check': CalendarCheck, compass: Compass, ear: Ear, 'file-text': FileText, flag: Flag, flame: Flame,
  'gamepad-2': Gamepad2, 'graduation-cap': GraduationCap, languages: Languages, library: Library, 'lock-open': LockOpen, 'messages-square': MessagesSquare, mic: Mic,
  mountain: Mountain, 'notebook-pen': NotebookPen, 'pen-line': PenLine, sparkles: Sparkles, swords: Swords, target: Target, 'tree-deciduous': TreeDeciduous, trophy: Trophy, wrench: Wrench,
};
import { get } from '../lib/api';
import type { Dashboard } from '../lib/types';
import { Card, ErrorState, PageHeader, ProgressBar, SkeletonCard, clsx, useDocumentTitle } from '../components/ui';

interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  xp: number;
  unlockedAt: string | null;
}

function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Trophy;
  return <C className={className} />;
}

const CATEGORY_LABEL: Record<string, string> = { milestone: 'Milestones', learning: 'Learning', vocabulary: 'Vocabulary', streak: 'Consistency', skills: 'Skills' };

export default function Achievements() {
  const q = useQuery({ queryKey: ['achievements'], queryFn: () => get<Achievement[]>('/achievements') });
  const d = useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dashboard>('/dashboard') });
  useDocumentTitle('Achievements');
  if (q.isLoading) return <SkeletonCard lines={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const groups = Object.entries(
    q.data.reduce<Record<string, Achievement[]>>((acc, a) => {
      (acc[a.category] ??= []).push(a);
      return acc;
    }, {}),
  );
  const earned = q.data.filter((a) => a.unlockedAt).length;
  return (
    <div>
      <PageHeader title="Achievements" subtitle={`${earned} of ${q.data.length} unlocked`} />
      {d.data && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Rank {d.data.xp.rank.level}</div>
              <div className="text-xl font-bold">{d.data.xp.rank.title}</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold">{d.data.xp.xp.toLocaleString()} XP</div>
              {d.data.xp.nextRank && <div className="text-xs text-muted">Next: {d.data.xp.nextRank.title}</div>}
            </div>
          </div>
          {d.data.xp.nextRank && <ProgressBar value={d.data.xp.progress} color="bg-accent" className="mt-3" label="Progress to next rank" />}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-surface-2 p-2">
              <div className="font-bold">{d.data.streak.current}</div>
              <div className="text-xs text-muted">current streak</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-2">
              <div className="font-bold">{d.data.streak.longest}</div>
              <div className="text-xs text-muted">longest streak</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-2">
              <div className="font-bold">{d.data.streak.freezes}</div>
              <div className="text-xs text-muted">streak freezes</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">You earn a streak freeze every 7 study days (hold up to 2). It protects your streak automatically if you miss a day.</p>
        </Card>
      )}
      <div className="space-y-6">
        {groups.map(([cat, list]) => (
          <section key={cat}>
            <h2 className="mb-2 text-lg font-semibold">{CATEGORY_LABEL[cat] ?? cat}</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((a) => (
                <li key={a.code} className={clsx('flex items-start gap-3 rounded-2xl p-4 ring-1', a.unlockedAt ? 'bg-surface ring-accent/40' : 'bg-surface-2/50 ring-border')}>
                  <span className={clsx('flex size-11 shrink-0 items-center justify-center rounded-xl', a.unlockedAt ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted opacity-60')}>
                    <Icon name={a.icon} className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className={clsx('font-semibold', !a.unlockedAt && 'text-muted')}>{a.title}</div>
                    <div className="text-sm text-muted">{a.description}</div>
                    <div className="mt-1 text-xs text-muted">{a.unlockedAt ? `Unlocked ${new Date(a.unlockedAt).toLocaleDateString()}` : `+${a.xp} XP`}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
