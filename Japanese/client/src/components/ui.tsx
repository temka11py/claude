import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Loader2, Volume2, X } from 'lucide-react';
import { splitRuby } from '../lib/furigana';
import { playSource, stopAudio, ttsSupported } from '../lib/speech';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { stateLabel } from '../lib/labels';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// ───────────── Buttons ─────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-shu text-white hover:bg-shu-strong shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2',
  danger: 'bg-surface text-shu border border-line hover:bg-shu-soft',
  success: 'bg-matcha text-white hover:opacity-90',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'primary', size = 'md', className, children }: { to: string; variant?: Variant; size?: 'sm' | 'md' | 'lg'; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ───────────── Layout primitives ─────────────

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' }) {
  return <As className={cx('rounded-2xl border border-line bg-surface p-5', className)}>{children}</As>;
}

export function PageHeader({ title, titleJa, subtitle, actions }: { title: string; titleJa?: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {titleJa && <p className="jp mb-1 text-sm font-medium tracking-wide text-shu">{titleJa}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = 'shu', className, label }: { value: number; max?: number; tone?: 'shu' | 'ai' | 'matcha' | 'yamabuki'; className?: string; label?: string }) {
  const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = { shu: 'bg-shu', ai: 'bg-ai', matcha: 'bg-matcha', yamabuki: 'bg-yamabuki' }[tone];
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 88, stroke = 8, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--shu)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'shu' | 'ai' | 'matcha' | 'yamabuki'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2',
    shu: 'bg-shu-soft text-shu',
    ai: 'bg-ai-soft text-ai',
    matcha: 'bg-matcha-soft text-matcha',
    yamabuki: 'bg-yamabuki-soft text-yamabuki',
  };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function StateBadge({ state }: { state?: string | null }) {
  const { lang } = useI18n();
  if (!state) return null;
  const tone = state === 'mastered' ? 'matcha' : state === 'review' ? 'ai' : state === 'learning' ? 'yamabuki' : 'neutral';
  return <Badge tone={tone}>{stateLabel(state, lang)}</Badge>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <Loader2 className="size-5 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { L } = useI18n();
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertTriangle className="size-6 text-shu" />
      <p className="text-sm text-ink-2">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {L('Дахин оролдох', 'Try again')}
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-surface-2 p-1 scrollbar-thin" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'whitespace-nowrap rounded-lg font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-shu' : 'bg-line')}
      >
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        className={cx('animate-rise max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 shadow-xl sm:rounded-3xl sm:p-6', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0 text-lg font-semibold text-ink">{title}</div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ───────────── Japanese text helpers ─────────────

/** Word with optional furigana (respects the learner's setting unless forced). */
export function Ruby({ text, reading, show }: { text: string; reading?: string; show?: boolean }) {
  const { settings } = useAuth();
  const visible = show ?? settings.showFurigana;
  if (!visible || !reading) return <span className="jp">{text}</span>;
  return (
    <span className="jp">
      {splitRuby(text, reading).map((seg, i) =>
        seg.rt ? (
          <ruby key={i}>
            {seg.text}
            <rt>{seg.rt}</rt>
          </ruby>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}

export function SpeakButton({ text, audioUrl, size = 'md', label, className }: { text: string; audioUrl?: string | null; size?: 'sm' | 'md'; label?: string; className?: string }) {
  const { settings } = useAuth();
  const { L } = useI18n();
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stopAudio(), []);
  if (!ttsSupported && !audioUrl) return null;
  const play = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setPlaying(true);
    await playSource({ audioUrl, text }, settings.speechRate);
    setPlaying(false);
  };
  return (
    <button
      type="button"
      onClick={play}
      aria-label={label ?? L('Сонсох', 'Listen')}
      title={label ?? L('Сонсох', 'Listen')}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-ai transition-colors hover:bg-ai-soft',
        size === 'sm' ? 'size-7' : 'h-9 min-w-9 px-2',
        playing && 'bg-ai-soft',
        className,
      )}
    >
      <Volume2 className={size === 'sm' ? 'size-4' : 'size-5'} />
      {label && size === 'md' && <span className="pr-1 text-sm font-medium">{label}</span>}
    </button>
  );
}

export function StatTile({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
