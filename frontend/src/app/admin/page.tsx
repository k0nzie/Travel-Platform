import type { Metadata } from 'next';
import { PlannedPage } from '@/components/layout/planned-page';

export const metadata: Metadata = { title: 'Administration' };

export default function AdminHomePage() {
  return <PlannedPage bare title="Administration" owner="Person 6B" requirements="ACC-13…17, GEN-07, GEN-09, GEN-10" />;
}
