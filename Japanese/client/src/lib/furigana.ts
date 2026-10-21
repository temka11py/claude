import { useEffect, useState } from 'react';
import { post } from '../api/client';

const KANA = /[぀-ヿー]/;
const KANJI = /[一-龯々〆ヶ]/;

export const hasKanji = (text: string) => KANJI.test(text);

export interface RubySegment {
  text: string;
  rt?: string;
}

/**
 * Split a word and its reading so furigana sits only above the kanji:
 * 食べます / たべます → [食|た] べます ; お茶 / おちゃ → お [茶|ちゃ]
 */
export function splitRuby(surface: string, reading?: string): RubySegment[] {
  if (!reading || !/[一-龯々]/.test(surface)) return [{ text: surface }];
  // Surface kana may be katakana (モンゴル人) while the reading is hiragana.
  const hira = (c: string) => c.replace(/[ァ-ヶ]/g, (k) => String.fromCharCode(k.charCodeAt(0) - 0x60));
  const same = (a: string, b: string) => KANA.test(a) && hira(a) === hira(b);
  let start = 0;
  while (start < surface.length && start < reading.length && same(surface[start], reading[start])) start++;
  let end = 0;
  while (end < surface.length - start && end < reading.length - start && same(surface[surface.length - 1 - end], reading[reading.length - 1 - end])) end++;
  const segments: RubySegment[] = [];
  if (start) segments.push({ text: surface.slice(0, start) });
  segments.push({ text: surface.slice(start, surface.length - end), rt: reading.slice(start, reading.length - end) });
  if (end) segments.push({ text: surface.slice(surface.length - end) });
  return segments;
}

// ───────────── automatic furigana for any sentence (server-side analyser) ─────────────
// Requests made in the same moment are sent as one batch; results are cached
// for the whole session.

const cache = new Map<string, RubySegment[]>();
const waiting = new Map<string, ((segs: RubySegment[]) => void)[]>();
let queue: string[] = [];
let timer: number | null = null;

async function flush() {
  timer = null;
  const batch = queue;
  queue = [];
  for (let i = 0; i < batch.length; i += 150) {
    const part = batch.slice(i, i + 150);
    let results: RubySegment[][];
    try {
      const r = await post<{ results: { t: string; r?: string }[][] }>('/furigana', { texts: part });
      results = r.results.map((segs) => segs.map((s) => ({ text: s.t, rt: s.r })));
      part.forEach((t, j) => cache.set(t, results[j]));
    } catch {
      results = part.map((t) => [{ text: t }]); // not cached: retried next time
    }
    part.forEach((t, j) => {
      waiting.get(t)?.forEach((resolve) => resolve(results[j]));
      waiting.delete(t);
    });
  }
}

export function requestFurigana(text: string): Promise<RubySegment[]> {
  if (!hasKanji(text)) return Promise.resolve([{ text }]);
  const hit = cache.get(text);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const list = waiting.get(text);
    if (list) {
      list.push(resolve);
      return;
    }
    waiting.set(text, [resolve]);
    queue.push(text);
    timer ??= window.setTimeout(flush, 15);
  });
}

/** Furigana segments for `text`, or null while loading / when disabled. */
export function useFurigana(text: string, enabled: boolean): RubySegment[] | null {
  const [segs, setSegs] = useState<RubySegment[] | null>(() => (enabled ? cache.get(text) ?? null : null));
  useEffect(() => {
    if (!enabled || !hasKanji(text)) {
      setSegs(null);
      return;
    }
    let alive = true;
    const hit = cache.get(text);
    if (hit) setSegs(hit);
    else requestFurigana(text).then((s) => alive && setSegs(s));
    return () => {
      alive = false;
    };
  }, [text, enabled]);
  return segs;
}
