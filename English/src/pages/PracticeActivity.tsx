import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { DictationActivity } from '../components/activities/Dictation';
import { ShadowingActivity } from '../components/activities/Shadowing';
import { GrammarReview } from '../components/activities/GrammarReview';
import { MistakesReview } from '../components/activities/MistakesReview';
import { ChallengeActivity } from '../components/activities/Challenge';
import { ListeningPractice, PronunciationPractice, ReadingPractice, SpeakingPractice, WritingPractice } from '../components/activities/PracticeWrappers';
import { ErrorState, useDocumentTitle } from '../components/ui';

const TITLES: Record<string, string> = {
  dictation: 'Dictation',
  shadowing: 'Shadowing',
  grammar: 'Grammar review',
  mistakes: 'Fix my mistakes',
  challenge: 'Daily challenge',
  listening: 'Listening practice',
  reading: 'Reading practice',
  speaking: 'Speaking practice',
  writing: 'Writing practice',
  pronunciation: 'Pronunciation',
};

export default function PracticeActivity() {
  const { activity, id } = useParams<{ activity: string; id?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const title = TITLES[activity ?? ''] ?? 'Practice';
  useDocumentTitle(title);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    navigate('/practice');
  };

  let body: React.ReactNode;
  switch (activity) {
    case 'dictation':
      body = <DictationActivity count={6} onComplete={done} />;
      break;
    case 'shadowing':
      body = <ShadowingActivity count={5} onComplete={done} />;
      break;
    case 'grammar':
      body = <GrammarReview count={10} onComplete={done} />;
      break;
    case 'mistakes':
      body = <MistakesReview limit={10} onComplete={done} />;
      break;
    case 'challenge':
      body = <ChallengeActivity onComplete={done} />;
      break;
    case 'listening':
      body = id ? <ListeningPractice id={id} onDone={done} /> : null;
      break;
    case 'reading':
      body = id ? <ReadingPractice id={id} onDone={done} /> : null;
      break;
    case 'speaking':
      body = id ? <SpeakingPractice id={id} onDone={done} /> : null;
      break;
    case 'writing':
      body = id ? <WritingPractice id={id} onDone={done} /> : null;
      break;
    case 'pronunciation':
      body = id ? <PronunciationPractice id={id} onDone={done} /> : null;
      break;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-4 sm:px-6">
      <header className="mb-5 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-2" aria-label="Back">
          <X className="size-5" />
        </button>
        <h1 className="text-xl font-bold">{title}</h1>
      </header>
      {body ?? <ErrorState error={new Error('This practice activity does not exist.')} />}
    </div>
  );
}
