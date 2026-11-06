// Natural text-to-speech with Kokoro, an open-weight neural voice model that runs
// locally on the CPU: no API key, and it works offline once the model has been
// downloaded into data/models. Each (voice, text) is generated once and cached as
// a WAV file. Requests from a learner who is waiting go first; a background
// warmer prepares the course's scripts ahead of time so they usually play at once.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DB } from '../db';
import { NEURAL_VOICES, narratorVoice, neuralVoicesFor, speechChunks, speechText, type VoiceGender } from '@shared/voices';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
/** Part of the cache path: change it when the model or the audio format changes. */
const CACHE_VERSION = 'kokoro-1.0-fp32';
export const MAX_SPEECH_CHARS = 600;
/** After the model fails to load, wait this long before trying again. */
const RETRY_MS = 10 * 60 * 1000;

export type SpeechPriority = 'now' | 'soon' | 'background';
const PRIORITIES: SpeechPriority[] = ['now', 'soon', 'background'];

export interface SpeechStatus {
  enabled: boolean;
  state: 'off' | 'idle' | 'loading' | 'ready' | 'failed';
  /** Lines waiting to be generated. */
  queued: number;
  error: string | null;
}

interface Engine {
  generate(text: string, opts: { voice: string }): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

interface Job {
  key: string;
  voice: string;
  text: string;
  file: string;
  priority: SpeechPriority;
  promise: Promise<string>;
  resolve: (file: string) => void;
  reject: (err: Error) => void;
}

export interface Script {
  speakers: { name: string; voice: VoiceGender; accent?: string }[];
  lines: { speaker: string; text: string }[];
}

export class SpeechService {
  private engine: Promise<Engine> | null = null;
  private state: SpeechStatus['state'];
  private error: string | null = null;
  private failedAt = 0;
  private queues: Record<SpeechPriority, Job[]> = { now: [], soon: [], background: [] };
  private jobs = new Map<string, Job>();
  private working = false;

  constructor(
    private cacheDir: string,
    private modelsDir: string,
    readonly enabled: boolean,
  ) {
    this.state = enabled ? 'idle' : 'off';
  }

  status(): SpeechStatus {
    return { enabled: this.enabled, state: this.state, queued: this.jobs.size, error: this.error };
  }

  isVoice(voice: string): boolean {
    return NEURAL_VOICES.includes(voice);
  }

  private fileFor(voice: string, text: string): string {
    const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 24);
    return path.join(this.cacheDir, CACHE_VERSION, voice, `${hash}.wav`);
  }

  /** Path of the audio for this line, generating it first if needed. */
  file(voice: string, rawText: string, priority: SpeechPriority = 'now'): Promise<string> {
    const text = speechText(rawText).slice(0, MAX_SPEECH_CHARS);
    if (!this.enabled) return Promise.reject(new Error('Natural voices are turned off.'));
    if (!this.isVoice(voice) || !text) return Promise.reject(new Error('Unknown voice or empty text.'));
    const file = this.fileFor(voice, text);
    if (fs.existsSync(file)) return Promise.resolve(file);
    if (this.state === 'failed' && Date.now() - this.failedAt < RETRY_MS) return Promise.reject(new Error(this.error ?? 'Natural voices are not available.'));

    const key = `${voice}|${text}`;
    const existing = this.jobs.get(key);
    if (existing) {
      // Still waiting in a slower queue: move it up.
      const queue = this.queues[existing.priority];
      const at = queue.indexOf(existing);
      if (at >= 0 && PRIORITIES.indexOf(priority) < PRIORITIES.indexOf(existing.priority)) {
        queue.splice(at, 1);
        existing.priority = priority;
        this.queues[priority].push(existing);
      }
      return existing.promise;
    }
    let resolve!: (f: string) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: Job = { key, voice, text, file, priority, promise, resolve, reject };
    this.jobs.set(key, job);
    this.queues[priority].push(job);
    void this.pump();
    return promise;
  }

  /** Queue lines without waiting for them. */
  prefetch(items: { voice: string; text: string }[], priority: SpeechPriority = 'soon'): void {
    for (const it of items) this.file(it.voice, it.text, priority).catch(() => undefined);
  }

  /** Queue every line of a listening script with the voices the player will use. */
  prefetchScript(script: Script, priority: SpeechPriority = 'soon'): void {
    const segments = script.lines.map((l) => {
      const sp = script.speakers.find((s) => s.name === l.speaker);
      return { text: l.text, speaker: l.speaker, voice: sp?.voice, accent: sp?.accent };
    });
    const voices = neuralVoicesFor(segments);
    this.prefetch(segments.flatMap((s, i) => speechChunks(s.text).map((text) => ({ voice: voices[i], text }))), priority);
  }

  /**
   * Prepare the whole course in the background, in study order: scripts of lessons not yet
   * completed first, then pronunciation sentences and vocabulary words.
   */
  warmCourse(db: DB): void {
    if (!this.enabled) return;
    const scripts = db
      .prepare(
        `SELECT lm.data FROM listening_materials lm
         LEFT JOIN lessons l ON l.id = lm.lesson_id
         LEFT JOIN modules m ON m.id = COALESCE(l.module_id, lm.module_id)
         LEFT JOIN levels lv ON lv.code = m.level_code
         WHERE m.id IS NULL OR m.status = 'published'
         ORDER BY EXISTS (SELECT 1 FROM user_progress p WHERE p.lesson_id = lm.lesson_id AND p.status = 'completed'),
                  COALESCE(lv.ord, 99), COALESCE(m.ord, 99), COALESCE(l.ord, 99)`,
      )
      .pluck()
      .all() as string[];
    for (const data of scripts) this.prefetchScript(JSON.parse(data) as Script, 'background');

    const narrator = narratorVoice('en-GB');
    const topics = db.prepare('SELECT data FROM pronunciation_topics').pluck().all() as string[];
    for (const data of topics) {
      const t = JSON.parse(data) as { items?: { say: string }[]; shadowing?: { text: string }[] };
      this.prefetch([...(t.shadowing ?? []).map((s) => s.text), ...(t.items ?? []).map((i) => i.say)].map((text) => ({ voice: narrator, text })), 'background');
    }
    const words = db.prepare(`SELECT DISTINCT word FROM vocabulary WHERE lesson_id IS NOT NULL ORDER BY cefr_level, module_id, ord`).pluck().all() as string[];
    this.prefetch(words.map((text) => ({ voice: narrator, text })), 'background');
  }

  private nextJob(): Job | undefined {
    for (const p of PRIORITIES) {
      const job = this.queues[p].shift();
      if (job) return job;
    }
    return undefined;
  }

  private loadEngine(): Promise<Engine> {
    this.engine ??= (async () => {
      this.state = 'loading';
      const { env } = await import('@huggingface/transformers');
      env.cacheDir = this.modelsDir;
      const { KokoroTTS } = await import('kokoro-js');
      const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'fp32', device: 'cpu' });
      this.state = 'ready';
      this.error = null;
      return tts as unknown as Engine;
    })().catch((err: Error) => {
      this.engine = null;
      this.state = 'failed';
      this.failedAt = Date.now();
      this.error = `The voice model could not be loaded: ${err.message}`;
      console.warn(this.error);
      throw err;
    });
    return this.engine;
  }

  private async pump(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      for (let job = this.nextJob(); job; job = this.nextJob()) {
        try {
          if (!fs.existsSync(job.file)) {
            // Background preparation yields the CPU to whatever the learner is doing.
            setLowPriority(job.priority === 'background');
            const engine = await this.loadEngine();
            const audio = await engine.generate(job.text, { voice: job.voice });
            fs.mkdirSync(path.dirname(job.file), { recursive: true });
            const tmp = `${job.file}.${process.pid}.tmp`;
            fs.writeFileSync(tmp, encodeWav(trimSilence(audio.audio, audio.sampling_rate), audio.sampling_rate));
            fs.renameSync(tmp, job.file);
          }
          job.resolve(job.file);
        } catch (err) {
          job.reject(err as Error);
          if (this.state === 'failed') this.rejectAll(err as Error);
        } finally {
          this.jobs.delete(job.key);
        }
      }
    } finally {
      setLowPriority(false);
      this.working = false;
    }
  }

  private rejectAll(err: Error) {
    for (const p of PRIORITIES) {
      for (const job of this.queues[p]) {
        job.reject(err);
        this.jobs.delete(job.key);
      }
      this.queues[p] = [];
    }
  }
}

let lowPriority = false;
function setLowPriority(low: boolean) {
  if (low === lowPriority) return;
  lowPriority = low;
  try {
    os.setPriority(low ? os.constants.priority.PRIORITY_BELOW_NORMAL : os.constants.priority.PRIORITY_NORMAL);
  } catch {
    // Not permitted on this system — generation still works, just at normal priority.
  }
}

/** Cut the model's leading and trailing silence; the player adds its own pauses between lines. */
function trimSilence(samples: Float32Array, rate: number): Float32Array {
  const threshold = 0.01;
  let start = 0;
  let end = samples.length - 1;
  while (start < end && Math.abs(samples[start]) < threshold) start++;
  while (end > start && Math.abs(samples[end]) < threshold) end--;
  return samples.subarray(Math.max(0, start - Math.round(rate * 0.04)), Math.min(samples.length, end + Math.round(rate * 0.08)));
}

/** 16-bit PCM mono WAV. */
function encodeWav(samples: Float32Array, rate: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}
