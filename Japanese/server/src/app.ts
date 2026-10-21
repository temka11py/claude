import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { lessonsRouter } from './routes/lessons.js';
import { libraryRouter } from './routes/library.js';
import { practiceRouter } from './routes/practice.js';
import { quizRouter } from './routes/quiz.js';
import { reviewRouter } from './routes/review.js';
import { progressRouter } from './routes/progress.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, HttpError } from './lib/http.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/settings', requireAuth, settingsRouter);
  app.use('/api/review', requireAuth, reviewRouter);
  app.use('/api', requireAuth, lessonsRouter, libraryRouter, practiceRouter, quizRouter, progressRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API route not found')));

  // Serve the built client in production (npm run build && npm start).
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
