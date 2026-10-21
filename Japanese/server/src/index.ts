import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

process.loadEnvFile?.('.env');

const port = Number(process.env.PORT ?? 4000);
const server = createApp().listen(port, () => {
  console.log(`Hanamaru API listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
