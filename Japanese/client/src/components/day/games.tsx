import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Eraser, Lightbulb, RotateCcw, Trophy } from 'lucide-react';
import { useI18n } from '../../i18n';
import { formatClock } from '../../lib/format';
import { Button, Card, Jp, cx } from '../ui';

// ───────────────────────────── Sudoku ─────────────────────────────

const BOX: Record<number, [number, number]> = { 4: [2, 2], 6: [2, 3], 9: [3, 3] };

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A full valid grid: base pattern, then shuffled bands, rows, stacks, columns and symbols. */
function solvedGrid(n: number): number[][] {
  const [br, bc] = BOX[n];
  const pattern = (r: number, c: number) => (bc * (r % br) + Math.floor(r / br) + c) % n;
  const bands = shuffled([...Array(n / br).keys()]);
  const rows = bands.flatMap((b) => shuffled([...Array(br).keys()]).map((r) => b * br + r));
  const stacks = shuffled([...Array(n / bc).keys()]);
  const cols = stacks.flatMap((s) => shuffled([...Array(bc).keys()]).map((c) => s * bc + c));
  const symbols = shuffled([...Array(n).keys()]);
  return rows.map((r) => cols.map((c) => symbols[pattern(r, c)]));
}

function candidates(grid: (number | null)[][], r: number, c: number, n: number): number[] {
  const [br, bc] = BOX[n];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (grid[r][i] !== null) used.add(grid[r][i]!);
    if (grid[i][c] !== null) used.add(grid[i][c]!);
  }
  const r0 = r - (r % br);
  const c0 = c - (c % bc);
  for (let i = 0; i < br; i++) for (let j = 0; j < bc; j++) if (grid[r0 + i][c0 + j] !== null) used.add(grid[r0 + i][c0 + j]!);
  return [...Array(n).keys()].filter((v) => !used.has(v));
}

/** Number of solutions, stopping at `limit`. */
function countSolutions(grid: (number | null)[][], n: number, limit = 2): number {
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c] !== null) continue;
      let count = 0;
      for (const v of candidates(grid, r, c, n)) {
        grid[r][c] = v;
        count += countSolutions(grid, n, limit - count);
        grid[r][c] = null;
        if (count >= limit) return count;
      }
      return count;
    }
  }
  return 1;
}

/** Remove cells while the puzzle keeps exactly one solution. */
function makePuzzle(n: number, holes: number) {
  const solution = solvedGrid(n);
  const puzzle: (number | null)[][] = solution.map((row) => [...row]);
  let removed = 0;
  for (const idx of shuffled([...Array(n * n).keys()])) {
    if (removed >= holes) break;
    const r = Math.floor(idx / n);
    const c = idx % n;
    const keep = puzzle[r][c];
    puzzle[r][c] = null;
    if (countSolutions(puzzle.map((row) => [...row]), n) === 1) removed++;
    else puzzle[r][c] = keep;
  }
  return { solution, puzzle };
}

const HOLES: Record<number, number> = { 4: 9, 6: 20, 9: 45 };

export function Sudoku({ size, symbols, hints, onSolved }: { size: 4 | 6 | 9; symbols: string[]; hints: string[]; onSolved?: (seconds: number, mistakes: number) => void }) {
  const { L } = useI18n();
  const [seed, setSeed] = useState(0);
  const { solution, puzzle } = useMemo(() => makePuzzle(size, HOLES[size]), [size, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const [grid, setGrid] = useState(puzzle);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [start, setStart] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [solved, setSolved] = useState(false);
  const [br, bc] = BOX[size];

  useEffect(() => {
    setGrid(puzzle.map((row) => [...row]));
    setSel(null);
    setMistakes(0);
    setStart(Date.now());
    setSolved(false);
  }, [puzzle]);

  useEffect(() => {
    if (solved) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [solved]);

  const place = (v: number | null) => {
    if (!sel || solved) return;
    const [r, c] = sel;
    if (puzzle[r][c] !== null) return;
    const next = grid.map((row) => [...row]);
    next[r][c] = v;
    if (v !== null && v !== solution[r][c]) setMistakes((m) => m + 1);
    setGrid(next);
    if (next.every((row, i) => row.every((x, j) => x === solution[i][j]))) {
      setSolved(true);
      onSolved?.(Math.round((Date.now() - start) / 1000), mistakes + (v !== solution[r][c] ? 1 : 0));
    }
  };

  const hint = () => {
    const empty: [number, number][] = [];
    grid.forEach((row, r) => row.forEach((x, c) => x !== solution[r][c] && empty.push([r, c])));
    if (!empty.length) return;
    const [r, c] = sel && grid[sel[0]][sel[1]] !== solution[sel[0]][sel[1]] ? sel : empty[0];
    setSel([r, c]);
    const next = grid.map((row) => [...row]);
    next[r][c] = solution[r][c];
    setMistakes((m) => m + 1);
    setGrid(next);
    if (next.every((row, i) => row.every((x, j) => x === solution[i][j]))) {
      setSolved(true);
      onSolved?.(Math.round((Date.now() - start) / 1000), mistakes + 1);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= size) place(n - 1);
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') place(null);
      if (sel && e.key.startsWith('Arrow')) {
        const [r, c] = sel;
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key] ?? [0, 0];
        setSel([(r + d[0] + size) % size, (c + d[1] + size) % size]);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const conflict = (r: number, c: number) => {
    const v = grid[r][c];
    if (v === null || puzzle[r][c] !== null) return false;
    return v !== solution[r][c];
  };
  const cellSize = size === 9 ? 'size-9 text-xl sm:size-11 sm:text-2xl' : size === 6 ? 'size-12 text-2xl sm:size-14 sm:text-3xl' : 'size-16 text-3xl sm:size-20 sm:text-4xl';
  const selValue = sel ? grid[sel[0]][sel[1]] : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-md items-center justify-between text-sm text-muted">
        <span className="tabular-nums">⏱ {formatClock((now - start) / 1000)}</span>
        <span>
          {L('Алдаа', 'Mistakes')}: <span className="tabular-nums">{mistakes}</span>
        </span>
      </div>
      <div className="grid rounded-xl border-2 border-ink/70 bg-surface" style={{ gridTemplateColumns: `repeat(${size}, auto)` }} role="grid" aria-label="Sudoku">
        {grid.map((row, r) =>
          row.map((v, c) => {
            const given = puzzle[r][c] !== null;
            const isSel = sel?.[0] === r && sel?.[1] === c;
            const related = sel && (sel[0] === r || sel[1] === c || (Math.floor(sel[0] / br) === Math.floor(r / br) && Math.floor(sel[1] / bc) === Math.floor(c / bc)));
            const same = v !== null && v === selValue;
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => setSel([r, c])}
                className={cx(
                  'jp grid place-items-center border-line font-medium transition-colors',
                  cellSize,
                  c % bc === bc - 1 && c !== size - 1 ? 'border-r-2 border-r-ink/50' : c !== size - 1 && 'border-r',
                  r % br === br - 1 && r !== size - 1 ? 'border-b-2 border-b-ink/50' : r !== size - 1 && 'border-b',
                  isSel ? 'bg-ai-soft' : same ? 'bg-yamabuki-soft' : related ? 'bg-surface-2' : 'bg-surface',
                  given ? 'text-ink' : conflict(r, c) ? 'text-shu' : 'text-ai',
                )}
                aria-label={`${r + 1}-${c + 1}`}
              >
                {v !== null ? symbols[v] : ''}
              </button>
            );
          }),
        )}
      </div>
      {solved ? (
        <Card className="flex w-full max-w-md flex-col items-center gap-2 text-center">
          <Trophy className="size-8 text-yamabuki" />
          <p className="font-semibold text-ink">{L('Шийдлээ!', 'Solved!')}</p>
          <p className="text-sm text-muted">
            {formatClock((now - start) / 1000)} · {L('алдаа', 'mistakes')} {mistakes}
          </p>
          <Button variant="secondary" size="sm" onClick={() => setSeed((s) => s + 1)}>
            <RotateCcw className="size-4" />
            {L('Шинэ судоку', 'New puzzle')}
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid w-full max-w-md gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(size, 5)}, minmax(0, 1fr))` }}>
            {symbols.map((s, i) => (
              <button key={s} onClick={() => place(i)} className="flex flex-col items-center rounded-xl border border-line bg-surface py-2 transition-colors hover:border-ai hover:bg-ai-soft">
                <span className="jp text-2xl font-medium text-ink">{s}</span>
                <span className="jp text-[11px] text-muted">{hints[i]}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => place(null)}>
              <Eraser className="size-4" />
              {L('Арилгах', 'Erase')}
            </Button>
            <Button variant="ghost" size="sm" onClick={hint}>
              <Lightbulb className="size-4" />
              {L('Зөвлөгөө', 'Hint')}
            </Button>
          </div>
          <p className="max-w-md text-center text-xs text-muted">
            {L(
              `Мөр, багана, ${br}×${bc} хайрцаг бүрт тэмдэгт бүр яг нэг удаа орно. Нүд сонгоод доорх тэмдэгтийг дарна уу.`,
              `Every row, column and ${br}×${bc} box contains each symbol exactly once. Pick a cell, then a symbol.`,
            )}
          </p>
        </>
      )}
    </div>
  );
}

// ───────────────────────────── Match pairs ─────────────────────────────

export interface MatchPair {
  id: string;
  left: string; // Japanese
  right: string; // meaning / reading
  leftSub?: string;
}

export function MatchGame({ pairs, onDone, leftFurigana }: { pairs: MatchPair[]; onDone?: (score: number, seconds: number) => void; leftFurigana?: boolean }) {
  const { L } = useI18n();
  const [round, setRound] = useState(0);
  const left = useMemo(() => shuffled(pairs), [pairs, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const right = useMemo(() => shuffled(pairs), [pairs, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pickL, setPickL] = useState<string | null>(null);
  const [pickR, setPickR] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [start] = useState(Date.now());
  const done = matched.size === pairs.length;

  useEffect(() => {
    if (!pickL || !pickR) return;
    if (pickL === pickR) {
      setMatched((m) => new Set(m).add(pickL));
      setPickL(null);
      setPickR(null);
    } else {
      setMistakes((m) => m + 1);
      setWrong(`${pickL}|${pickR}`);
      const t = setTimeout(() => {
        setWrong(null);
        setPickL(null);
        setPickR(null);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [pickL, pickR]);

  useEffect(() => {
    if (done) onDone?.(Math.round((pairs.length / (pairs.length + mistakes)) * 100), Math.round((Date.now() - start) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const tile = (id: string, side: 'l' | 'r', content: ReactNode) => {
    const isMatched = matched.has(id);
    const picked = side === 'l' ? pickL === id : pickR === id;
    const isWrong = wrong && picked;
    return (
      <button
        key={`${side}-${id}`}
        disabled={isMatched || !!wrong}
        onClick={() => (side === 'l' ? setPickL(id) : setPickR(id))}
        className={cx(
          'min-h-14 rounded-xl border-2 px-3 py-2 text-center transition-all',
          isMatched ? 'border-matcha/30 bg-matcha-soft text-matcha opacity-60' : isWrong ? 'border-shu bg-shu-soft' : picked ? 'border-ai bg-ai-soft' : 'border-line bg-surface hover:border-ink-2/40',
        )}
      >
        {content}
      </button>
    );
  };

  if (done) {
    return (
      <Card className="flex flex-col items-center gap-2 py-8 text-center">
        <Trophy className="size-8 text-yamabuki" />
        <p className="font-semibold text-ink">{L('Бүх хосыг оллоо!', 'All pairs matched!')}</p>
        <p className="text-sm text-muted">
          {L('Алдаа', 'Mistakes')}: {mistakes}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setMatched(new Set());
            setMistakes(0);
            setRound((r) => r + 1);
          }}
        >
          <RotateCcw className="size-4" />
          {L('Дахин тоглох', 'Play again')}
        </Button>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{L('Зүүн талын үгийг баруун талын утгатай нь холбоорой.', 'Match each word on the left with its meaning on the right.')}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-2.5">
          {left.map((p) =>
            tile(
              p.id,
              'l',
              <span className="flex flex-col">
                <Jp text={p.left} furigana={leftFurigana} className="jp text-lg font-medium leading-loose text-ink" />
                {p.leftSub && <span className="text-[11px] text-muted">{p.leftSub}</span>}
              </span>,
            ),
          )}
        </div>
        <div className="flex flex-col gap-2.5">{right.map((p) => tile(p.id, 'r', <span className="text-sm text-ink">{p.right}</span>))}</div>
      </div>
    </div>
  );
}
