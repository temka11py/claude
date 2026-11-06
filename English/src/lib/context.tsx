import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, put, setUnauthorizedHandler } from './api';
import type { AchievementDef, AuthStatus, SettingsData } from './types';
import { setTtsDefaults } from './tts';

// ---------------------------------------------------------------- auth

const AuthCtx = createContext<{ status: AuthStatus | undefined; loading: boolean; refresh: () => Promise<unknown> } | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['auth'], queryFn: () => get<AuthStatus>('/auth/status'), staleTime: 60_000 });
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void qc.invalidateQueries({ queryKey: ['auth'] });
    });
  }, [qc]);
  const value = useMemo(() => ({ status: q.data, loading: q.isLoading, refresh: () => q.refetch() }), [q]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}

// ---------------------------------------------------------------- settings

type Lang = 'en' | 'mn' | 'mixed';
const SettingsCtx = createContext<{
  settings: SettingsData | undefined;
  lang: Lang;
  update: (patch: Partial<SettingsData>) => Promise<unknown>;
} | null>(null);

function applyAppearance(s: Pick<SettingsData, 'theme' | 'reduceMotion' | 'largeText'>) {
  const root = document.documentElement;
  const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.classList.toggle('reduce-motion', s.reduceMotion);
  root.classList.toggle('large-text', s.largeText);
  try {
    localStorage.setItem('fp-theme', s.theme);
  } catch {
    /* ignore */
  }
}

export function SettingsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => get<SettingsData>('/settings'), enabled, staleTime: 5 * 60_000 });
  const m = useMutation({
    mutationFn: (patch: Partial<SettingsData>) => put<SettingsData>('/settings', patch),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  useEffect(() => {
    if (!q.data) return;
    applyAppearance(q.data);
    setTtsDefaults(q.data.ttsVoice, q.data.ttsRate);
    if (q.data.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyAppearance(q.data!);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [q.data]);
  const value = useMemo(
    () => ({ settings: q.data, lang: (q.data?.effectiveExplanationLanguage ?? 'mixed') as Lang, update: (p: Partial<SettingsData>) => m.mutateAsync(p) }),
    [q.data, m],
  );
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings outside provider');
  return ctx;
}

// ---------------------------------------------------------------- toasts & rewards

export interface Toast {
  id: number;
  kind: 'xp' | 'achievement' | 'info' | 'error' | 'success';
  title: string;
  body?: string;
}

const ToastCtx = createContext<{ push: (t: Omit<Toast, 'id'>) => void; reward: (r: { xp?: number; achievements?: AchievementDef[]; streak?: { current: number; freezeEarned: boolean; freezeUsed: number } } | null | undefined) => void } | null>(
  null,
);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const qc = useQueryClient();
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.kind === 'achievement' ? 5000 : 2800);
  }, []);
  const reward = useCallback<NonNullable<React.ContextType<typeof ToastCtx>>['reward']>(
    (r) => {
      if (!r) return;
      if (r.xp && r.xp > 0) push({ kind: 'xp', title: `+${r.xp} XP` });
      for (const a of r.achievements ?? []) push({ kind: 'achievement', title: `Achievement unlocked: ${a.title}`, body: a.description });
      if (r.streak?.freezeEarned) push({ kind: 'success', title: 'Streak freeze earned', body: 'It will protect your streak if you miss a study day.' });
      if (r.streak?.freezeUsed) push({ kind: 'info', title: 'Streak protected', body: 'A streak freeze covered the day you missed.' });
      if (r.xp || r.achievements?.length) void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    [push, qc],
  );
  return (
    <ToastCtx.Provider value={{ push, reward }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-slide-up max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ring-1 ${
              t.kind === 'xp'
                ? 'bg-accent-soft text-accent ring-accent/30'
                : t.kind === 'achievement'
                  ? 'bg-primary text-on-primary ring-primary/40'
                  : t.kind === 'error'
                    ? 'bg-danger-soft text-danger ring-danger/30'
                    : t.kind === 'success'
                      ? 'bg-success-soft text-success ring-success/30'
                      : 'bg-surface text-text ring-border'
            }`}
          >
            <div>{t.title}</div>
            {t.body && <div className="mt-0.5 text-xs font-normal opacity-90">{t.body}</div>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast outside provider');
  return ctx;
}
