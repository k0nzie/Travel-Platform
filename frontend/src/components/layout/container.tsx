import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** The page width used everywhere. `narrow` for forms and reading (login, profile, a blog post). */
export function Container({ narrow = false, className, ...props }: ComponentProps<'div'> & { narrow?: boolean }) {
  return (
    <div className={cn('mx-auto w-full px-4 sm:px-6', narrow ? 'max-w-2xl' : 'max-w-6xl', className)} {...props} />
  );
}

/** Standard vertical spacing for a page's main content. */
export function PageSection({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('py-10 sm:py-12', className)} {...props} />;
}
