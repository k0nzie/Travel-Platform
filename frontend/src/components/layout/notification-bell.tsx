'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BellIcon } from '@/components/ui/icons';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';

/** GEN-01: the bell with the unread count. Re-checks every minute and on every page change. */
export function NotificationBell({ className }: { className?: string }) {
  const [count, setCount] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get<{ unreadCount: number }>('/notifications/unread-count')
        .then((r) => alive && setCount(r.unreadCount))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 60_000);
    const onChange = () => void load();
    window.addEventListener('notifications:changed', onChange);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('notifications:changed', onChange);
    };
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      className={cn(
        'relative inline-flex size-9 items-center justify-center rounded-control text-ink-inverse/80 transition-colors hover:bg-white/10 hover:text-ink-inverse',
        className,
      )}
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
    >
      <BellIcon className="size-5" />
      {count > 0 && (
        <span className="absolute top-1 right-1 flex min-w-4.5 items-center justify-center rounded-full bg-signal px-1 text-[0.6875rem] leading-4.5 font-bold text-ink">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
