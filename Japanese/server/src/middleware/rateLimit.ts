import type { NextFunction, Request, Response } from 'express';

/** Small in-memory fixed-window limiter, enough to slow down credential stuffing. */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    entry.count++;
    if (entry.count > max) {
      res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      return;
    }
    next();
  };
}
