import type { Metadata } from 'next';
import { PlannedPage } from '@/components/layout/planned-page';

export const metadata: Metadata = { title: 'Flights' };

/** Person 2: flight search and results (dynamic SSR). Reads origin, destination, departureDate, adults from the URL. */
export default function FlightsPage() {
  return (
    <PlannedPage
      title="Flights"
      description="Search scheduled flights by airport, date and passengers."
      owner="Person 2"
      requirements="FLT-11, FLT-12, FLT-15, FLT-17"
    />
  );
}
