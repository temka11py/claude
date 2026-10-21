export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Subscribe to 401 responses (used to drop the session in the auth provider). */
export function onUnauthorized(fn: Listener) {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...rest,
    method: rest.method ?? (json !== undefined ? 'POST' : 'GET'),
    headers: {
      'x-local-date': localDate(),
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(res.status, data?.error ?? res.statusText, data?.details);
  }
  return data as T;
}

export const post = <T,>(path: string, json: unknown = {}) => api<T>(path, { method: 'POST', json });
export const put = <T,>(path: string, json: unknown) => api<T>(path, { method: 'PUT', json });
export const patch = <T,>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json });
