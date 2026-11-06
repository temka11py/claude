import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z, ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

/** Parse and validate a request body/query with zod, throwing a 400 with details. */
export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw badRequest(
      'Invalid request',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

/**
 * The current time. Tests can pin it with the `x-test-now` header so streaks and
 * review scheduling can be exercised across days.
 */
export function nowFor(req: FastifyRequest): Date {
  if (process.env.NODE_ENV === 'test') {
    const h = req.headers['x-test-now'];
    if (typeof h === 'string' && !Number.isNaN(Date.parse(h))) return new Date(h);
  }
  return new Date();
}

export function userId(req: FastifyRequest): number {
  if (!req.user) throw new HttpError(401, 'Not signed in');
  return req.user.id;
}

export type Reply = FastifyReply;
