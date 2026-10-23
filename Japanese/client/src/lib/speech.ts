// Audio playback abstraction: real audio files when available, otherwise the
// browser's Speech Synthesis API (Japanese voice). Recognition uses Web Speech API.

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * Japanese voices in the order to try them: the best online "natural" voice,
 * then an installed (offline) voice, then the rest.
 */
function japaneseVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported) return [];
  const ja = window.speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').startsWith('ja'));
  const online = ja.filter((v) => /google|natural|online/i.test(v.name));
  const local = ja.filter((v) => v.localService);
  return [...new Set([online[0], local[0], ...ja].filter((v): v is SpeechSynthesisVoice => !!v))];
}

/** Browsers load (online) voices a moment after the page opens; wait up to `ms` for a Japanese one. */
function voicesReady(ms = 2500): Promise<void> {
  if (!ttsSupported || japaneseVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const done = () => {
      synth.removeEventListener?.('voiceschanged', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => japaneseVoices().length && done();
    synth.addEventListener?.('voiceschanged', check);
    const timer = setTimeout(done, ms);
  });
}
if (ttsSupported) window.speechSynthesis.getVoices(); // starts loading the voice list

export function hasJapaneseVoice(): boolean {
  return japaneseVoices().length > 0;
}

// Speech that fails (no Japanese voice, offline online-voice) is reported here so
// the app can explain it instead of staying silent.
type FailureListener = (reason: 'no-voice' | 'failed') => void;
const failureListeners = new Set<FailureListener>();
export function onSpeechFailure(fn: FailureListener) {
  failureListeners.add(fn);
  return () => {
    failureListeners.delete(fn);
  };
}

let currentAudio: HTMLAudioElement | null = null;
let generation = 0;
let lastCancel = 0;

export function stopAudio() {
  generation++;
  if (ttsSupported) {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) {
      synth.cancel();
      lastCancel = performance.now();
    }
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One attempt with one voice: true when the browser actually started speaking. */
function trySpeak(text: string, rate: number, pitch: number, voice: SpeechSynthesisVoice | null, gen: number): Promise<boolean> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = pitch;
    let started = false;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve(ok);
    };
    u.onstart = () => {
      started = true;
    };
    u.onend = () => finish(started || gen !== generation);
    u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled');
    // Online voices need a moment (often 1–3 s); if nothing starts within 6 s the voice is not working.
    const watchdog = setTimeout(() => {
      if (started) return;
      synth.cancel();
      lastCancel = performance.now();
      finish(false);
    }, 6000);
    synth.resume(); // Chrome can be left in a paused state
    synth.speak(u);
  });
}

async function speakOnce(text: string, rate: number, pitch: number, gen: number): Promise<void> {
  if (!ttsSupported || gen !== generation) return;
  await voicesReady();
  // Chrome drops an utterance queued right after cancel(); give it a short pause.
  const sinceCancel = performance.now() - lastCancel;
  if (sinceCancel < 150) await sleep(150 - sinceCancel);
  if (gen !== generation) return;
  const voices = japaneseVoices();
  if (!voices.length) {
    failureListeners.forEach((fn) => fn('no-voice'));
    return;
  }
  // Try the best voice, then one other Japanese voice.
  for (const voice of voices.slice(0, 2)) {
    if (gen !== generation) return;
    if (await trySpeak(text, rate, pitch, voice, gen)) return;
    await sleep(150);
  }
  if (gen === generation) failureListeners.forEach((fn) => fn('failed'));
}

export interface ScriptPart {
  speaker: string;
  text: string;
}

/** "女：…\n男：…" → speaker-tagged parts. Lines without a speaker are narrated. */
export function parseScript(text: string): ScriptPart[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([^：:]{1,8})[：:](.+)$/);
      return m ? { speaker: m[1], text: m[2] } : { speaker: '', text: line };
    });
}

const PITCHES = [1, 1.3, 0.8, 1.15];

/** Play a sequence of lines, giving each speaker a slightly different pitch. */
export async function speakScript(parts: ScriptPart[], rate = 0.9): Promise<void> {
  stopAudio();
  const gen = generation;
  const speakers = [...new Set(parts.map((p) => p.speaker))];
  for (const p of parts) {
    if (gen !== generation) return;
    const pitch = PITCHES[speakers.indexOf(p.speaker) % PITCHES.length];
    await speakOnce(p.text, rate, pitch, gen);
    await new Promise((r) => setTimeout(r, 250));
  }
}

export function speak(text: string, rate = 0.9): Promise<void> {
  return speakScript([{ speaker: '', text }], rate);
}

/** Play a real recording if present, otherwise synthesise the text. */
export async function playSource(source: { audioUrl?: string | null; text: string }, rate = 0.9): Promise<void> {
  if (source.audioUrl) {
    stopAudio();
    const audio = new Audio(source.audioUrl);
    audio.playbackRate = rate;
    currentAudio = audio;
    await audio.play().catch(() => undefined);
    await new Promise<void>((resolve) => audio.addEventListener('ended', () => resolve(), { once: true }));
    return;
  }
  return speakScript(parseScript(source.text), rate);
}

// ───────────── speech recognition ─────────────

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
export interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function createRecognizer(): Recognizer | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = 'ja-JP';
  r.interimResults = true;
  r.continuous = true;
  return r;
}
