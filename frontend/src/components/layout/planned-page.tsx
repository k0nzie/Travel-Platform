import { Container, PageSection } from './container';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/navigation';

/**
 * A starter page for a section that a teammate has not built yet. Replace the whole page
 * with the real one; this component exists only so navigation works from day one.
 */
export function PlannedPage({
  title,
  description,
  owner,
  requirements,
  bare = false,
}: {
  title: string;
  description?: string;
  owner: string;
  requirements: string;
  /** Inside a dashboard the shell already provides the container. */
  bare?: boolean;
}) {
  const content = (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState title="This page is being built" description={`${owner} builds this page (${requirements}).`} />
    </>
  );
  return bare ? (
    content
  ) : (
    <Container>
      <PageSection>{content}</PageSection>
    </Container>
  );
}
