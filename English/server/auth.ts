import crypto from 'node:crypto';
import type { DB } from './db';

export const SESSION_COOKIE = 'fp_session';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(db: DB, userId: number, days: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + days * 86400000);
  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    tokenHash(token),
    userId,
    now.toISOString(),
    expires.toISOString(),
  );
  // Housekeeping: drop expired sessions.
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(now.toISOString());
  return token;
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: 'learner' | 'admin';
}

export function userForToken(db: DB, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name AS displayName, u.role
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash(token), new Date().toISOString()) as SessionUser | undefined;
  return row ?? null;
}

export function destroySession(db: DB, token: string | undefined): void {
  if (token) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash(token));
}

/** Tiny in-memory limiter for failed logins (per key, sliding minute). */
export class LoginLimiter {
  private attempts = new Map<string, number[]>();
  constructor(
    private max = 8,
    private windowMs = 60_000,
  ) {}
  blocked(key: string): boolean {
    const now = Date.now();
    const list = (this.attempts.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.attempts.set(key, list);
    return list.length >= this.max;
  }
  fail(key: string): void {
    this.attempts.set(key, [...(this.attempts.get(key) ?? []), Date.now()]);
  }
  reset(key: string): void {
    this.attempts.delete(key);
  }
}
