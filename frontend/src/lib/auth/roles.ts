import type { Role } from '@/lib/api/types';

/** Where each role lands after login. Must match ROLE_HOME in the backend. */
export const ROLE_HOME: Record<Role, string> = {
  user: '/',
  admin: '/admin',
  airline_moderator: '/moderator/airline',
  hotel_moderator: '/moderator/hotel',
};

export const ROLE_LABEL: Record<Role, string> = {
  user: 'Traveller',
  admin: 'Administrator',
  airline_moderator: 'Airline moderator',
  hotel_moderator: 'Hotel moderator',
};

/**
 * Only same-site paths are allowed after login (no "//evil.com" or "https://…"), so a crafted
 * link cannot send someone to another site.
 */
export function safeReturnTo(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value.startsWith('/login') || value.startsWith('/register')) return fallback;
  return value;
}

/** /login?returnTo=<current page>, for sending a guest to log in and back again (ACC-10). */
export function loginHref(returnTo?: string): string {
  return returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login';
}
