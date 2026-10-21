import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Eye, EyeOff, Hash, Pause, Play, SkipForward, Undo2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { Button, cx } from './ui';

interface StrokeData {
  paths: string[];
  numbers: { x: number; y: number; n: string }[];
}

const cache = new Map<string, Promise<StrokeData | null>>();

function loadStrokes(char: string): Promise<StrokeData | null> {
  const hex = char.codePointAt(0)!.toString(16).padStart(5, '0');
  if (!cache.has(hex)) {
    cache.set(
      hex,
      fetch(`/kanjivg/${hex}.svg`)
        .then((r) => (r.ok ? r.text() : null))
        .then((svg) => {
          if (!svg) return null;
          const paths = [...svg.matchAll(/<path[^>]*?\sd="([^"]+)"/g)].map((m) => m[1]);
          const numbers = [...svg.matchAll(/<text transform="matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)">(\d+)<\/text>/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), n: m[3] }));
          return paths.length ? { paths, numbers } : null;
        })
        .catch(() => null),
    );
  }
  return cache.get(hex)!;
}

/** Animated stroke-order diagram based on KanjiVG data (CC BY-SA 3.0). */
export function StrokeOrder({ char, size = 180, autoPlay = false }: { char: string; size?: number; autoPlay?: boolean }) {
  const { L } = useI18n();
  const [data, setData] = useState<StrokeData | null | undefined>(undefined);
  const [shown, setShown] = useState(0); // strokes fully drawn
  const [playing, setPlaying] = useState(autoPlay);
  const [numbers, setNumbers] = useState(true);

  useEffect(() => {
    let alive = true;
    setData(undefined);
    setShown(0);
    loadStrokes(char).then((d) => {
      if (!alive) return;
      setData(d);
      setShown(autoPlay ? 0 : d?.paths.length ?? 0);
    });
    return () => {
      alive = false;
    };
  }, [char, autoPlay]);

  useEffect(() => {
    if (!playing || !data) return;
    if (shown >= data.paths.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setShown((s) => s + 1), 650);
    return () => clearTimeout(t);
  }, [playing, shown, data]);

  if (data === undefined) return <div style={{ width: size, height: size }} className="animate-pulse rounded-2xl bg-surface-2" />;
  if (data === null) {
    return (
      <div style={{ width: size, height: size }} className="brush grid place-items-center rounded-2xl border border-line bg-surface text-7xl text-ink">
        {char}
      </div>
    );
  }
  const total = data.paths.length;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 109 109" width={size} height={size} className="rounded-2xl border border-line bg-surface" role="img" aria-label={L(`${char} — ${total} зураас`, `${char} — ${total} strokes`)}>
        <line x1="54.5" y1="0" x2="54.5" y2="109" stroke="var(--line)" strokeDasharray="3 3" />
        <line x1="0" y1="54.5" x2="109" y2="54.5" stroke="var(--line)" strokeDasharray="3 3" />
        {data.paths.map((d, i) => (
          <path key={`g${i}`} d={d} fill="none" stroke="var(--line)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {data.paths.slice(0, shown).map((d, i) => (
          <path
            key={`s${i}-${shown === i + 1 ? 'anim' : 'done'}`}
            d={d}
            pathLength={1}
            fill="none"
            stroke={i === shown - 1 && playing ? 'var(--shu)' : 'var(--ink)'}
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={1}
            strokeDashoffset={i === shown - 1 && playing ? 1 : 0}
            style={i === shown - 1 && playing ? { animation: 'hm-draw .55s ease-out forwards' } : undefined}
          />
        ))}
        {numbers &&
          data.numbers.slice(0, Math.max(shown, 0)).map((n) => (
            <text key={n.n} x={n.x} y={n.y} fontSize="8" fill="var(--shu)" fontFamily="system-ui">
              {n.n}
            </text>
          ))}
      </svg>
      <div className="flex items-center gap-1">
        <button
          className="rounded-lg p-1.5 text-ink-2 hover:bg-surface-2"
          onClick={() => {
            if (playing) setPlaying(false);
            else {
              if (shown >= total) setShown(0);
              setPlaying(true);
            }
          }}
          aria-label={playing ? L('Зогсоох', 'Pause') : L('Зураасны дараалал', 'Play stroke order')}
          title={L('Зураасны дараалал', 'Stroke order')}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button className="rounded-lg p-1.5 text-ink-2 hover:bg-surface-2" onClick={() => setShown((s) => (s >= total ? 1 : s + 1))} aria-label={L('Дараагийн зураас', 'Next stroke')} title={L('Дараагийн зураас', 'Next stroke')}>
          <SkipForward className="size-4" />
        </button>
        <button className={cx('rounded-lg p-1.5 hover:bg-surface-2', numbers ? 'text-shu' : 'text-muted')} onClick={() => setNumbers((n) => !n)} aria-label={L('Дугаар', 'Numbers')} title={L('Зураасны дугаар', 'Stroke numbers')}>
          <Hash className="size-4" />
        </button>
        <span className="ml-1 text-xs tabular-nums text-muted">
          {Math.min(shown, total)}/{total}
        </span>
      </div>
    </div>
  );
}

/**
 * Free-hand practice canvas. There is intentionally no handwriting
 * recognition — learners compare their writing with the stroke-order model.
 */
export function WritingCanvas({ char, size = 260 }: { char: string; size?: number }) {
  const { L } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<{ x: number; y: number }[][]>([]);
  const drawing = useRef(false);
  const [guide, setGuide] = useState(true);
  const [count, setCount] = useState(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const styles = getComputedStyle(document.documentElement);
    ctx.strokeStyle = styles.getPropertyValue('--line').trim() || '#ddd';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (guide) {
      ctx.fillStyle = styles.getPropertyValue('--ink').trim() || '#000';
      ctx.globalAlpha = 0.09;
      ctx.font = `${Math.round(size * (char.length > 1 ? 0.45 : 0.78))}px "Klee One", "Noto Sans JP", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char, size / 2, size / 2 + size * 0.03);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = styles.getPropertyValue('--ink').trim() || '#000';
    ctx.lineWidth = Math.max(5, size / 38);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes.current) {
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y);
      ctx.stroke();
    }
  }, [char, guide, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    strokes.current = [];
    setCount(0);
    void document.fonts?.load(`40px "Klee One"`).then(redraw);
    redraw();
  }, [char, size, redraw]);

  useEffect(redraw, [guide, redraw]);

  const point = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * size, y: ((e.clientY - rect.top) / rect.height) * size };
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, touchAction: 'none' }}
        className="max-w-full cursor-crosshair rounded-2xl border border-line bg-surface"
        aria-label={L('Бичих талбай', 'Writing area')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          strokes.current.push([point(e)]);
          redraw();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          strokes.current[strokes.current.length - 1].push(point(e));
          redraw();
        }}
        onPointerUp={() => {
          drawing.current = false;
          setCount(strokes.current.length);
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={() => { strokes.current.pop(); setCount(strokes.current.length); redraw(); }} disabled={count === 0}>
          <Undo2 className="size-4" />
          {L('Буцаах', 'Undo')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { strokes.current = []; setCount(0); redraw(); }} disabled={count === 0}>
          <Eraser className="size-4" />
          {L('Арилгах', 'Clear')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setGuide((g) => !g)}>
          {guide ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {guide ? L('Загварыг нуух', 'Hide guide') : L('Загвар харах', 'Show guide')}
        </Button>
        <span className="text-xs tabular-nums text-muted">
          {count} {L('зураас', 'strokes')}
        </span>
      </div>
    </div>
  );
}

/** Stroke order + practice canvas side by side. */
export function WritingPractice({ text }: { text: string }) {
  const { L } = useI18n();
  const chars = [...text].filter((c) => c !== 'ー');
  return (
    <div className="flex flex-col items-center gap-5 md:flex-row md:items-start md:justify-center">
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs font-medium text-muted">{L('Зураасны дараалал', 'Stroke order')}</p>
        <div className="flex gap-2">
          {chars.map((c, i) => (
            <StrokeOrder key={`${c}-${i}`} char={c} size={chars.length > 1 ? 130 : 180} />
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs font-medium text-muted">{L('Бичиж дасгал хийх', 'Practise writing')}</p>
        <WritingCanvas char={text} size={240} />
      </div>
    </div>
  );
}
