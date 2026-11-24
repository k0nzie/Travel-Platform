import type { Metadata } from 'next';
import { PlannedPage } from '@/components/layout/planned-page';

export const metadata: Metadata = { title: 'Explore trips' };

/** Person 5: public itinerary search (dynamic SSR). */
export default function ExploreItinerariesPage() {
  return (
    <PlannedPage
      title="Explore trips"
      description="Day-by-day plans shared by other travellers."
      owner="Person 5"
      requirements="ITN-21"
    />
  );
}
