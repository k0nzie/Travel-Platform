import { cookies } from 'next/headers';
import { cache } from 'react';
import { ApiError, networkError, type ApiErrorBody } from './errors';
import { buildQuery, type Query } from './query';
import type { User } from './types';

/**
 * The server-side API client, for Server Components and Route Handlers.
 *
 * Signed-in data (dynamic SSR: dashboards, my bookings, private itineraries):
 *   const page = await serverApi<Page<Booking>>('/flight-bookings', { query: { scope: 'upcoming' } });
 *
 * Public data that may be cached (ISR: published post, author page, public itinerary):
 *   const post = await serverApi<Post>(`/posts/${id}`, { auth: false, revalidate: 60 });
 *
 * With auth (the default) the user's cookies are forwarded, which makes the page dynamic.
 * With auth: false no cookies are read, so Next.js can render the page statically.
 */

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

export interface ServerRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  /** Forward the user's cookies (default true). */
  auth?: boolean;
  /** Seconds to cache a public response (ISR). Ignored when auth is true. */
  revalidate?: number;
  /** Cache tags, for revalidateTag(). */
  tags?: string[];
}

export async function serverApi<T>(path: string, options: ServerRequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, auth = true, revalidate, tags } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const cookieHeader = (await cookies()).toString();
    if (cookieHeader) headers.Cookie = cookieHeader;
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(auth || revalidate === undefined
        ? { cache: 'no-store' as const }
        : { next: { revalidate, ...(tags ? { tags } : {}) } }),
    });
  } catch {
    throw networkError();
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody | null);
  return data as T;
}

/**
 * The signed-in user, or null. Deduplicated per request, so layouts and pages can all call it.
 * Returns null when the access cookie has expired; <RequireAuth> then refreshes in the browser.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  try {
    return await serverApi<User>('/auth/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
});
