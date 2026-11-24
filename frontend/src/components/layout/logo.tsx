import Link from 'next/link';
import { SITE_NAME } from '@/lib/site';
import { cn } from '@/lib/cn';

/** The wordmark: a waypoint pin on a teal tile, and the name in the display face. */
export function Logo({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <Link href="/" className={cn('inline-flex items-center gap-2.5', className)} aria-label={`${SITE_NAME} home`}>
      <span className="flex size-8 items-center justify-center rounded-control bg-brand">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
          <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" fill="#f2a900" />
          <circle cx="12" cy="10" r="2.4" fill="#0b7a75" />
        </svg>
      </span>
      <span
        className={cn(
          'font-display text-2xl leading-none font-bold tracking-wide',
          tone === 'light' ? 'text-ink-inverse' : 'text-ink',
        )}
      >
        {SITE_NAME}
      </span>
    </Link>
  );
}
