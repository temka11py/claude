import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  ArrowLeftRight, BookOpen, ChartColumn, ChevronDown, ClipboardCheck, Flame, Gamepad2, GraduationCap, Headphones, Layers,
  Library, ListChecks, LogOut, Map as MapIcon, Menu, Mic, Pause, RotateCcw, ScrollText, Settings, Sun, Timer, X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { StudyClockProvider, useStudyClock } from '../hooks/useStudyTimer';
import { useI18n } from '../i18n';
import { cx } from './ui';
import { onSpeechFailure, stopAudio } from '../lib/speech';

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
// The daily program is the main path; everything else lives in the library.
const MAIN: NavItem[] = [
  { to: '/', mn: 'Өнөөдөр', en: 'Today', icon: <Sun className={ICON} /> },
  { to: '/program', mn: 'Хөтөлбөр N5→N2', en: 'Program N5→N2', icon: <MapIcon className={ICON} /> },
  { to: '/flashcards', mn: 'Флэш карт', en: 'Flashcards', icon: <Layers className={ICON} /> },
  { to: '/review', mn: 'Давталт', en: 'Review', icon: <RotateCcw className={ICON} /> },
  { to: '/games', mn: 'Тоглоом', en: 'Games', icon: <Gamepad2 className={ICON} /> },
  { to: '/progress', mn: 'Ахиц', en: 'Progress', icon: <ChartColumn className={ICON} /> },
];

const LIBRARY: NavItem[] = [
  { to: '/hiragana', mn: 'Хирагана', en: 'Hiragana', icon: <Glyph>あ</Glyph> },
  { to: '/katakana', mn: 'Катакана', en: 'Katakana', icon: <Glyph>ア</Glyph> },
  { to: '/kanji', mn: 'Ханз', en: 'Kanji', icon: <Glyph>漢</Glyph> },
  { to: '/vocabulary', mn: 'Үгсийн сан', en: 'Vocabulary', icon: <Library className={ICON} /> },
  { to: '/grammar', mn: 'Дүрэм', en: 'Grammar', icon: <BookOpen className={ICON} /> },
  { to: '/stories', mn: 'Өгүүллэг', en: 'Stories', icon: <ScrollText className={ICON} /> },
  { to: '/listening', mn: 'Сонсгол', en: 'Listening', icon: <Headphones className={ICON} /> },
  { to: '/speaking', mn: 'Ярих', en: 'Speaking', icon: <Mic className={ICON} /> },
  { to: '/translation', mn: 'Орчуулга', en: 'Translation', icon: <ArrowLeftRight className={ICON} /> },
  { to: '/learn', mn: 'Хичээлүүд', en: 'Lessons', icon: <ListChecks className={ICON} /> },
  { to: '/tests', mn: 'Модулийн шалгалт', en: 'Tests', icon: <ClipboardCheck className={ICON} /> },
  { to: '/jlpt', mn: 'JLPT загвар', en: 'JLPT mock', icon: <GraduationCap className={ICON} /> },
];

const MOBILE_TABS: NavItem[] = [
  { to: '/', mn: 'Өнөөдөр', en: 'Today', icon: <Sun className={ICON} /> },
  { to: '/program', mn: 'Хөтөлбөр', en: 'Program', icon: <MapIcon className={ICON} /> },
  { to: '/flashcards', mn: 'Карт', en: 'Cards', icon: <Layers className={ICON} /> },
  { to: '/games', mn: 'Тоглоом', en: 'Games', icon: <Gamepad2 className={ICON} /> },
];

const LIBRARY_KEY = 'hanamaru.libraryOpen';

function NavLinkItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { lang } = useI18n();
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.to === '/'}
        onClick={onNavigate}
        className={({ isActive }) =>
          cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-shu-soft text-shu' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')
        }
      >
        {item.icon}
        {lang === 'en' ? item.en : item.mn}
      </NavLink>
    </li>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { L } = useI18n();
  const location = useLocation();
  const inLibrary = LIBRARY.some((i) => location.pathname.startsWith(i.to));
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(LIBRARY_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(LIBRARY_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable — the toggle still works for this visit */
    }
  };
  const showLibrary = open || inLibrary;
  return (
    <nav className="flex flex-col gap-5" aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {MAIN.map((item) => (
          <NavLinkItem key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </ul>
      <div>
        <button onClick={toggle} className="mb-1.5 flex w-full items-center justify-between rounded-lg px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink" aria-expanded={showLibrary}>
          {L('Номын сан', 'Library')}
          <ChevronDown className={cx('size-3.5 transition-transform', showLibrary && 'rotate-180')} />
        </button>
        {showLibrary && (
          <ul className="flex flex-col gap-0.5">
            {LIBRARY.map((item) => (
              <NavLinkItem key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}

/** Live "time studied today" — the clock only runs while the learner is active. */
function StudyTimerPill() {
  const { seconds, running, goalMinutes } = useStudyClock();
  const { L } = useI18n();
  const [open, setOpen] = useState(false);
  const goal = goalMinutes * 60;
  const pct = Math.min(100, Math.round((seconds / goal) * 100));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  const clock = h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  const left = Math.max(0, Math.ceil((goal - seconds) / 60));
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx('flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors', pct >= 100 ? 'border-matcha/40 bg-matcha-soft text-matcha' : 'border-line bg-surface text-ink')}
        aria-expanded={open}
        title={L('Өнөөдөр суралцсан хугацаа', 'Time studied today')}
      >
        {running ? <Timer className="size-4 text-shu" /> : <Pause className="size-4 text-muted" />}
        <span>{clock}</span>
        <span className="hidden font-normal text-muted sm:inline">
          / {goalMinutes} {L('мин', 'min')}
        </span>
        <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <span className={cx('absolute inset-y-0 left-0 rounded-full', pct >= 100 ? 'bg-matcha' : 'bg-shu')} style={{ width: `${pct}%` }} />
        </span>
      </button>
      {open && (
        <div className="animate-rise absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-line bg-surface p-4 text-sm shadow-lg" role="dialog">
          <p className="font-semibold text-ink">
            {L('Өнөөдөр', 'Today')}: {h ? `${h} ${L('цаг', 'h')} ` : ''}
            {m} {L('мин', 'min')} {sec} {L('сек', 's')}
          </p>
          <p className="mt-0.5 text-muted">
            {pct >= 100 ? L('Өдрийн зорилгоо биелүүллээ!', 'Daily goal reached!') : L(`Зорилго ${goalMinutes} мин — ${left} мин үлдлээ (${pct}%)`, `Goal ${goalMinutes} min — ${left} min left (${pct}%)`)}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={cx('h-full rounded-full', pct >= 100 ? 'bg-matcha' : 'bg-shu')} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-ink-2">
            {running ? <Timer className="mt-0.5 size-3.5 shrink-0 text-shu" /> : <Pause className="mt-0.5 size-3.5 shrink-0 text-muted" />}
            {running
              ? L('Цаг явж байна. Та апп дээр идэвхтэй байгаа үед л тоологдоно.', 'The clock is running while you are active in the app.')
              : L('Түр зогссон: 2 минут юу ч дараагүй эсвэл өөр цонх руу шилжсэн. Дарах эсвэл гүйлгэхэд дахин явна.', 'Paused: no activity for 2 minutes or another tab is open. Tap or scroll to resume.')}
          </p>
          <p className="mt-2 text-xs text-muted">{L('Зорилгыг Тохиргоо хэсэгт өөрчилнө.', 'Change the goal in Settings.')}</p>
        </div>
      )}
    </div>
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
  const { user, settings } = useAuth();
  const { lang } = useI18n();
  const { celebrate } = useToast();
  return (
    <StudyClockProvider enabled={!!user} goalMinutes={settings.dailyGoalMinutes} onAchievements={(a) => celebrate(a, lang)}>
      <Shell />
    </StudyClockProvider>
  );
}

function Shell() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { lang, L } = useI18n();
  const { notify } = useToast();

  useEffect(() => {
    setDrawer(false);
    stopAudio();
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Explain silent audio instead of leaving the learner guessing (at most once a minute).
  useEffect(() => {
    let last = 0;
    return onSpeechFailure((reason) => {
      if (Date.now() - last < 60_000) return;
      last = Date.now();
      notify({
        kind: 'error',
        title: L('Дуу гарсангүй', 'No sound'),
        body:
          reason === 'no-voice'
            ? L(
                'Энэ browser-т япон хоолой алга. Edge эсвэл Chrome ашиглана уу, эсвэл Windows Тохиргоо → Цаг ба хэл → Яриа → "Хоолой нэмэх" хэсгээс 日本語 хоолой суулгана уу.',
                'This browser has no Japanese voice. Use Edge or Chrome, or add a 日本語 voice in Windows Settings → Time & language → Speech.',
              )
            : L(
                'Япон хоолой интернэтээр ачаалагддаг. Холболтоо шалгаад дахин дарна уу. Интернэтгүй үед ажиллуулах бол Windows Тохиргоо → Цаг ба хэл → Яриа хэсгээс 日本語 хоолой суулгана уу.',
                'The Japanese voice is loaded over the internet. Check your connection and try again, or add a 日本語 voice in Windows speech settings for offline use.',
              ),
      });
    });
  }, [notify, L]);

  return (
    <div className="min-h-dvh bg-paper">
      <Toasts />
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-paper lg:flex">
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
          <BrandMark />
          <div>
            <p className="text-base font-semibold leading-tight text-ink">Hanamaru</p>
            <p className="jp text-xs text-muted">はなまる · N5 → N2</p>
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
          {user && <StudyTimerPill />}
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

      <main className="px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-10 lg:pb-12 lg:pt-5">
        <div className="sticky top-3 z-30 -mb-2 hidden justify-end lg:flex">
          <div className="flex items-center gap-2 rounded-full bg-paper/80 p-1 backdrop-blur">
            <StudyTimerPill />
            {user && (
              <span className="flex items-center gap-1 rounded-full bg-shu-soft px-3 py-1.5 text-sm font-semibold text-shu" title={L('Өдөр дараалсан цуваа', 'Daily streak')}>
                <Flame className="size-4" />
                {user.streak}
              </span>
            )}
          </div>
        </div>
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
