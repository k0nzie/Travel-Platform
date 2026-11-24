import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { CalendarIcon, PlaneIcon, SettingsIcon, ShieldIcon } from '@/components/ui/icons';
import { RequireAuth } from '@/lib/auth/require-auth';

/** Person 2. Airline moderators manage only the airline assigned to them. */
export default function AirlineDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['airline_moderator']}>
      <DashboardShell
        title="Your airline"
        nav={[
          { href: '/moderator/airline', label: 'Overview', exact: true, icon: <SettingsIcon className="size-4" /> },
          { href: '/moderator/airline/flights', label: 'Flights', icon: <PlaneIcon className="size-4" /> },
          {
            href: '/moderator/airline/policies',
            label: 'Baggage and cancellation',
            icon: <ShieldIcon className="size-4" />,
          },
          { href: '/moderator/airline/profile', label: 'Airline profile', icon: <CalendarIcon className="size-4" /> },
        ]}
      >
        {children}
      </DashboardShell>
    </RequireAuth>
  );
}
