export function formatDuration(ms: number, lang: 'mn' | 'en'): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return lang === 'en' ? `${Math.max(1, min)} min` : `${Math.max(1, min)} мин`;
  const hours = Math.round(min / 60);
  if (hours < 24) return lang === 'en' ? `${hours} h` : `${hours} цаг`;
  const days = Math.round(hours / 24);
  return lang === 'en' ? `${days} d` : `${days} өдөр`;
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDate(iso: string, lang: 'mn' | 'en'): string {
  // Accept both full ISO timestamps and plain YYYY-MM-DD dates (read as local noon).
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (lang === 'en') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${d.getMonth() + 1}-р сарын ${d.getDate()}`;
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
