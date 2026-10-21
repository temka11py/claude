const KANA = /[぀-ヿー]/;

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
  let start = 0;
  while (start < surface.length && start < reading.length && KANA.test(surface[start]) && surface[start] === reading[start]) start++;
  let end = 0;
  while (
    end < surface.length - start &&
    end < reading.length - start &&
    KANA.test(surface[surface.length - 1 - end]) &&
    surface[surface.length - 1 - end] === reading[reading.length - 1 - end]
  )
    end++;
  const segments: RubySegment[] = [];
  if (start) segments.push({ text: surface.slice(0, start) });
  segments.push({ text: surface.slice(start, surface.length - end), rt: reading.slice(start, reading.length - end) });
  if (end) segments.push({ text: surface.slice(surface.length - end) });
  return segments;
}
