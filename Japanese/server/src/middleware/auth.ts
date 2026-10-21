import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE, verifyToken } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  const userId = token ? verifyToken(token) : null;
  if (!userId) {
    next(new HttpError(401, 'Authentication required'));
    return;
  }
  req.userId = userId;
  next();
}

/** userId of an authenticated request (requireAuth must run first). */
export function uid(req: Request): string {
  if (!req.userId) throw new HttpError(401, 'Authentication required');
  return req.userId;
}
