import type { ReactNode } from 'react';
import { Container } from '@/components/layout/container';

/** The frame for login, register and the forced password change. */
export function AuthPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Container className="flex flex-1 items-start justify-center py-12 sm:py-16">
      <div className="w-full max-w-md">
        <h1 className="font-display text-5xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-2 text-ink-soft">{description}</p>}
        <div className="mt-8 rounded-card border border-line bg-surface p-6 sm:p-8">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-ink-soft">{footer}</div>}
      </div>
    </Container>
  );
}
