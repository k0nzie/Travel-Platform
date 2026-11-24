import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

/* ---------- Page header ---------- */

/**
 * The top of every page: title in the display face, optional back link, description and actions.
 * One per page, and the title is the page's only <h1>.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cn('mb-8', className)}>
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-brand"
        >
          <ArrowLeftIcon className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-ink-soft">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/* ---------- Table ---------- */

/** Tables scroll sideways on small screens instead of squashing. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  );
}

export function THead(props: ComponentProps<'thead'>) {
  return <thead className="border-b border-line bg-sunken/60 text-ink-soft" {...props} />;
}

export function TBody(props: ComponentProps<'tbody'>) {
  return <tbody className="divide-y divide-line" {...props} />;
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('hover:bg-canvas/70', className)} {...props} />;
}

export function TH({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="col" className={cn('px-4 py-3 font-semibold whitespace-nowrap', className)} {...props} />;
}

export function TD({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle text-ink', className)} {...props} />;
}

/* ---------- Pagination ---------- */

function pageList(page: number, totalPages: number): Array<number | 'gap'> {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/**
 * Page numbers under every list (GEN-05). Two ways to use it:
 *  - server pages: hrefFor={(p) => `/blog?page=${p}`} renders links
 *  - client pages: onPageChange={setPage} renders buttons
 */
export function Pagination({
  page,
  totalPages,
  hrefFor,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  hrefFor?: (page: number) => string;
  onPageChange?: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const item = (target: number, content: ReactNode, label: string, disabled = false, current = false) => {
    const classes = cn(
      'inline-flex h-9 min-w-9 items-center justify-center rounded-control px-2 text-sm font-semibold transition-colors',
      current ? 'bg-ink text-ink-inverse' : 'text-ink hover:bg-sunken',
      disabled && 'pointer-events-none opacity-40',
    );
    if (hrefFor) {
      // Link mode works in Server Components, so it must not render event handlers.
      return disabled ? (
        <span className={classes} aria-disabled="true">
          {content}
        </span>
      ) : (
        <Link href={hrefFor(target)} className={classes} aria-label={label} aria-current={current ? 'page' : undefined}>
          {content}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className={classes}
        aria-label={label}
        aria-current={current ? 'page' : undefined}
        disabled={disabled}
        onClick={() => onPageChange?.(target)}
      >
        {content}
      </button>
    );
  };

  return (
    <nav aria-label="Pagination" className={cn('mt-6 flex items-center justify-center gap-1', className)}>
      {item(page - 1, <ChevronLeftIcon className="size-4" />, 'Previous page', page <= 1)}
      {pageList(page, totalPages).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-ink-faint">
            …
          </span>
        ) : (
          <span key={p}>{item(p, p, `Page ${p}`, false, p === page)}</span>
        ),
      )}
      {item(page + 1, <ChevronRightIcon className="size-4" />, 'Next page', page >= totalPages)}
    </nav>
  );
}

/* ---------- Tabs ---------- */

/**
 * Tabs that switch content or filter a list (Upcoming / Past / Cancelled). Controlled:
 *   <Tabs value={scope} onChange={setScope} items={[{ value: 'upcoming', label: 'Upcoming' }, ...]} />
 * For tabs that are separate URLs, pass hrefFor instead of onChange.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  hrefFor,
  label = 'Sections',
  className,
}: {
  items: Array<{ value: T; label: ReactNode; count?: number }>;
  value: T;
  onChange?: (value: T) => void;
  hrefFor?: (value: T) => string;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('mb-6 flex gap-1 overflow-x-auto border-b border-line', className)}
    >
      {items.map((tab) => {
        const active = tab.value === value;
        const classes = cn(
          '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
          active ? 'border-brand text-brand-ink' : 'border-transparent text-ink-soft hover:text-ink',
        );
        const content = (
          <>
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-2 py-px text-xs',
                  active ? 'bg-brand-soft text-brand-ink' : 'bg-sunken text-ink-soft',
                )}
              >
                {tab.count}
              </span>
            )}
          </>
        );
        return hrefFor ? (
          <Link key={tab.value} href={hrefFor(tab.value)} role="tab" aria-selected={active} className={classes}>
            {content}
          </Link>
        ) : (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={classes}
            onClick={() => onChange?.(tab.value)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
