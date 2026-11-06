// Small SVG charts following the project's data-viz rules: thin marks, 4px
// rounded data-ends, hairline solid grid, text in text colours, a legend for
// 2+ series, hover/focus tooltips that never gate (every chart has a table view).

import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Table2 } from 'lucide-react';
import { labelFor } from '@shared/cefr';
import { SKILL_COLOR, clsx } from './ui';

/** Skills always appear in this order so each keeps its validated colour position. */
export const SKILL_ORDER = ['vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'pronunciation'] as const;

/** Measure a container so SVG charts draw at real pixel size (text never scales). */
function useWidth<T extends HTMLElement>(fallback = 600): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-text" aria-pressed={open}>
      <Table2 className="size-3.5" /> {open ? 'Chart' : 'Table'}
    </button>
  );
}

export function ChartCard({ title, subtitle, children, table, legend }: { title: string; subtitle?: ReactNode; children: ReactNode; table: ReactNode; legend?: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-border sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <TableToggle open={showTable} onToggle={() => setShowTable(!showTable)} />
      </div>
      {legend && !showTable && <div className="mb-2">{legend}</div>}
      {showTable ? <div className="max-h-72 overflow-auto">{table}</div> : children}
    </section>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted">
          {columns.map((c) => (
            <th key={c} className="py-1.5 pr-3 font-semibold">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/60">
            {r.map((c, j) => (
              <td key={j} className="py-1.5 pr-3 tabular-nums">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tooltip({ x, y, children, width }: { x: number; y: number; children: ReactNode; width: number }) {
  const left = Math.max(4, Math.min(x, width - 140));
  return (
    <div className="pointer-events-none absolute z-10 min-w-24 rounded-lg bg-surface px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-border" style={{ left, top: Math.max(0, y - 44) }}>
      {children}
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const steps = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 60) * 60;
}

/** Columns for one series over time (e.g. study minutes per day). */
export function ColumnChart({
  data,
  unit = 'min',
  height = 140,
  highlightLast = true,
  color = 'var(--primary)',
  target,
}: {
  data: { key: string; label: string; value: number; long?: string }[];
  unit?: string;
  height?: number;
  highlightLast?: boolean;
  color?: string;
  target?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 30;
  const padB = 22;
  const plotH = height - padB - 8;
  const max = niceMax(Math.max(...data.map((d) => d.value), target ?? 0));
  const band = (width - padL) / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.6);
  const ticks = [0, max / 2, max];
  const labelEvery = data.length > 14 ? (width < 420 ? 7 : 3) : 1;
  const y = (v: number) => 8 + plotH - (v / max) * plotH;

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" role="img" aria-label={`Bar chart, ${data.length} values`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted text-[10px] tabular-nums">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {target !== undefined && target > 0 && (
          <g>
            <line x1={padL} x2={width} y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeWidth={1} opacity={0.6} />
            <text x={width - 2} y={y(target) - 4} textAnchor="end" className="fill-muted text-[10px]">
              goal
            </text>
          </g>
        )}
        {data.map((d, i) => {
          const x = padL + band * i + (band - barW) / 2;
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * plotH);
          const top = 8 + plotH - h;
          const r = Math.min(4, h / 2, barW / 2);
          const last = highlightLast && i === data.length - 1;
          // Rounded data-end (top), square at the baseline.
          const path = h > 0 ? `M${x},${8 + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${8 + plotH} Z` : '';
          return (
            <g key={d.key}>
              {path && <path d={path} fill={color} opacity={hover === null || hover === i ? (last || !highlightLast ? 1 : 0.55) : 0.3} />}
              {/* Hit target larger than the mark, focusable for keyboard users. */}
              <rect
                x={padL + band * i}
                y={0}
                width={band}
                height={height - padB + 4}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.long ?? d.label}: ${d.value} ${unit}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
              {i % labelEvery === 0 || i === data.length - 1 ? (
                <text x={padL + band * i + band / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={padL + band * hover} y={y(data[hover].value)} width={width}>
          <div className="font-semibold text-text">
            {data[hover].value} {unit}
          </div>
          <div className="text-muted">{data[hover].long ?? data[hover].label}</div>
        </Tooltip>
      )}
    </div>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  points: { x: string; y: number | null }[];
}

/** Lines over time on the CEFR scale, with a crosshair tooltip listing every series. */
export function CefrLineChart({ series, height = 220 }: { series: LineSeries[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(), [series]);
  const values = series.flatMap((s) => s.points.map((p) => p.y).filter((v): v is number => v !== null));
  const lo = Math.max(0, Math.floor((Math.min(...values, 2) - 0.25) * 2) / 2);
  const hi = Math.min(5, Math.ceil((Math.max(...values, 2.5) + 0.25) * 2) / 2);
  const padL = 40;
  const padR = 14;
  const padB = 22;
  const plotH = height - padB - 10;
  const x = (i: number) => padL + (xs.length <= 1 ? (width - padL - padR) / 2 : (i / (xs.length - 1)) * (width - padL - padR));
  const y = (v: number) => 10 + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const bands: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += 0.5) bands.push(Math.round(v * 2) / 2);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    xs.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  }

  if (!xs.length) return <p className="py-6 text-center text-sm text-muted">No history yet — your estimates will appear here as you study.</p>;

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="CEFR level over time">
        <clipPath id={clipId}>
          <rect x={padL} y={0} width={width - padL} height={height} />
        </clipPath>
        {bands.map((b) => (
          <g key={b}>
            <line x1={padL} x2={width - padR} y1={y(b)} y2={y(b)} stroke="var(--grid)" strokeWidth={1} />
            <text x={padL - 6} y={y(b) + 3.5} textAnchor="end" className="fill-muted text-[10px]">
              {labelFor(b)}
            </text>
          </g>
        ))}
        {[0, xs.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
          <text key={i} x={x(i)} y={height - 5} textAnchor={i === 0 && xs.length > 1 ? 'start' : 'end'} className="fill-muted text-[10px]">
            {xs[i]}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={10} y2={10 + plotH} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />}
        <g clipPath={`url(#${clipId})`}>
          {series.map((s) => {
            const pts = xs.map((xv, i) => ({ i, v: s.points.find((p) => p.x === xv)?.y ?? null })).filter((p) => p.v !== null) as { i: number; v: number }[];
            const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' ');
            const last = pts[pts.length - 1];
            return (
              <g key={s.key}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {last && <circle cx={x(last.i)} cy={y(last.v)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />}
              </g>
            );
          })}
        </g>
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover) + 8} y={30} width={width}>
          <div className="mb-1 text-muted">{xs[hover]}</div>
          {series.map((s) => {
            const v = s.points.find((p) => p.x === xs[hover])?.y;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span className="h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
                <span className="font-semibold text-text">{v != null ? labelFor(v) : '—'}</span>
                <span className="text-muted">{s.label}</span>
              </div>
            );
          })}
        </Tooltip>
      )}
    </div>
  );
}

export function LineLegend({ series }: { series: { key: string; label: string; color: string }[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Horizontal CEFR level bars for each skill on a shared A1–C2 scale. */
export function SkillLevels({
  skills,
  onlyCore,
}: {
  skills: { skill: string; score: number; label: string; progress: number; provisional?: boolean; accuracy?: number | null }[];
  onlyCore?: boolean;
}) {
  const ordered = [...skills]
    .filter((s) => !onlyCore || SKILL_ORDER.includes(s.skill as (typeof SKILL_ORDER)[number]))
    .sort((a, b) => {
      const ia = SKILL_ORDER.indexOf(a.skill as (typeof SKILL_ORDER)[number]);
      const ib = SKILL_ORDER.indexOf(b.skill as (typeof SKILL_ORDER)[number]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  const scale = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  return (
    <div>
      <ul className="space-y-2.5">
        {ordered.map((s) => {
          const color = SKILL_COLOR[s.skill] ?? 'var(--muted)';
          const derived = !SKILL_ORDER.includes(s.skill as (typeof SKILL_ORDER)[number]);
          return (
            <li key={s.skill} className="grid grid-cols-[7.75rem_1fr_3.2rem] items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5 truncate capitalize">
                <span className="size-2 shrink-0 rounded-full" style={{ background: derived ? 'var(--muted)' : color }} aria-hidden />
                {s.skill}
              </span>
              <div className="relative h-2.5 rounded-full bg-surface-2" role="img" aria-label={`${s.skill}: ${s.label}`}>
                {[1, 2, 3, 4].map((t) => (
                  <span key={t} className="absolute top-0 h-full w-px bg-bg" style={{ left: `${(t / 5) * 100}%` }} aria-hidden />
                ))}
                <div className={clsx('h-full rounded-full', s.provisional && 'opacity-50')} style={{ width: `${Math.min(100, (s.score / 5) * 100)}%`, background: derived ? 'var(--muted)' : color }} />
              </div>
              <span className="text-right font-semibold">{s.label}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 grid grid-cols-[7.75rem_1fr_3.2rem] gap-2">
        <span />
        <div className="flex justify-between text-[10px] text-muted">
          {scale.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function shortDay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2);
}

export function longDay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}
