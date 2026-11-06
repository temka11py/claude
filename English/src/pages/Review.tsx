import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, Layers, Shuffle } from 'lucide-react';
import { get } from '../lib/api';
import type { VocabCounts } from '../lib/types';
import { ReviewDeck } from '../components/activities/ReviewDeck';
import { Button, Card, PageHeader, Segmented, Stat, useDocumentTitle } from '../components/ui';
import { pendingCount } from '../lib/offline';

export default function Review() {
  const stats = useQuery({ queryKey: ['vocab', 'stats'], queryFn: () => get<VocabCounts>('/vocab/stats') });
  const [mode, setMode] = useState<'mixed' | 'flashcards'>('mixed');
  const [size, setSize] = useState<'10' | '20' | '40'>('20');
  const [running, setRunning] = useState(false);
  useDocumentTitle('Review');
  const s = stats.data;
  const offline = pendingCount();

  return (
    <div>
      <PageHeader title="Vocabulary review" subtitle="Spaced repetition: each word returns just before you would forget it." />
      {!running ? (
        <div className="space-y-4">
          {s && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Due now" value={s.due} icon={<Brain className="size-3.5" />} />
              <Stat label="Learning" value={s.byState.LEARNING + s.byState.REVIEW} />
              <Stat label="Familiar" value={s.byState.FAMILIAR} />
              <Stat label="Mastered" value={s.byState.MASTERED} />
            </div>
          )}
          <Card className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-semibold">Review style</div>
              <Segmented
                label="Review style"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'mixed', label: 'Mixed exercises', hint: 'Recommended — targets each word’s weak side' },
                  { value: 'flashcards', label: 'Flashcards', hint: 'Again / Hard / Good / Easy' },
                ]}
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold">How many words?</div>
              <Segmented
                label="Number of words"
                value={size}
                onChange={setSize}
                options={[
                  { value: '10', label: '10', hint: '~4 min' },
                  { value: '20', label: '20', hint: '~7 min' },
                  { value: '40', label: '40', hint: '~14 min' },
                ]}
              />
            </div>
            <Button block size="lg" onClick={() => setRunning(true)} icon={mode === 'mixed' ? <Shuffle className="size-5" /> : <Layers className="size-5" />}>
              {s?.due ? `Start review (${Math.min(Number(size), s.due)} words)` : 'Start review'}
            </Button>
            {offline > 0 && <p className="text-xs text-muted">{offline} answers saved offline will be sent when you're back online.</p>}
          </Card>
          <Card>
            <h2 className="font-semibold">How reviews are scheduled</h2>
            <p className="mt-1 text-sm text-muted">
              New words come back the same day, then after about 2, 7, 14 and 30 days. Words you find easy space out faster; words you forget come back sooner and more often. A word
              counts as <strong>mastered</strong> only after you have recognised it, recalled it, used it in context and written it yourself — spaced over weeks.
            </p>
          </Card>
        </div>
      ) : (
        <Card>
          <ReviewDeck limit={Number(size)} mode={mode} />
          <div className="mt-6 text-center">
            <button type="button" className="text-sm font-semibold text-muted hover:text-text" onClick={() => setRunning(false)}>
              Stop reviewing
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
