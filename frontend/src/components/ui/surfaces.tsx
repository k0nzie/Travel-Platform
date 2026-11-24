import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { BookingStatus } from '@/lib/api/types';
import { AlertIcon, CheckCircleIcon, InfoIcon } from './icons';

/* ---------- Card ---------- */

/** A white panel on the page background. Use one card per distinct block, not one per line. */
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-card border border-line bg-surface', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4', className)}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 py-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3', className)}
      {...props}
    />
  );
}

/* ---------- Badge ---------- */

export type Tone = 'neutral' | 'brand' | 'signal' | 'success' | 'danger' | 'info';

const badgeTones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-soft',
  brand: 'bg-brand-soft text-brand-ink',
  signal: 'bg-signal-soft text-signal-ink',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export function Badge({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

const bookingStatus: Record<BookingStatus, { label: string; tone: Tone }> = {
  pending_payment: { label: 'Pending payment', tone: 'signal' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

/** Booking and reservation status, worded and coloured the same everywhere (GEN-11). */
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const s = bookingStatus[status] ?? { label: status, tone: 'neutral' as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/* ---------- Alert ---------- */

const alertTones: Record<Exclude<Tone, 'neutral' | 'brand'>, { box: string; icon: ReactNode }> = {
  info: { box: 'border-info/25 bg-info-soft text-info', icon: <InfoIcon className="size-5" /> },
  success: { box: 'border-success/25 bg-success-soft text-success', icon: <CheckCircleIcon className="size-5" /> },
  signal: { box: 'border-signal/50 bg-signal-soft text-signal-ink', icon: <AlertIcon className="size-5" /> },
  danger: { box: 'border-danger/25 bg-danger-soft text-danger', icon: <AlertIcon className="size-5" /> },
};

/** An inline message inside the page: form errors, warnings, "your hold expires soon". */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'success' | 'signal' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = alertTones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-control border px-4 py-3 text-sm', t.box, className)}
    >
      <span className="mt-px shrink-0">{t.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-ink')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ---------- Detail list ---------- */

/** Label / value pairs for booking details, profiles, summaries. */
export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: Array<{ label: ReactNode; value: ReactNode }>;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-sm text-ink-soft">{item.label}</dt>
          <dd className="mt-0.5 font-medium break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Ticket ---------- */

/**
 * The boarding-pass card: the main part on the left, a perforated tear line, and a stub on the
 * right (reference, status, price). For bookings, confirmations and e-ticket previews.
 * On small screens the stub drops below the tear line.
 */
export function Ticket({ children, stub, className }: { children: ReactNode; stub: ReactNode; className?: string }) {
  return (
    <article
      className={cn(
        'relative grid overflow-hidden rounded-card border border-line bg-surface md:grid-cols-[1fr_auto]',
        className,
      )}
    >
      <div className="min-w-0 p-5">{children}</div>
      <div className="relative border-t-2 border-dashed border-line p-5 md:min-w-52 md:border-t-0 md:border-l-2">
        {/* Notches where the tear line meets the edge. */}
        <span
          aria-hidden="true"
          className="absolute -top-2.5 -left-2.5 size-5 rounded-full border border-line bg-canvas md:-top-2.5 md:-left-2.5"
        />
        <span
          aria-hidden="true"
          className="absolute -top-2.5 -right-2.5 size-5 rounded-full border border-line bg-canvas md:top-auto md:-bottom-2.5 md:-left-2.5"
        />
        {stub}
      </div>
    </article>
  );
}

/* ---------- Avatar ---------- */

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink',
        className,
      )}
    >
      {initials}
    </span>
  );
}
