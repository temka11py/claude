import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { GAMES } from '@shared/sessionPlanner';
import { GameHost } from '../components/games/GameHost';
import { useDocumentTitle } from '../components/ui';

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const game = GAMES.find((g) => g.id === id);
  useDocumentTitle(game?.title ?? 'Game');
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-4 sm:px-6">
      <header className="mb-5 flex items-center gap-3">
        <button type="button" onClick={() => navigate('/practice')} className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-2" aria-label="Back to practice">
          <X className="size-5" />
        </button>
        <h1 className="text-xl font-bold">{game?.title ?? 'Game'}</h1>
      </header>
      <GameHost
        gameId={id!}
        onFinish={() => {
          void qc.invalidateQueries({ queryKey: ['games'] });
          navigate('/practice');
        }}
      />
    </div>
  );
}
