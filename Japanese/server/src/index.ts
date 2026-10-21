import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { getTokenizer } from './lib/furigana.js';

process.loadEnvFile?.('.env');

const port = Number(process.env.PORT ?? 4000);
const server = createApp().listen(port, () => {
  console.log(`Hanamaru API listening on http://localhost:${port}`);
  // Load the furigana dictionary in the background so the first page is fast.
  getTokenizer().catch((e) => console.error('furigana dictionary failed to load', e));
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
