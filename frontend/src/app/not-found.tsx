import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/layout/container';

export default function NotFound() {
  return (
    <Container narrow className="py-24 text-center">
      <p className="font-display text-7xl font-bold text-brand">404</p>
      <h1 className="mt-3 font-display text-4xl font-bold">This page does not exist</h1>
      <p className="mt-2 text-ink-soft">The link may be old, or the item may have been removed.</p>
      <ButtonLink href="/" variant="secondary" className="mt-6">
        Go to the home page
      </ButtonLink>
    </Container>
  );
}
