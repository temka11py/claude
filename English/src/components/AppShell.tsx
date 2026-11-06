import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Bot,
  BookOpen,
  Brain,
  ChartColumn,
  Flame,
  Gamepad2,
  House,
  Languages,
  LogOut,
  Map,
  Menu,
  MessagesSquare,
  Settings,
  Shield,
  Wrench,
  X,
} from 'lucide-react';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/context';
import type { Dashboard } from '../lib/types';
import { clsx } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Today', icon: <House className="size-5" />, end: true },
  { to: '/course', label: 'Course', icon: <Map className="size-5" /> },
  { to: '/review', label: 'Review', icon: <Brain className="size-5" /> },
  { to: '/practice', label: 'Practice', icon: <Gamepad2 className="size-5" /> },
  { to: '/progress', label: 'Progress', icon: <ChartColumn className="size-5" /> },
];

const SECONDARY: NavItem[] = [
  { to: '/vocabulary', label: 'My words', icon: <Languages className="size-5" /> },
  { to: '/mistakes', label: 'My mistakes', icon: <Wrench className="size-5" /> },
  { to: '/tutor', label: 'AI tutor', icon: <Bot className="size-5" /> },
  { to: '/conversation', label: 'Conversation', icon: <MessagesSquare className="size-5" /> },
  { to: '/achievements', label: 'Achievements', icon: <Award className="size-5" /> },
  { to: '/settings', label: 'Settings', icon: <Settings className="size-5" /> },
];

function Logo() {
  return (
    <div className="flex items-center gap-2 font-bold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
        <BookOpen className="size-4.5" aria-hidden />
      </span>
      <span className="text-[17px]">Fluent Path</span>
    </div>
  );
}

function StatusChips() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dashboard>('/dashboard'), staleTime: 30_000 });
  if (!q.data) return null;
  const d = q.data;
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent" title={`Current streak: ${d.streak.current} study days`}>
        <Flame className="size-3.5" aria-hidden /> {d.streak.current}
        <span className="sr-only">day streak</span>
      </span>
      <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary" title={d.xp.rank.title}>
        {d.xp.xp.toLocaleString()} XP
      </span>
    </div>
  );
}

export function AppShell() {
  const { status } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = status?.user?.role === 'admin';
  const secondary = isAdmin ? [...SECONDARY, { to: '/admin', label: 'Content admin', icon: <Shield className="size-5" /> }] : SECONDARY;

  async function logout() {
    await post('/auth/logout');
    qc.clear();
    navigate('/login');
  }

  const link = (item: NavItem, onClick?: () => void) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={onClick}
      className={({ isActive }) =>
        clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition', isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-text')
      }
    >
      {item.icon}
      {item.label}
    </NavLink>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
        <div className="px-3 pb-5">
          <Logo />
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {PRIMARY.map((i) => link(i))}
        </nav>
        <div className="mx-3 my-4 border-t border-border" />
        <nav aria-label="More" className="flex flex-col gap-1">
          {secondary.map((i) => link(i))}
        </nav>
        <div className="mt-auto space-y-3 px-3">
          <StatusChips />
          <button onClick={logout} className="flex items-center gap-2 text-sm text-muted hover:text-text">
            <LogOut className="size-4" /> Sign out ({status?.user?.displayName})
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <StatusChips />
            <button onClick={() => setMenuOpen(true)} className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-2" aria-label="Open menu" aria-expanded={menuOpen}>
              <Menu className="size-5" />
            </button>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8" key={location.pathname.split('/')[1]}>
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom navigation */}
        <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {PRIMARY.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', isActive ? 'text-primary' : 'text-muted')}
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      {/* Mobile "more" menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <div className="animate-slide-up absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-4 pb-8 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold">More</span>
              <button onClick={() => setMenuOpen(false)} className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-2" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <nav className="grid grid-cols-2 gap-1">{secondary.map((i) => link(i, () => setMenuOpen(false)))}</nav>
            <button onClick={logout} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-muted hover:bg-surface-2">
              <LogOut className="size-5" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FullScreen({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}

