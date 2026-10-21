// One-off: build a progress snapshot from a backup database copy.
// Usage: npx tsx prisma/recover-snapshot.ts <path-to-backup.db>
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { snapshotLearning } from './preserve.js';

const db = process.argv[2];
const prisma = new PrismaClient({ datasources: { db: { url: `file:${db}` } } });
const snap = await snapshotLearning(prisma);
fs.writeFileSync(new URL('./.learning-snapshot.json', import.meta.url), JSON.stringify(snap));
console.log({ progress: snap.progress.length, reviews: snap.reviews.length, favorites: snap.favorites.length, attempts: snap.attempts.length, days: snap.dayProgress.length });
console.log(snap.progress.map((p) => `${p.userId.slice(-4)} ${p.lesson} ${p.status}`).join('\n'));
await prisma.$disconnect();
