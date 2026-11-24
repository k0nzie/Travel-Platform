import type { Metadata } from 'next';
import { PlannedPage } from '@/components/layout/planned-page';

export const metadata: Metadata = { title: 'Hotels' };

/** Person 4: hotel search and results (dynamic SSR). Reads city, checkIn, checkOut, guests, rooms from the URL. */
export default function HotelsPage() {
  return (
    <PlannedPage
      title="Hotels"
      description="Find hotels with rooms free for your whole stay."
      owner="Person 4"
      requirements="HTL-11, HTL-12, HTL-15"
    />
  );
}
