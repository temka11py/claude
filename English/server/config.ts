import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile();
} catch {
  // No .env file — defaults apply.
}

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '127.0.0.1',
  databasePath: path.resolve(ROOT_DIR, process.env.DATABASE_PATH ?? './data/fluent-path.db'),
  recordingsDir: path.resolve(ROOT_DIR, process.env.RECORDINGS_DIR ?? './data/recordings'),
  contentDir: path.resolve(ROOT_DIR, process.env.CONTENT_DIR ?? './content'),
  distDir: path.resolve(ROOT_DIR, 'dist'),
  allowRegistration: bool(process.env.ALLOW_REGISTRATION, false),
  contentWriteBack: bool(process.env.CONTENT_WRITE_BACK, true),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
  aiModel: process.env.AI_MODEL?.trim() || 'claude-opus-5',
  /** Natural neural voices generated on this computer (see server/services/speech.ts). */
  naturalVoices: bool(process.env.NATURAL_VOICES, true),
  speechCacheDir: path.resolve(ROOT_DIR, process.env.SPEECH_CACHE_DIR ?? './data/speech'),
  modelsDir: path.resolve(ROOT_DIR, process.env.MODELS_DIR ?? './data/models'),
  sessionDays: 60,
  /** Recording uploads larger than this are rejected. */
  maxRecordingBytes: 15 * 1024 * 1024,
};

export type AppConfig = typeof config;
