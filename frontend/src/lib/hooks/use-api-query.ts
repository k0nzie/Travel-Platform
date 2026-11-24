'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Query } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

/**
 * Loads data in a Client Component and keeps loading / error / data together:
 *
 *   const { data, error, loading, reload } = useApiQuery<Page<Notification>>('/notifications', { page });
 *   if (loading) return <LoadingState />;
 *   if (error) return <ErrorState message={error.message} action={<Button onClick={reload}>Try again</Button>} />;
 *
 * Pass null as the path to wait (e.g. until a form is filled in). The call re-runs when the
 * path or query changes. Pages that can load on the server should use serverApi instead.
 */
export function useApiQuery<T>(path: string | null, query?: Query) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [version, setVersion] = useState(0);
  const queryKey = JSON.stringify(query ?? {});
  const latest = useRef(0);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const run = ++latest.current;
    setLoading(true);
    setError(null);
    api
      .get<T>(path, { query: JSON.parse(queryKey) as Query, signal: controller.signal })
      .then((result) => {
        if (run === latest.current) setData(result);
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name === 'AbortError') return;
        if (run === latest.current) setError(err instanceof ApiError ? err : new ApiError(0, null));
      })
      .finally(() => {
        if (run === latest.current) setLoading(false);
      });
    return () => controller.abort();
  }, [path, queryKey, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { data, setData, error, loading, reload };
}
