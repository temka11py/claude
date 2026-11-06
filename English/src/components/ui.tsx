import { forwardRef, useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';
import { Info, Lightbulb, Loader2, RotateCcw, TriangleAlert, Volume2 } from 'lucide-react';
import { useSettings } from '../lib/context';
import { say, ttsAvailable } from '../lib/tts';

export { clsx };

// ---------------------------------------------------------------- Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'soft';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-strong shadow-sm',
  secondary: 'bg-surface text-text ring-1 ring-border hover:bg-surface-2',
  ghost: 'text-text hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
  success: 'bg-success text-white hover:opacity-90 dark:text-bg',
  soft: 'bg-primary-soft text-primary hover:brightness-95',
};
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-[15px] gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ to, variant = 'primary', size = 'md', icon, children, className, block }: { to: string; variant?: Variant; size?: Size; icon?: ReactNode; children: ReactNode; className?: string; block?: boolean }) {
  return (
    <Link
      to={to}
      className={clsx('inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-[0.98]', VARIANTS[variant], SIZES[size], block && 'w-full', className)}
    >
      {icon}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- Layout pieces

export function Card({ children, className, as: As = 'div', ...rest }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' } & Record<string, unknown>) {
  return (
    <As className={clsx('rounded-2xl bg-surface p-4 ring-1 ring-border sm:p-5', className)} {...rest}>
      {children}
    </As>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-1 inline-block text-sm font-medium text-muted hover:text-text">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{children}</h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Status

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl bg-surface p-5 ring-1 ring-border" aria-hidden>
      <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="mt-3 h-3 animate-pulse rounded bg-surface-2" style={{ width: `${85 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <Card className="flex flex-col items-start gap-3 border-danger/30">
      <div className="flex items-center gap-2 font-semibold text-danger">
        <TriangleAlert className="size-5" aria-hidden /> Couldn't load this
      </div>
      <p className="text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Callout({ kind = 'info', title, children }: { kind?: 'info' | 'tip' | 'warning' | 'success'; title?: string; children: ReactNode }) {
  const styles = {
    info: 'bg-primary-soft text-text ring-primary/20',
    tip: 'bg-accent-soft text-text ring-accent/25',
    warning: 'bg-warning-soft text-text ring-warning/30',
    success: 'bg-success-soft text-text ring-success/25',
  }[kind];
  const Icon = kind === 'tip' ? Lightbulb : kind === 'warning' ? TriangleAlert : Info;
  return (
    <div className={clsx('flex gap-3 rounded-xl p-3.5 text-sm ring-1', styles)}>
      <Icon className="mt-0.5 size-4 shrink-0 opacity-80" aria-hidden />
      <div className="min-w-0">
        {title && <div className="mb-0.5 font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Progress

export function ProgressBar({ value, className, color = 'bg-primary', label, size = 'md' }: { value: number; className?: string; color?: string; label?: string; size?: 'sm' | 'md' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className={clsx('w-full overflow-hidden rounded-full bg-surface-2', size === 'sm' ? 'h-1.5' : 'h-2.5', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={clsx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 7, children, color = 'var(--primary)', label }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v * 100)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Badges

export const SKILL_COLOR: Record<string, string> = {
  grammar: 'var(--skill-grammar)',
  vocabulary: 'var(--skill-vocabulary)',
  reading: 'var(--skill-reading)',
  listening: 'var(--skill-listening)',
  speaking: 'var(--skill-speaking)',
  writing: 'var(--skill-writing)',
  pronunciation: 'var(--skill-pronunciation)',
  fluency: 'var(--skill-speaking)',
  comprehension: 'var(--skill-reading)',
  mixed: 'var(--primary)',
};

export function Badge({ children, className, tone = 'neutral' }: { children: ReactNode; className?: string; tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'accent' }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    primary: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    accent: 'bg-accent-soft text-accent',
  };
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}

export function SkillBadge({ skill, className }: { skill: string; className?: string }) {
  const color = SKILL_COLOR[skill] ?? 'var(--muted)';
  // Identity is carried by the coloured dot; the text stays in a text colour for contrast.
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold capitalize text-muted', className)}>
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
      {skill.replace('_', ' ')}
    </span>
  );
}

export function LevelBadge({ level, className }: { level: string; className?: string }) {
  return <span className={clsx('inline-flex items-center rounded-md bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary', className)}>{level}</span>;
}

// ---------------------------------------------------------------- Mongolian support

/**
 * Mongolian explanation that follows the explanation-language setting:
 * shown for "mixed"/"mn", tap-to-reveal for "en".
 */
export function Mn({ children, className, inline }: { children?: ReactNode; className?: string; inline?: boolean }) {
  const { lang } = useSettings();
  const [open, setOpen] = useState(false);
  if (!children) return null;
  if (lang === 'en' && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={clsx('text-xs font-semibold text-primary hover:underline', className)} aria-label="Show Mongolian explanation">
        MN
      </button>
    );
  }
  const Tag = inline ? 'span' : 'p';
  return (
    <Tag lang="mn" className={clsx('text-muted', lang === 'mn' ? 'text-[15px]' : 'text-sm', inline ? '' : 'mt-1', className)}>
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------- Speech

export function SpeakButton({ text, label, rate, accent = 'en-GB', className, size = 'md' }: { text: string; label?: string; rate?: number; accent?: string; className?: string; size?: 'sm' | 'md' }) {
  const [available] = useState(ttsAvailable());
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => say(text, { rate, accent })}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full text-primary transition hover:bg-primary-soft active:scale-95',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      aria-label={label ?? `Listen: ${text}`}
      title="Listen"
    >
      <Volume2 className={size === 'sm' ? 'size-4' : 'size-5'} aria-hidden />
    </button>
  );
}

// ---------------------------------------------------------------- Forms

export function Field({ label, hint, error, children, id }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fid} className="block text-sm font-semibold">
        {label}
      </label>
      {children(fid)}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={clsx(
        'h-11 w-full rounded-xl bg-surface px-3.5 text-[15px] ring-1 ring-border transition placeholder:text-muted/70 focus:ring-2 focus:ring-primary focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={clsx('w-full rounded-xl bg-surface p-3.5 text-[15px] leading-relaxed ring-1 ring-border transition placeholder:text-muted/70 focus:ring-2 focus:ring-primary focus:outline-none', className)}
      {...rest}
    />
  );
});

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-primary' : 'bg-surface-2 ring-1 ring-border')}
      >
        <span className={clsx('absolute top-1 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition',
            value === o.value ? 'bg-primary-soft font-semibold text-primary ring-primary' : 'bg-surface ring-border hover:bg-surface-2',
          )}
        >
          <div>{o.label}</div>
          {o.hint && <div className="text-xs font-normal text-muted">{o.hint}</div>}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={clsx('whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition', value === t.value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Misc

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2/70 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Fluent Path` : 'Fluent Path';
  }, [title]);
}

export function percent(v: number | null | undefined, digits = 0): string {
  return v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`;
}

export function minutesLabel(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h} h ${r} min` : `${h} h`;
}
