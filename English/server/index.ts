import fs from 'node:fs';
import { config } from './config';
import { migrate, openDatabase } from './db';
import { importAll } from './content/importer';
import { createAIProvider } from './ai/provider';
import { buildApp } from './app';
import { SpeechService } from './services/speech';

async function main() {
  const db = openDatabase(config.databasePath);
  const applied = migrate(db);
  if (applied.length) console.log(`Database migrated: ${applied.join(', ')}`);

  const report = importAll(db, config.contentDir);
  console.log(`Content: ${report.imported.length} imported, ${report.skipped.length} unchanged, ${report.errors.length} with errors`);
  for (const e of report.errors) console.warn(`  ✗ ${e.file}\n${e.message}`);

  fs.mkdirSync(config.recordingsDir, { recursive: true });
  const ai = createAIProvider(config);
  const speech = new SpeechService(config.speechCacheDir, config.modelsDir, config.naturalVoices);
  const app = await buildApp({ db, config, ai, speech });
  await app.listen({ port: config.port, host: config.host });
  const web = fs.existsSync(config.distDir) ? `http://localhost:${config.port}` : 'http://localhost:5173 (npm run dev)';
  console.log(`\nFluent Path API on http://${config.host}:${config.port} — open ${web}`);
  console.log(ai.available ? `AI features: on (${ai.model})` : 'AI features: off (set ANTHROPIC_API_KEY in .env to enable)');
  console.log(speech.enabled ? 'Natural voices: on (course audio is prepared in the background)' : 'Natural voices: off (NATURAL_VOICES=false)');
  // Give the first page loads a head start before the background work begins.
  if (speech.enabled) setTimeout(() => speech.warmCourse(db), 20_000).unref();

  const shutdown = async () => {
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
