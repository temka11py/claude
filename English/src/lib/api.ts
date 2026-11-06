// Small fetch wrapper for the JSON API, plus a streaming (server-sent events) reader.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
    public code?: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, opts: { method?: Method; body?: unknown; signal?: AbortSignal; form?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? 'GET', credentials: 'same-origin', signal: opts.signal, headers: {} };
  if (opts.form) {
    init.body = opts.form;
  } else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('You seem to be offline. Check your connection and try again.', 0);
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/')) onUnauthorized();
    const body = (data ?? {}) as { error?: string; details?: unknown; code?: string };
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.details, body.code);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

/**
 * POST and read a server-sent event stream. Calls onDelta for each text chunk
 * and resolves with the `done` payload.
 */
export async function postStream<T>(path: string, body: unknown, onDelta: (text: string) => void, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError('You seem to be offline. Check your connection and try again.', 0);
  }
  if (!res.ok || !res.body) {
    const data = safeJson(await res.text()) as { error?: string };
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: T | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(chunk)?.[1];
      const dataLine = /^data: (.*)$/m.exec(chunk)?.[1];
      if (!event || dataLine === undefined) continue;
      const data = safeJson(dataLine) as Record<string, unknown>;
      if (event === 'delta') onDelta(String(data.text ?? ''));
      else if (event === 'done') result = data as T;
      else if (event === 'error') throw new ApiError(String(data.message ?? 'Something went wrong.'), 500);
    }
  }
  if (result === null) throw new ApiError('The response ended unexpectedly.', 500);
  return result;
}
