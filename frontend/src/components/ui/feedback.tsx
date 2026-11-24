import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { AlertIcon, InboxIcon, SpinnerIcon } from './icons';

/**
 * Loading, empty and error states (GEN-04, GEN-16). Every list and every data fetch shows one of
 * these instead of a blank area. Empty states say what to do next.
 */

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <SpinnerIcon className={cn('size-5 animate-spin text-brand', className)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A grey block that stands in for content while it loads. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block animate-pulse rounded-control bg-sunken', className)} />;
}

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-ink-soft', className)}>
      <SpinnerIcon className="size-6 animate-spin text-brand" />
      <p className="text-sm" role="status">
        {label}
      </p>
    </div>
  );
}

export function EmptyState({
  icon = <InboxIcon className="size-6" />,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong px-6 py-14 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-sunken text-ink-soft">{icon}</span>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'This could not be loaded',
  message,
  action,
  className,
}: {
  title?: ReactNode;
  message?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-danger/25 bg-danger-soft/50 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertIcon className="size-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      {message && <p className="mt-1 max-w-md text-sm text-ink-soft">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
