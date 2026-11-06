// Offline support for reviews: if a grade can't be sent, it is queued in the
// browser and sent automatically when the connection returns.

import { ApiError, post } from './api';

const KEY = 'fp-offline-queue';

interface Queued {
  path: string;
  body: unknown;
  at: number;
}

function read(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Queued[];
  } catch {
    return [];
  }
}

function write(items: Queued[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-500)));
  } catch {
    /* storage full or blocked — nothing more we can do */
  }
}

export function pendingCount(): number {
  return read().length;
}

/** POST, or queue it for later when offline. Returns null when queued. */
export async function postOrQueue<T>(path: string, body: unknown): Promise<T | null> {
  try {
    return await post<T>(path, body);
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      write([...read(), { path, body, at: Date.now() }]);
      return null;
    }
    throw err;
  }
}

let flushing = false;
export async function flushQueue(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    let items = read();
    while (items.length) {
      const [first, ...rest] = items;
      try {
        await post(first.path, first.body);
        sent++;
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) break;
        // Server rejected it (e.g. word deleted) — drop it rather than retrying forever.
      }
      items = rest;
      write(items);
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export function startOfflineSync() {
  window.addEventListener('online', () => void flushQueue());
  void flushQueue();
}
