import { useEffect, useRef } from 'react';
import { post } from '../api/client';
import type { Achievement } from '../api/types';

const IDLE_MS = 2 * 60_000;
const FLUSH_EVERY = 60;

/**
 * Counts active study seconds (tab visible and the learner interacted in the
 * last two minutes) and reports them to the server about once a minute.
 */
export function useStudyTimer(enabled: boolean, onAchievements: (a: Achievement[]) => void) {
  const lastInput = useRef(Date.now());
  const pending = useRef(0);
  const cb = useRef(onAchievements);
  cb.current = onAchievements;

  useEffect(() => {
    if (!enabled) return;
    const mark = () => {
      lastInput.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const flush = () => {
      const seconds = Math.min(300, pending.current);
      if (seconds < 5) return;
      pending.current -= seconds;
      post<{ achievements: Achievement[] }>('/progress/time', { seconds })
        .then((r) => {
          if (r.achievements?.length) cb.current(r.achievements);
        })
        .catch(() => {
          pending.current += seconds;
        });
    };

    const tick = setInterval(() => {
      const active = document.visibilityState === 'visible' && Date.now() - lastInput.current < IDLE_MS;
      if (active) pending.current += 1;
      if (pending.current >= FLUSH_EVERY) flush();
    }, 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(tick);
      flush();
      events.forEach((e) => window.removeEventListener(e, mark));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}
