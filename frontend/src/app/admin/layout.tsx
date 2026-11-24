import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { BellIcon, CalendarIcon, ShieldIcon, SettingsIcon, UserIcon, InboxIcon } from '@/components/ui/icons';
import { RequireAuth } from '@/lib/auth/require-auth';

/** Person 6B. Every page under /admin is for administrators only. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['admin']}>
      <DashboardShell
        title="Administration"
        nav={[
          { href: '/admin', label: 'Overview', exact: true, icon: <SettingsIcon className="size-4" /> },
          { href: '/admin/accounts', label: 'Accounts', icon: <UserIcon className="size-4" /> },
          { href: '/admin/providers', label: 'Airlines and hotels', icon: <ShieldIcon className="size-4" /> },
          { href: '/admin/bookings', label: 'Bookings', icon: <CalendarIcon className="size-4" /> },
          { href: '/admin/reports', label: 'Reports', icon: <InboxIcon className="size-4" /> },
          { href: '/admin/audit-log', label: 'Audit log', icon: <BellIcon className="size-4" /> },
        ]}
      >
        {children}
      </DashboardShell>
    </RequireAuth>
  );
}
