// Natural (neural) voices for scripts, used by the browser player and by the
// server when it prepares audio ahead of time — both must pick the same voice
// for a line so prepared audio is found in the cache.
//
// Kokoro has American and British voices only, so other accents (Australian,
// Irish, Indian…) use the British ones and US/Canadian use the American ones.

export type VoiceGender = 'female' | 'male';

/** Best voices first. */
const POOLS: Record<'us' | 'gb', Record<VoiceGender, string[]>> = {
  us: { female: ['af_heart', 'af_bella', 'af_nicole', 'af_sarah'], male: ['am_michael', 'am_fenrir', 'am_puck', 'am_echo'] },
  gb: { female: ['bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily'], male: ['bm_george', 'bm_fable', 'bm_lewis', 'bm_daniel'] },
};

export const NEURAL_VOICES: readonly string[] = Object.values(POOLS).flatMap((p) => [...p.female, ...p.male]);

function family(accent?: string): 'us' | 'gb' {
  return accent && /^en-(us|ca)$/i.test(accent) ? 'us' : 'gb';
}

/** Voice for text that has no speaker (words, example sentences, shadowing). */
export function narratorVoice(accent?: string): string {
  return POOLS[family(accent)].female[0];
}

export interface VoiceSegment {
  text: string;
  /** Speaker name: lines of one speaker share a voice, different speakers get different voices. */
  speaker?: string;
  voice?: VoiceGender;
  accent?: string;
}

/** The neural voice for each segment of one script. */
export function neuralVoicesFor(segments: readonly VoiceSegment[]): string[] {
  const bySpeaker = new Map<string, string>();
  const used = new Set<string>();
  return segments.map((s) => {
    if (!s.voice) return narratorVoice(s.accent);
    const key = s.speaker ?? `${s.voice}|${s.accent ?? ''}`;
    let v = bySpeaker.get(key);
    if (!v) {
      const pool = POOLS[family(s.accent)][s.voice];
      v = pool.find((x) => !used.has(x)) ?? pool[bySpeaker.size % pool.length];
      bySpeaker.set(key, v);
      used.add(v);
    }
    return v;
  });
}

/** Text as it is sent to the speech model (and used in the cache key). */
export function speechText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Lines longer than this are spoken (and cached) a few sentences at a time, so playback starts sooner. */
const CHUNK_CHARS = 220;

/** The pieces a line is spoken in: the whole line, or groups of sentences for a long line. */
export function speechChunks(raw: string): string[] {
  const text = speechText(raw);
  if (text.length <= CHUNK_CHARS) return text ? [text] : [];
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if (current && (current + s).length > CHUNK_CHARS) {
      chunks.push(current.trim());
      current = '';
    }
    current += s;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
