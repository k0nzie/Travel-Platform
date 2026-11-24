import type { Metadata } from 'next';
import { PlannedPage } from '@/components/layout/planned-page';
import { RequireAuth } from '@/lib/auth/require-auth';

export const metadata: Metadata = { title: 'My trips' };

/** Person 5: the signed-in user's itineraries (dynamic SSR). */
export default function MyItinerariesPage() {
  return (
    <RequireAuth roles={['user']}>
      <PlannedPage title="My trips" owner="Person 5" requirements="ITN-01, ITN-03" />
    </RequireAuth>
  );
}
