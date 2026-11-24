import { ButtonLink } from '@/components/ui/button';
import { ShieldIcon } from '@/components/ui/icons';
import { Container } from './container';

/** Shown when a signed-in user opens a page their role cannot use (ACC-11). */
export function Forbidden({ message = 'This page is for a different kind of account.' }: { message?: string }) {
  return (
    <Container narrow className="py-24 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-sunken text-ink-soft">
        <ShieldIcon className="size-7" />
      </span>
      <h1 className="mt-5 font-display text-4xl font-bold">You do not have access</h1>
      <p className="mt-2 text-ink-soft">{message}</p>
      <ButtonLink href="/" variant="secondary" className="mt-6">
        Go to the home page
      </ButtonLink>
    </Container>
  );
}
