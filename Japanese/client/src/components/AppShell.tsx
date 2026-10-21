import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  ArrowLeftRight, BookOpen, ChartColumn, ClipboardCheck, Flame, GraduationCap, Headphones, Home, LayoutDashboard,
  Library, LogOut, Map as MapIcon, Menu, Mic, RotateCcw, ScrollText, Settings, X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useStudyTimer } from '../hooks/useStudyTimer';
import { useI18n } from '../i18n';
import { cx } from './ui';
import { stopAudio } from '../lib/speech';

export function BrandMark({ className = 'size-9' }: { className?: string }) {
  // 花丸 (hanamaru) — the teacher's "excellent" circle.
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="14" fill="var(--shu)" />
      <path d="M24 10.5c7.6 0 13.5 5.9 13.5 13.3S31.6 37.5 24 37.5 10.5 31.3 10.5 24c0-5.3 3.4-9.6 8.2-11.4" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M24 17.5c3.8 0 6.6 2.9 6.6 6.4s-2.8 6.5-6.6 6.5-6.5-2.9-6.5-6.4c0-2.4 1.3-4.5 3.4-5.6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

function Glyph({ children }: { children: string }) {
  return <span className="jp grid size-5 place-items-center text-[15px] font-bold leading-none">{children}</span>;
}

interface NavItem {
  to: string;
  mn: string;
  en: string;
  icon: ReactNode;
}

const ICON = 'size-5';
const NAV: { mn: string; en: string; items: NavItem[] }[] = [
  {
    mn: 'Ерөнхий', en: 'Overview',
    items: [
      { to: '/', mn: 'Хяналтын самбар', en: 'Dashboard', icon: <LayoutDashboard className={ICON} /> },
      { to: '/learn', mn: 'Сургалтын зам', en: 'Learn', icon: <MapIcon className={ICON} /> },
      { to: '/progress', mn: 'Ахиц', en: 'Progress', icon: <ChartColumn className={ICON} /> },
    ],
  },
  {
    mn: 'Бичиг', en: 'Writing',
    items: [
      { to: '/hiragana', mn: 'Хирагана', en: 'Hiragana', icon: <Glyph>あ</Glyph> },
      { to: '/katakana', mn: 'Катакана', en: 'Katakana', icon: <Glyph>ア</Glyph> },
      { to: '/kanji', mn: 'Ханз', en: 'Kanji', icon: <Glyph>漢</Glyph> },
    ],
  },
  {
    mn: 'Сан', en: 'Library',
    items: [
      { to: '/vocabulary', mn: 'Үгсийн сан', en: 'Vocabulary', icon: <Library className={ICON} /> },
      { to: '/grammar', mn: 'Дүрэм', en: 'Grammar', icon: <BookOpen className={ICON} /> },
      { to: '/stories', mn: 'Өгүүллэг', en: 'Stories', icon: <ScrollText className={ICON} /> },
    ],
  },
  {
    mn: 'Дадлага', en: 'Practice',
    items: [
      { to: '/listening', mn: 'Сонсгол', en: 'Listening', icon: <Headphones className={ICON} /> },
      { to: '/speaking', mn: 'Ярих', en: 'Speaking', icon: <Mic className={ICON} /> },
      { to: '/translation', mn: 'Орчуулга', en: 'Translation', icon: <ArrowLeftRight className={ICON} /> },
      { to: '/review', mn: 'Давталт', en: 'Review', icon: <RotateCcw className={ICON} /> },
    ],
  },
  {
    mn: 'Шалгалт', en: 'Exams',
    items: [
      { to: '/tests', mn: 'Модулийн шалгалт', en: 'Tests', icon: <ClipboardCheck className={ICON} /> },
      { to: '/jlpt', mn: 'JLPT N5', en: 'JLPT N5', icon: <GraduationCap className={ICON} /> },
    ],
  },
];

const MOBILE_TABS: NavItem[] = [
  { to: '/', mn: 'Нүүр', en: 'Home', icon: <Home className={ICON} /> },
  { to: '/learn', mn: 'Сургалт', en: 'Learn', icon: <MapIcon className={ICON} /> },
  { to: '/review', mn: 'Давталт', en: 'Review', icon: <RotateCcw className={ICON} /> },
  { to: '/tests', mn: 'Шалгалт', en: 'Tests', icon: <ClipboardCheck className={ICON} /> },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { lang } = useI18n();
  return (
    <nav className="flex flex-col gap-5" aria-label="Main">
      {NAV.map((group) => (
        <div key={group.en}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{lang === 'en' ? group.en : group.mn}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-shu-soft text-shu' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )
                  }
                >
                  {item.icon}
                  {lang === 'en' ? item.en : item.mn}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Avatar({ char, className = 'size-9 text-base' }: { char: string; className?: string }) {
  return <span className={cx('brush grid shrink-0 place-items-center rounded-full bg-ai-soft font-semibold text-ai', className)}>{char}</span>;
}

function UserChip({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { L } = useI18n();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
      <Avatar char={user.avatar} />
      <NavLink to="/settings" onClick={onNavigate} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
        <p className="flex items-center gap-1 text-xs text-muted">
          <Flame className="size-3.5 text-shu" />
          {user.streak} {L('өдөр', 'days')}
        </p>
      </NavLink>
      <NavLink to="/settings" onClick={onNavigate} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label={L('Тохиргоо', 'Settings')}>
        <Settings className="size-4.5" />
      </NavLink>
      <button
        onClick={async () => {
          await logout();
          navigate('/login');
        }}
        className="rounded-lg p-1.5 text-muted hover:bg-surface-2"
        aria-label={L('Гарах', 'Log out')}
        title={L('Гарах', 'Log out')}
      >
        <LogOut className="size-4.5" />
      </button>
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useToast();
  const { L } = useI18n();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-lg">
          {t.icon && <span className="brush grid size-10 shrink-0 place-items-center rounded-xl bg-shu text-lg font-semibold text-white">{t.icon}</span>}
          <div className="min-w-0 flex-1">
            {t.kind === 'achievement' && <p className="text-[11px] font-semibold uppercase tracking-wider text-shu">{L('Шинэ амжилт', 'Achievement unlocked')}</p>}
            <p className="text-sm font-semibold text-ink">{t.title}</p>
            {t.body && <p className="text-xs text-muted">{t.body}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-muted" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { lang, L } = useI18n();
  const { celebrate } = useToast();
  useStudyTimer(!!user, (a) => celebrate(a, lang));

  useEffect(() => {
    setDrawer(false);
    stopAudio();
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-paper">
      <Toasts />
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-paper lg:flex">
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
          <BrandMark />
          <div>
            <p className="text-base font-semibold leading-tight text-ink">Hanamaru</p>
            <p className="jp text-xs text-muted">はなまる · JLPT N5</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
          <NavList />
        </div>
        <div className="p-3">
          <UserChip />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <NavLink to="/" className="flex items-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="font-semibold text-ink">Hanamaru</span>
        </NavLink>
        <div className="flex items-center gap-2">
          {user && (
            <span className="flex items-center gap-1 rounded-full bg-shu-soft px-2.5 py-1 text-xs font-semibold text-shu">
              <Flame className="size-3.5" />
              {user.streak}
            </span>
          )}
          <button onClick={() => setDrawer(true)} className="rounded-xl p-2 text-ink hover:bg-surface-2" aria-label={L('Цэс', 'Menu')}>
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="animate-rise absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col bg-paper shadow-xl">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold text-ink">{L('Цэс', 'Menu')}</span>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label={L('Хаах', 'Close')}>
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <NavList onNavigate={() => setDrawer(false)} />
            </div>
            <div className="p-3">
              <UserChip onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}

      <main className="px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-10 lg:pb-12 lg:pt-8">
        <div className="mx-auto w-full max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick">
        {MOBILE_TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-shu' : 'text-muted')}>
            {t.icon}
            {lang === 'en' ? t.en : t.mn}
          </NavLink>
        ))}
        <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted">
          <Menu className={ICON} />
          {L('Бусад', 'More')}
        </button>
      </nav>
    </div>
  );
}
