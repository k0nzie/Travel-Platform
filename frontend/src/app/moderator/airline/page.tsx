import type { Metadata } from 'next';
import { PlannedPage } from '@/components/layout/planned-page';

export const metadata: Metadata = { title: 'Your airline' };

export default function AirlineDashboardPage() {
  return <PlannedPage bare title="Your airline" owner="Person 2" requirements="FLT-01…09, FLT-29" />;
}
