'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSessionExpired } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { Role, User } from '@/lib/api/types';
import { loginHref } from './roles';

/**
 * Who is signed in, for Client Components. Identity always comes from GET /auth/me (ACC-19);
 * nothing about the session is stored in the browser.
 *
 *   const { user, status, logout } = useAuth();
 *   status: 'loading' while checking, then 'authenticated' or 'guest'.
 *
 * The provider loads the user in the browser, so public pages stay static (ISR) and the header
 * fills in after the page appears.
 */

type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** Put the user from a login or profile update into the context. */
  setUser: (user: User | null) => void;
  /** Re-read /auth/me (after a profile change, for example). */
  reload: () => Promise<User | null>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const setUser = useCallback((next: User | null) => {
    setUserState(next);
    setStatus(next ? 'authenticated' : 'guest');
  }, []);

  const reload = useCallback(async () => {
    try {
      const me = await api.get<User>('/auth/me');
      setUser(me);
      return me;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 401 || error.status === 403) setUser(null);
      else setStatus((s) => (s === 'loading' ? 'guest' : s));
      return null;
    }
  }, [setUser]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => onSessionExpired(() => setUser(null)), [setUser]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      router.push('/');
      router.refresh();
    }
  }, [router, setUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      setUser,
      reload,
      logout,
      hasRole: (...roles) => !!user && roles.includes(user.role),
    }),
    [user, status, setUser, reload, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/**
 * ACC-10: guard a restricted action (book, review, post, like, comment, report).
 *
 *   const requireLogin = useRequireLogin();
 *   <Button onClick={() => requireLogin() && book()}>Book</Button>
 *
 * A guest is sent to the login page and comes back to this page afterwards.
 * Pass a returnTo to come back somewhere more specific.
 */
export function useRequireLogin() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (returnTo?: string) => {
      if (user) return true;
      const here = returnTo ?? `${pathname}${typeof window !== 'undefined' ? window.location.search : ''}`;
      router.push(loginHref(here));
      return false;
    },
    [user, router, pathname],
  );
}
