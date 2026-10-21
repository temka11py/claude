import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

/** Fetch `path` on mount and whenever it changes. Pass null to skip. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const latest = useRef(path);

  const load = useCallback(async () => {
    if (path === null) return;
    latest.current = path;
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path);
      if (latest.current === path) setDataState(result);
    } catch (e) {
      if (latest.current === path) setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      if (latest.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater));
  }, []);

  return { data, error, loading, reload: load, setData };
}
