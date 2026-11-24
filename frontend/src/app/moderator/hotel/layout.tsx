import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { BedIcon, CalendarIcon, SettingsIcon, ShieldIcon, InboxIcon } from '@/components/ui/icons';
import { RequireAuth } from '@/lib/auth/require-auth';

/** Person 4. Hotel moderators manage only the hotel assigned to them. */
export default function HotelDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['hotel_moderator']}>
      <DashboardShell
        title="Your hotel"
        nav={[
          { href: '/moderator/hotel', label: 'Overview', exact: true, icon: <SettingsIcon className="size-4" /> },
          { href: '/moderator/hotel/rooms', label: 'Rooms', icon: <BedIcon className="size-4" /> },
          { href: '/moderator/hotel/availability', label: 'Room status', icon: <CalendarIcon className="size-4" /> },
          { href: '/moderator/hotel/reservations', label: 'Reservations', icon: <InboxIcon className="size-4" /> },
          {
            href: '/moderator/hotel/profile',
            label: 'Hotel profile and policies',
            icon: <ShieldIcon className="size-4" />,
          },
        ]}
      >
        {children}
      </DashboardShell>
    </RequireAuth>
  );
}
