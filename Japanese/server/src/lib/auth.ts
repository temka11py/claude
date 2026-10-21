import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';

export const AUTH_COOKIE = 'hm_token';
const TOKEN_TTL_DAYS = 30;

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not configured');
  return value;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, secret(), { expiresIn: `${TOKEN_TTL_DAYS}d` });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, secret());
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: TOKEN_TTL_DAYS * 86_400_000,
  path: '/',
};
