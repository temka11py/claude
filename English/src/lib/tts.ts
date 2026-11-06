// Text-to-speech with two engines behind one small interface:
// - natural voices: neural audio made by the app's own server (Kokoro, see
//   server/services/speech.ts) and played with an <audio> element;
// - the browser's built-in speech engine, used when natural voices are off or
//   unavailable, or when a line's audio doesn't arrive in time.
//
// Scripts are spoken one line (segment) at a time: that gives reliable
// pause/resume, per-speaker voices, natural pauses between speakers and live
// highlighting of the current line.

import { neuralVoicesFor, speechChunks } from '@shared/voices';
import { get, post } from './api';

export interface Segment {
  text: string;
  voice?: 'female' | 'male';
  accent?: string;
  /** Speaker name, so two speakers of the same gender and accent still sound different. */
  speaker?: string;
}

export interface PlayOptions {
  rate?: number;
  startAt?: number;
  onSegment?: (index: number) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  /** True while waiting for a natural voice to be prepared. */
  onWaiting?: (waiting: boolean) => void;
  /** How long to wait for natural audio before using the browser voice instead. */
  waitMs?: number;
}

export interface Playback {
  pause(): void;
  resume(): void;
  stop(): void;
  readonly index: number;
  readonly paused: boolean;
}

const FEMALE = /(female|zira|hazel|susan|libby|sonia|jenny|aria|samantha|karen|moira|tessa|serena|victoria|fiona|kate|catherine|emma|amy|joanna|salli|kimberly|ivy|natasha|clara|heera|neerja|michelle|ana|jane|nancy|sara|ava|allison|emily|maisie|olivia|hollie|bella)/i;
const MALE = /(\bmale|david|george|mark|ryan|guy|daniel|alex\b|fred|oliver|thomas|james|brian|arthur|william|christopher|eric|roger|steffan|prabhat|liam|tony|jason|davis|andrew|brandon|noah|elliot|ethan|harry)/i;

let cachedVoices: SpeechSynthesisVoice[] = [];

function browserSpeech(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Can this browser play speech at all (natural voices or its own engine)? */
export function ttsAvailable(): boolean {
  return typeof Audio !== 'undefined' || browserSpeech();
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!browserSpeech()) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) {
    cachedVoices = now;
    return Promise.resolve(now);
  }
  return new Promise((resolve) => {
    const done = () => {
      cachedVoices = window.speechSynthesis.getVoices();
      resolve(cachedVoices);
    };
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

export function englishVoices(): SpeechSynthesisVoice[] {
  return cachedVoices.filter((v) => v.lang.toLowerCase().startsWith('en'));
}

function score(v: SpeechSynthesisVoice, accent?: string, gender?: 'female' | 'male'): number {
  let s = 0;
  const lang = v.lang.replace('_', '-').toLowerCase();
  if (accent && lang === accent.toLowerCase()) s += 4;
  else if (accent && lang.startsWith(accent.slice(0, 2).toLowerCase())) s += 1;
  if (gender === 'female' && FEMALE.test(v.name)) s += 3;
  if (gender === 'male' && MALE.test(v.name)) s += 3;
  if (gender === 'female' && MALE.test(v.name)) s -= 3;
  if (gender === 'male' && FEMALE.test(v.name)) s -= 3;
  if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 2;
  if (v.localService === false) s += 0.5;
  return s;
}

/** Best browser voice for a speaker. `preferred` (voiceURI from settings) wins for the default narrator. */
export function pickVoice(accent?: string, gender?: 'female' | 'male', preferred?: string | null): SpeechSynthesisVoice | null {
  const voices = englishVoices();
  if (!voices.length) return null;
  if (preferred && !gender) {
    const p = voices.find((v) => v.voiceURI === preferred);
    if (p) return p;
  }
  return [...voices].sort((a, b) => score(b, accent, gender) - score(a, accent, gender))[0];
}

let defaultVoice: string | null = null;
let defaultRate = 1;
export function setTtsDefaults(voiceURI: string | null, rate: number) {
  defaultVoice = voiceURI;
  defaultRate = rate;
}

// ------------------------------------------------------------------ natural voices

const NATURAL_KEY = 'fp:natural-voices';

export interface NaturalVoiceStatus {
  enabled: boolean;
  state: 'off' | 'idle' | 'loading' | 'ready' | 'failed';
  queued: number;
  error: string | null;
}

/** The learner's choice on this device (on unless turned off in Settings). */
export function naturalVoicesWanted(): boolean {
  try {
    return localStorage.getItem(NATURAL_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setNaturalVoicesWanted(on: boolean) {
  try {
    localStorage.setItem(NATURAL_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  statusCache = null;
}

let statusCache: { at: number; value: Promise<NaturalVoiceStatus | null> } | null = null;
export function naturalVoiceStatus(fresh = false): Promise<NaturalVoiceStatus | null> {
  if (!fresh && statusCache && Date.now() - statusCache.at < 30_000) return statusCache.value;
  const value = get<NaturalVoiceStatus>('/tts/status').catch(() => null);
  statusCache = { at: Date.now(), value };
  return value;
}

async function naturalAvailable(): Promise<boolean> {
  if (!naturalVoicesWanted() || typeof Audio === 'undefined') return false;
  const s = await naturalVoiceStatus();
  return !!s?.enabled && s.state !== 'failed';
}

interface Unit {
  seg: number;
  text: string;
  voice: string;
}

function unitsFor(segments: Segment[]): Unit[] {
  const voices = neuralVoicesFor(segments);
  return segments.flatMap((s, seg) => speechChunks(s.text).map((text) => ({ seg, text, voice: voices[seg] })));
}

const speechUrl = (u: Unit) => `/api/tts/speech?voice=${u.voice}&text=${encodeURIComponent(u.text)}`;

/** Ask the server to prepare these lines now, so they are ready when played. */
export function prepare(segments: Segment[]): void {
  void naturalAvailable().then((ok) => {
    if (ok) post('/tts/prefetch', { items: unitsFor(segments).map(({ voice, text }) => ({ voice, text })) }).catch(() => undefined);
  });
}

// ------------------------------------------------------------------ playback

let active: Playback | null = null;

export function play(segments: Segment[], opts: PlayOptions = {}): Playback {
  stopSpeaking();
  const units = unitsFor(segments);
  const startAt = opts.startAt ?? 0;
  const first = units.findIndex((u) => u.seg >= startAt);
  let unit = first < 0 ? units.length : first;
  let index = startAt;
  let paused = false;
  let stopped = false;
  let natural: boolean | null = null;
  let audio: HTMLAudioElement | null = null;
  const preloaded = new Map<number, HTMLAudioElement>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const waitMs = opts.waitMs ?? (segments.length > 1 ? 60_000 : 4_000);
  const rate = () => Math.max(0.5, Math.min(2, (opts.rate ?? 1) * defaultRate));
  const speakerOf = (seg: number) => segments[seg]?.speaker ?? `${segments[seg]?.voice}|${segments[seg]?.accent}`;
  const distinctVoices = new Set(segments.map((s) => `${s.voice}|${s.accent}`)).size > 1;

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers.clear();
  };
  const release = (el: HTMLAudioElement) => {
    el.onplaying = el.onended = el.onerror = null;
    el.pause();
    el.removeAttribute('src');
    el.load();
  };

  const audioFor = (i: number) => {
    let el = preloaded.get(i);
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      el.src = speechUrl(units[i]);
      preloaded.set(i, el);
    }
    return el;
  };

  const advance = () => {
    const prev = units[unit];
    unit += 1;
    if (unit >= units.length || !natural) {
      speakCurrent();
      return;
    }
    // Natural pacing: a short breath within a turn, a longer pause when the speaker changes.
    const next = units[unit];
    const gap = next.seg === prev.seg ? 160 : speakerOf(next.seg) === speakerOf(prev.seg) ? 300 : 480;
    later(speakCurrent, gap / rate());
  };

  const speakBrowser = (u: Unit) => {
    if (!browserSpeech()) {
      opts.onError?.('Speech is not available right now. Read the transcript instead, or try again in a moment.');
      return;
    }
    const seg = segments[u.seg];
    const synth = window.speechSynthesis;
    const utt = new SpeechSynthesisUtterance(u.text);
    const voice = pickVoice(seg.accent, seg.voice, defaultVoice);
    if (voice) {
      utt.voice = voice;
      utt.lang = voice.lang;
    } else {
      utt.lang = seg.accent ?? 'en-GB';
    }
    utt.rate = rate();
    // With a single installed voice, vary pitch so different speakers are distinguishable.
    if (distinctVoices && englishVoices().length <= 1) utt.pitch = seg.voice === 'male' ? 0.8 : 1.15;
    utt.onend = () => {
      if (!stopped && !paused) advance();
    };
    utt.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      opts.onError?.(`Speech error: ${e.error}`);
    };
    synth.speak(utt);
  };

  const speakNatural = (u: Unit) => {
    const el = audioFor(unit);
    preloaded.delete(unit);
    audio = el;
    el.playbackRate = rate();
    el.preservesPitch = true;
    let started = false;
    const waiting = later(() => !started && opts.onWaiting?.(true), 400);
    // Audio that takes too long (or fails) falls back to the browser voice for the rest of this playback.
    const fallback = () => {
      if (started || stopped || audio !== el) return;
      clearTimeout(waiting);
      clearTimeout(giveUp);
      opts.onWaiting?.(false);
      release(el);
      audio = null;
      natural = false;
      void loadVoices().then(() => !stopped && !paused && speakBrowser(u));
    };
    const giveUp = later(fallback, waitMs);
    const finished = () => {
      release(el);
      audio = null;
      if (!stopped && !paused) advance();
    };
    el.onplaying = () => {
      if (started) return;
      started = true;
      clearTimeout(waiting);
      clearTimeout(giveUp);
      opts.onWaiting?.(false);
    };
    el.onended = finished;
    el.onerror = () => (started ? finished() : fallback());
    el.play().catch((e: Error) => e.name !== 'AbortError' && fallback());
    if (unit + 1 < units.length) audioFor(unit + 1);
  };

  function speakCurrent() {
    if (stopped || paused) return;
    if (unit >= units.length) {
      opts.onEnd?.();
      return;
    }
    const u = units[unit];
    index = u.seg;
    opts.onSegment?.(u.seg);
    if (natural) speakNatural(u);
    else speakBrowser(u);
  }

  void (async () => {
    natural = await naturalAvailable();
    if (stopped) return;
    if (natural) {
      // Let the server work through the whole script in order while the first lines play.
      post('/tts/prefetch', { items: units.slice(unit).map(({ voice, text }) => ({ voice, text })) }).catch(() => undefined);
    } else {
      await loadVoices();
      if (!browserSpeech()) {
        opts.onError?.('Speech is not supported in this browser. Try Chrome, Edge or Safari.');
        return;
      }
    }
    speakCurrent();
  })();

  const playback: Playback = {
    pause() {
      if (paused || stopped) return;
      paused = true;
      clearTimers();
      opts.onWaiting?.(false);
      if (audio) audio.pause();
      if (browserSpeech()) window.speechSynthesis.cancel();
    },
    resume() {
      if (!paused || stopped) return;
      paused = false;
      // A natural line continues where it stopped; one still loading, or a browser line, starts again.
      if (audio && audio.currentTime > 0) {
        void audio.play().catch(() => undefined);
        return;
      }
      if (audio) release(audio);
      audio = null;
      speakCurrent();
    },
    stop() {
      stopped = true;
      clearTimers();
      if (audio) release(audio);
      audio = null;
      preloaded.forEach(release);
      preloaded.clear();
      if (browserSpeech()) window.speechSynthesis.cancel();
      if (active === playback) active = null;
    },
    get index() {
      return index;
    },
    get paused() {
      return paused;
    },
  };
  active = playback;
  return playback;
}

/** Speak a single word or sentence. */
export function say(text: string, opts: { rate?: number; accent?: string; voice?: 'female' | 'male' } = {}): Playback {
  return play([{ text, accent: opts.accent ?? 'en-GB', voice: opts.voice }], { rate: opts.rate ?? 0.95 });
}

export function stopSpeaking() {
  active?.stop();
  if (browserSpeech()) window.speechSynthesis.cancel();
}
