import { useQuery } from '@tanstack/react-query';
import { Award, Lock, Printer } from 'lucide-react';
import { get } from '../lib/api';
import type { SkillProfile } from '../lib/types';
import { SkillLevels } from '../components/charts';
import { Button, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Spinner, minutesLabel, useDocumentTitle } from '../components/ui';

interface CertificateData {
  earned: boolean;
  completedAt: string | null;
  examScore: number | null;
  name: string;
  stats: { sessions: number; studyDays: number; minutes: number; lessons: number; wordsMastered: number; wordsLearned: number; modules: number; levelsPassed: string[] };
  skills: SkillProfile['skills'];
  requirement: string;
}

export default function Certificate() {
  const q = useQuery({ queryKey: ['certificate'], queryFn: () => get<CertificateData>('/certificate') });
  useDocumentTitle('C1 journey');
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  if (!c.earned) {
    return (
      <div>
        <PageHeader title="C1 journey completion" />
        <EmptyState
          icon={<Lock className="size-8" />}
          title="Not unlocked yet"
          body={`${c.requirement} So far: ${c.stats.lessons} lessons, ${c.stats.wordsLearned} words learned, levels passed: ${c.stats.levelsPassed.join(', ') || 'none yet'}.`}
          action={<ButtonLink to="/course">See your course</ButtonLink>}
        />
      </div>
    );
  }
  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden">
        <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>
      <Card className="mx-auto max-w-3xl p-8 text-center sm:p-12">
        <Award className="mx-auto size-14 text-accent" />
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-muted">Personal learning achievement</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">C1 journey completed</h1>
        <p className="mt-4 text-lg">{c.name}</p>
        <p className="mt-1 text-muted">completed the Fluent Path course from B1 to C1 on {new Date(c.completedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
        <div className="mx-auto mt-8 grid max-w-xl grid-cols-2 gap-3 text-left sm:grid-cols-3">
          {[
            ['Study sessions', c.stats.sessions],
            ['Study days', c.stats.studyDays],
            ['Study time', minutesLabel(c.stats.minutes)],
            ['Lessons completed', c.stats.lessons],
            ['Modules completed', c.stats.modules],
            ['Words mastered', c.stats.wordsMastered],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">{k}</div>
              <div className="text-lg font-bold">{v}</div>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-md text-left">
          <h2 className="mb-2 font-semibold">Skills developed</h2>
          <SkillLevels skills={c.skills} onlyCore />
        </div>
        <p className="mx-auto mt-8 max-w-lg text-xs text-muted">
          This is a personal record of study within this app. It is not an official CEFR certificate. For an official certificate, take a recognised exam such as Cambridge C1 Advanced or IELTS.
        </p>
      </Card>
    </div>
  );
}
