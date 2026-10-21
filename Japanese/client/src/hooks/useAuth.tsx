import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, onUnauthorized, post, put } from '../api/client';
import type { Settings, User } from '../api/types';

const DEFAULT_SETTINGS: Settings = {
  language: 'mn',
  showRomaji: true,
  showFurigana: true,
  dailyGoalMinutes: 25,
  autoplayAudio: false,
  speechRate: 0.9,
  theme: 'light',
};

interface AuthApi {
  user: User | null;
  settings: Settings;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthApi | null>(null);

function applyTheme(theme: Settings['theme']) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('hm-theme', theme);
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const settings = user?.settings ?? DEFAULT_SETTINGS;

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u) applyTheme(u.settings?.theme ?? 'light');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, [setUser]);

  useEffect(() => {
    void refresh();
    const off = onUnauthorized(() => setUser(null));
    return () => {
      off();
    };
  }, [refresh, setUser]);

  const login = async (email: string, password: string) => {
    const { user } = await post<{ user: User }>('/auth/login', { email, password });
    setUser(user);
  };
  const register = async (name: string, email: string, password: string) => {
    const { user } = await post<{ user: User }>('/auth/register', { name, email, password });
    setUser(user);
  };
  const logout = async () => {
    await post('/auth/logout');
    setUser(null);
  };
  const updateSettings = async (patch: Partial<Settings>) => {
    if (!user) return;
    setUser({ ...user, settings: { ...settings, ...patch } });
    const { settings: saved } = await put<{ settings: Settings }>('/settings', patch);
    setUserState((u) => (u ? { ...u, settings: saved } : u));
  };

  return (
    <AuthContext.Provider value={{ user, settings, ready, login, register, logout, refresh, updateSettings, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
