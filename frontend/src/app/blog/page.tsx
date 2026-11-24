import type { Metadata } from 'next';
import { PlannedPage } from '@/components/layout/planned-page';

export const metadata: Metadata = { title: 'Blog' };

/** Person 6A: published posts, tag filter and search (dynamic SSR). */
export default function BlogPage() {
  return (
    <PlannedPage
      title="Blog"
      description="Travel stories and tips from the community."
      owner="Person 6A"
      requirements="BLG-02, BLG-09"
    />
  );
}
