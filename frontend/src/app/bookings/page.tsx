import type { Metadata } from 'next';
import { PlannedPage } from '@/components/layout/planned-page';
import { RequireAuth } from '@/lib/auth/require-auth';

export const metadata: Metadata = { title: 'My bookings' };

/** Person 3: flight bookings and hotel reservations, Upcoming / Past / Cancelled (dynamic SSR). */
export default function BookingsPage() {
  return (
    <RequireAuth roles={['user']}>
      <PlannedPage title="My bookings" owner="Person 3" requirements="FLT-25, HTL-20" />
    </RequireAuth>
  );
}
