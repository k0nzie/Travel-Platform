'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { LoadingState } from '@/components/ui/feedback';
import { refreshSession } from '@/lib/api/client';
import { loginHref } from './roles';

/**
 * Shown by <RequireAuth> when the server saw no valid access cookie. The access cookie lives
 * 15 minutes; the refresh cookie is only sent to /api/auth, so the browser renews the session
 * here and asks the server to render again. If that fails, the user logs in and comes back.
 */
export function SessionRefresher() {
  const router = useRouter();
  const pathname = usePathname();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const back = `${pathname}${window.location.search}`;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    void refreshSession().then((ok) => {
      if (!ok) return router.replace(loginHref(back));
      router.refresh();
      // If the page still cannot see a session, stop waiting and go to login.
      fallback = setTimeout(() => router.replace(loginHref(back)), 5000);
    });
    return () => clearTimeout(fallback);
  }, [pathname, router]);

  return <LoadingState label="Checking your session…" className="py-24" />;
}
