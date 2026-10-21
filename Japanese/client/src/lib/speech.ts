// Audio playback abstraction: real audio files when available, otherwise the
// browser's Speech Synthesis API (Japanese voice). Recognition uses Web Speech API.

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

let cachedVoice: SpeechSynthesisVoice | null | undefined;
function japaneseVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  cachedVoice = voices.find((v) => v.lang === 'ja-JP' && /google|natural|online/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith('ja')) ?? null;
  return cachedVoice;
}
if (ttsSupported) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    cachedVoice = undefined;
  });
}

export function hasJapaneseVoice(): boolean {
  return !!japaneseVoice();
}

let currentAudio: HTMLAudioElement | null = null;
let generation = 0;

export function stopAudio() {
  generation++;
  if (ttsSupported) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

function speakOnce(text: string, rate: number, pitch: number, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported || gen !== generation) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    const voice = japaneseVoice();
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = pitch;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
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
