'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Container } from './container';

export interface DashboardNavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Highlight only on an exact match (for the overview link). */
  exact?: boolean;
}

/**
 * The frame for the airline, hotel and admin dashboards: a side navigation and the page.
 * Use it in the section's layout:
 *
 *   <RequireAuth roles={['admin']}>
 *     <DashboardShell title="Administration" nav={[{ href: '/admin', label: 'Overview', exact: true }, …]}>
 *       {children}
 *     </DashboardShell>
 *   </RequireAuth>
 *
 * On phones the side navigation becomes a scrollable row above the page.
 */
export function DashboardShell({
  title,
  nav,
  children,
}: {
  title: string;
  nav: DashboardNavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = (item: DashboardNavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Container className="grid gap-8 py-8 lg:grid-cols-[14rem_1fr] lg:py-10">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 hidden px-3 text-sm font-semibold text-ink-soft lg:block">{title}</p>
        <nav aria-label={title} className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item) ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                active(item) ? 'bg-brand-soft text-brand-ink' : 'text-ink-soft hover:bg-sunken hover:text-ink',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </Container>
  );
}
