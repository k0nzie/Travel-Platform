import type { Metadata } from 'next';
import { PlannedPage } from '@/components/layout/planned-page';

export const metadata: Metadata = { title: 'Your hotel' };

export default function HotelDashboardPage() {
  return <PlannedPage bare title="Your hotel" owner="Person 4" requirements="HTL-01…10, HTL-22" />;
}
