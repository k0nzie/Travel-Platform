'use client';

import { ApiError, networkError, type ApiErrorBody } from './errors';
import { buildQuery, type Query } from './query';

/**
 * The browser API client. Use it in Client Components only; Server Components use `serverApi`.
 *
 *   const flights = await api.get<Page<Flight>>('/flights/search', { query: { origin: 'CAI' } });
 *   await api.post('/posts', { title, content });
 *
 * Paths are the backend paths without "/api". Calls go to this Next.js server, which forwards
 * them to the backend, so the httpOnly auth cookies are sent automatically (ACC-19).
 * An expired session is refreshed once and the call retried; if that fails, listeners of
 * `onSessionExpired` are told (the AuthProvider then shows the user as logged out).
 */

export type { Query };

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Skip the automatic refresh-and-retry on 401 (used by the auth calls themselves). */
  noRefresh?: boolean;
}

const sessionListeners = new Set<() => void>();

/** Subscribe to "the session could not be refreshed". Returns an unsubscribe function. */
export function onSessionExpired(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

/** Calls where a 401 is the real answer (wrong password, no session), never a stale cookie. */
const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']);

let refreshing: Promise<boolean> | null = null;

/** POST /auth/refresh once, shared by all calls that hit a 401 at the same time. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json();
  const text = await res.text();
  return text || null;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const init: RequestInit = {
    method,
    credentials: 'include',
    signal: options.signal,
    headers: options.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
  };

  let res: Response;
  try {
    res = await fetch(`/api${path}${buildQuery(options.query)}`, init);
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw networkError();
  }

  if (res.status === 401 && !options.noRefresh && !NO_REFRESH_PATHS.has(path)) {
    if (await refreshSession()) return request<T>(method, path, { ...options, noRefresh: true });
    sessionListeners.forEach((listener) => listener());
  }

  const data = await parse(res);
  if (!res.ok) {
    const error = new ApiError(res.status, (data as ApiErrorBody) ?? null);
    // A moderator with a temporary password must change it before anything else (ACC-13).
    if (error.code === 'PASSWORD_CHANGE_REQUIRED' && typeof window !== 'undefined') {
      window.location.assign('/change-password');
    }
    throw error;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('DELETE', path, { ...options, body }),

  /** Multipart upload. Images go in the "images" field (GEN-08), the airline logo in "image". */
  upload: <T>(path: string, files: File[], field = 'images') => {
    const form = new FormData();
    files.forEach((file) => form.append(field, file));
    return request<T>('POST', path, { body: form });
  },

  /** Downloads a file (e-ticket PDF, passenger CSV) and saves it in the browser. */
  async download(path: string, filename: string, query?: Query) {
    let res = await fetch(`/api${path}${buildQuery(query)}`, { credentials: 'include' });
    if (res.status === 401 && (await refreshSession())) {
      res = await fetch(`/api${path}${buildQuery(query)}`, { credentials: 'include' });
    }
    if (!res.ok) throw new ApiError(res.status, ((await parse(res)) as ApiErrorBody) ?? null);
    const url = URL.createObjectURL(await res.blob());
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
