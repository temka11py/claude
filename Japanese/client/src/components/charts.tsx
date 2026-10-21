import { useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { cx } from './ui';

/** Collapsible table view so no value is gated behind colour or hover. */
function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const { L } = useI18n();
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">{L('Хүснэгтээр харах', 'View as table')}</summary>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            {head.map((h) => (
              <th key={h} className="py-1.5 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cx('py-1.5 pr-3 text-ink-2', j > 0 && 'tabular-nums')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function niceMax(v: number) {
  if (v <= 10) return 10;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Positioned in percentages of the chart box so it tracks the responsive SVG. */
function Tooltip({ left, top, children }: { left: number; top: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md" style={{ left: `${left}%`, top: `calc(${top}% - 8px)` }}>
      {children}
    </div>
  );
}

/** Single-series column chart (e.g. study minutes per day). */
export function ColumnChart({ data, unit, label }: { data: { label: string; value: number; title: string }[]; unit: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 200;
  const pad = { l: 34, r: 8, t: 16, b: 26 };
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const band = (W - pad.l - pad.r) / data.length;
  const barW = Math.min(24, band * 0.55);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max].filter((t) => Number.isInteger(t));
  const peak = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tabular-nums">
                {Math.round(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx0 = pad.l + band * i + band / 2;
            const top = y(d.value);
            const h = Math.max(0, H - pad.b - top);
            const r = Math.min(4, h);
            return (
              <g key={d.title} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.title}: ${d.value} ${unit}`}>
                <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${cx0 - barW / 2},${H - pad.b} V${top + r} Q${cx0 - barW / 2},${top} ${cx0 - barW / 2 + r},${top} H${cx0 + barW / 2 - r} Q${cx0 + barW / 2},${top} ${cx0 + barW / 2},${top + r} V${H - pad.b} Z`}
                    fill="var(--chart-accent)"
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                )}
                {i === peak && d.value > 0 && (
                  <text x={cx0} y={top - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink)">
                    {d.value}
                  </text>
                )}
                <text x={cx0} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {d.label}
                </text>
              </g>
            );
          })}
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" strokeWidth={1} />
        </svg>
        {hover !== null && (
          <Tooltip left={((pad.l + band * hover + band / 2) / W) * 100} top={(y(data[hover].value) / H) * 100}>
            <span className="font-medium text-ink">{data[hover].title}</span> · <span className="tabular-nums text-ink-2">{data[hover].value} {unit}</span>
          </Tooltip>
        )}
      </div>
      <TableView head={['', unit]} rows={data.map((d) => [d.title, d.value])} />
    </div>
  );
}

/** Line of quiz scores over time (0–100) with a pass-mark reference and hover crosshair. */
export function ScoreLine({ data, passMark, label }: { data: { title: string; date: string; value: number }[]; passMark: number; label: string }) {
  const { L } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 200;
  const pad = { l: 34, r: 12, t: 14, b: 14 };
  const x = (i: number) => pad.l + (data.length <= 1 ? (W - pad.l - pad.r) / 2 : ((W - pad.l - pad.r) * i) / (data.length - 1));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / 100);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ');
  return (
    <div>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={label}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            let best = 0;
            data.forEach((_, i) => {
              if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
            });
            setHover(best);
          }}
        >
          {[0, 50, 100].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          <line x1={pad.l} x2={W - pad.r} y1={y(passMark)} y2={y(passMark)} stroke="var(--muted)" strokeWidth={1} />
          <text x={W - pad.r} y={y(passMark) - 4} textAnchor="end" fontSize="10" fill="var(--muted)">
            {L('тэнцэх', 'pass')} {passMark}%
          </text>
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--line)" strokeWidth={1} />}
          <path d={path} fill="none" stroke="var(--chart-o4)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <circle key={i} cx={x(i)} cy={y(d.value)} r={hover === i ? 6 : 4.5} fill="var(--chart-o4)" stroke="var(--surface)" strokeWidth={2} />
          ))}
          {data.length > 0 && (
            <text x={x(data.length - 1)} y={y(data[data.length - 1].value) - 10} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--ink)">
              {data[data.length - 1].value}%
            </text>
          )}
        </svg>
        {hover !== null && data[hover] && (
          <Tooltip left={(x(hover) / W) * 100} top={(y(data[hover].value) / H) * 100}>
            <span className="font-medium text-ink">{data[hover].title}</span>
            <br />
            <span className="text-muted">{data[hover].date}</span> · <span className="tabular-nums text-ink-2">{data[hover].value}%</span>
          </Tooltip>
        )}
      </div>
      <TableView head={['', L('Огноо', 'Date'), '%']} rows={data.map((d) => [d.title, d.date, d.value])} />
    </div>
  );
}

export interface StackRow {
  label: string;
  total: number;
  segments: number[]; // ordered: learning, review, mastered … (light → dark)
}

/** Horizontal stacked bars on a track (the empty track = not started). Ordinal single-hue ramp. */
export function StackedProgress({ rows, legend }: { rows: StackRow[]; legend: string[] }) {
  const { L } = useI18n();
  const [hover, setHover] = useState<string | null>(null);
  const colors = ['var(--chart-o1)', 'var(--chart-o2)', 'var(--chart-o3)', 'var(--chart-o4)'].slice(-legend.length);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {legend.map((l, i) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: colors[i] }} />
            {l}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-line bg-surface-2" />
          {L('Эхлээгүй', 'Not started')}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const inDeck = r.segments.reduce((a, b) => a + b, 0);
          return (
            <div key={r.label}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium text-ink">{r.label}</span>
                <span className="tabular-nums text-muted">
                  {r.segments[r.segments.length - 1] + (r.segments[r.segments.length - 2] ?? 0)}/{r.total} {L('цээжилсэн', 'learned')}
                </span>
              </div>
              <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${r.label}: ${legend.map((l, i) => `${l} ${r.segments[i]}`).join(', ')}`}>
                {r.segments.map((v, i) =>
                  v > 0 ? (
                    <div
                      key={i}
                      className="h-full first:rounded-l-full"
                      style={{ width: `${(v / Math.max(r.total, inDeck, 1)) * 100}%`, background: colors[i], opacity: hover && hover !== `${r.label}-${i}` ? 0.6 : 1 }}
                      onMouseEnter={() => setHover(`${r.label}-${i}`)}
                      onMouseLeave={() => setHover(null)}
                      title={`${legend[i]}: ${v}`}
                    />
                  ) : null,
                )}
              </div>
            </div>
          );
        })}
      </div>
      <TableView head={['', ...legend, L('Нийт', 'Total')]} rows={rows.map((r) => [r.label, ...r.segments, r.total])} />
    </div>
  );
}

/** Sorted horizontal bars with the value at the tip (category accuracy). */
export function AccuracyBars({ rows }: { rows: { label: string; value: number; detail: string }[] }) {
  const { L } = useI18n();
  return (
    <div>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(7rem,10rem)_1fr_3rem] items-center gap-3 text-sm" title={r.detail}>
            <span className="truncate text-ink-2">{r.label}</span>
            <div className="h-2.5 overflow-hidden rounded-r-full bg-surface-2">
              <div className="h-full rounded-r-full" style={{ width: `${r.value}%`, background: 'var(--chart-o4)' }} />
            </div>
            <span className="text-right tabular-nums text-ink">{r.value}%</span>
          </li>
        ))}
      </ul>
      <TableView head={['', L('Нарийвчлал', 'Accuracy'), L('Зөв / нийт', 'Correct / total')]} rows={rows.map((r) => [r.label, `${r.value}%`, r.detail])} />
    </div>
  );
}
