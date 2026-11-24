'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/feedback';
import { Container } from '@/components/layout/container';

/** Shown when a page throws. Offers a retry instead of a blank screen (GEN-16). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container narrow className="py-20">
      <ErrorState
        title="This page could not be shown"
        message={error.message || 'An unexpected error happened.'}
        action={
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <ButtonLink href="/" variant="secondary">
              Home page
            </ButtonLink>
          </div>
        }
      />
    </Container>
  );
}
