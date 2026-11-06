import { useMemo, useState } from 'react';
import { seededRandom, shuffle } from '@shared/text';
import { clsx } from '../ui';

export interface MatchPair {
  id: string;
  left: string;
  right: string;
}

/** Tap a left card, then its partner on the right. Matched pairs lock in. */
export function MatchGame({ pairs, seed, onDone, rightLabel }: { pairs: MatchPair[]; seed: string; onDone: (r: { firstTry: Record<string, boolean>; mistakes: number }) => void; rightLabel?: string }) {
  const rights = useMemo(() => shuffle(pairs, seededRandom(`${seed}:r`)), [pairs, seed]);
  const lefts = useMemo(() => shuffle(pairs, seededRandom(`${seed}:l`)), [pairs, seed]);
  const [active, setActive] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [missed, setMissed] = useState<Record<string, boolean>>({});
  const [mistakes, setMistakes] = useState(0);

  function pickRight(id: string) {
    if (!active || matched.includes(id)) return;
    if (active === id) {
      const m = [...matched, id];
      setMatched(m);
      setActive(null);
      if (m.length === pairs.length) {
        const firstTry: Record<string, boolean> = {};
        for (const p of pairs) firstTry[p.id] = !missed[p.id];
        setTimeout(() => onDone({ firstTry, mistakes }), 450);
      }
    } else {
      setWrong(id);
      setMissed({ ...missed, [active]: true });
      setMistakes(mistakes + 1);
      setTimeout(() => setWrong(null), 450);
    }
  }

  const card = 'w-full rounded-xl px-3 py-3 text-left text-[15px] ring-1 transition active:scale-[0.98] min-h-12';
  return (
    <div>
      <div className="mb-2 grid grid-cols-2 gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <span>English</span>
        <span>{rightLabel ?? 'Meaning'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {lefts.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={matched.includes(p.id)}
              onClick={() => setActive(active === p.id ? null : p.id)}
              aria-pressed={active === p.id}
              className={clsx(card, matched.includes(p.id) ? 'bg-success-soft text-success ring-success/30' : active === p.id ? 'bg-primary-soft ring-2 ring-primary' : 'bg-surface ring-border hover:ring-primary/60', 'font-semibold')}
            >
              {p.left}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {rights.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={matched.includes(p.id)}
              onClick={() => pickRight(p.id)}
              className={clsx(
                card,
                matched.includes(p.id) ? 'bg-success-soft text-success ring-success/30' : wrong === p.id ? 'animate-shake bg-danger-soft ring-danger' : 'bg-surface ring-border hover:ring-primary/60',
              )}
            >
              {p.right}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        {matched.length}/{pairs.length} matched{mistakes ? ` · ${mistakes} mistake${mistakes === 1 ? '' : 's'}` : ''}
      </p>
    </div>
  );
}
