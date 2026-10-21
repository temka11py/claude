import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, localDate, post } from '../api/client';
import type { Achievement } from '../api/types';

const IDLE_MS = 2 * 60_000;
const FLUSH_EVERY = 60;

interface StudyClock {
  /** Active study seconds today (server total + not yet reported). */
  seconds: number;
  /** True while the clock is running (tab visible and recent interaction). */
  running: boolean;
  goalMinutes: number;
}

const ClockContext = createContext<StudyClock>({ seconds: 0, running: false, goalMinutes: 25 });
export const useStudyClock = () => useContext(ClockContext);

/**
 * Counts active study seconds (tab visible and the learner interacted in the
 * last two minutes), shows them live, and reports them to the server about
 * once a minute.
 */
export function StudyClockProvider({ enabled, goalMinutes, onAchievements, children }: { enabled: boolean; goalMinutes: number; onAchievements: (a: Achievement[]) => void; children: ReactNode }) {
  const lastInput = useRef(Date.now());
  const pending = useRef(0);
  const base = useRef(0);
  const day = useRef(localDate());
  const cb = useRef(onAchievements);
  cb.current = onAchievements;
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      api<{ seconds: number }>('/progress/time')
        .then((r) => {
          if (!alive) return;
          base.current = r.seconds;
          setSeconds(r.seconds + pending.current);
        })
        .catch(() => undefined);
    void load();

    const mark = () => {
      lastInput.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const flush = () => {
      const s = Math.min(300, pending.current);
      if (s < 5) return;
      pending.current -= s;
      base.current += s;
      post<{ seconds: number; achievements: Achievement[] }>('/progress/time', { seconds: s })
        .then((r) => {
          base.current = r.seconds;
          if (r.achievements?.length) cb.current(r.achievements);
        })
        .catch(() => {
          pending.current += s;
          base.current -= s;
        });
    };

    const tick = setInterval(() => {
      if (localDate() !== day.current) {
        // A new day started: report what is left for yesterday, start from zero.
        flush();
        day.current = localDate();
        base.current = 0;
        pending.current = 0;
      }
      const active = document.visibilityState === 'visible' && Date.now() - lastInput.current < IDLE_MS;
      setRunning(active);
      if (active) {
        pending.current += 1;
        setSeconds(base.current + pending.current);
      }
      if (pending.current >= FLUSH_EVERY) flush();
    }, 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      clearInterval(tick);
      flush();
      events.forEach((e) => window.removeEventListener(e, mark));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);

  return <ClockContext.Provider value={{ seconds, running, goalMinutes }}>{children}</ClockContext.Provider>;
}
