import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Achievement } from '../api/types';

export interface Toast {
  id: number;
  kind: 'achievement' | 'info' | 'error';
  title: string;
  body?: string;
  icon?: string;
}

interface ToastApi {
  notify: (toast: Omit<Toast, 'id'>) => void;
  celebrate: (achievements: Achievement[] | undefined, lang: 'mn' | 'en') => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId++;
      setToasts((t) => [...t, { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.kind === 'achievement' ? 6000 : 4000);
    },
    [dismiss],
  );
  const celebrate = useCallback(
    (achievements: Achievement[] | undefined, lang: 'mn' | 'en') => {
      for (const a of achievements ?? []) {
        notify({ kind: 'achievement', icon: a.icon, title: lang === 'en' ? a.titleEn : a.title, body: a.description });
      }
    },
    [notify],
  );
  return <ToastContext.Provider value={{ notify, celebrate, toasts, dismiss }}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
