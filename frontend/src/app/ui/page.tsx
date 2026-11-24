import type { Metadata } from 'next';
import { StyleGuide } from '@/components/styleguide/style-guide';

export const metadata: Metadata = { title: 'UI kit', robots: { index: false } };

/** The team's living style guide: every shared component with its variants. */
export default function UiKitPage() {
  return <StyleGuide />;
}
