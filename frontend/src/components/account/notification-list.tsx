'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BellIcon,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  Tabs,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { Notification, Page } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useApiQuery } from '@/lib/hooks/use-api-query';

type NotificationPage = Page<Notification> & { unreadCount: number };

/** Tells the header bell to re-count. */
function announceChange() {
  window.dispatchEvent(new Event('notifications:changed'));
}

/** GEN-01: list, unread filter, mark one or all as read. */
export function NotificationList() {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload, setData } = useApiQuery<NotificationPage>('/notifications', {
    page,
    limit: 10,
    unreadOnly: filter === 'unread' ? true : undefined,
  });
  const [markingAll, setMarkingAll] = useState(false);

  async function open(n: Notification) {
    if (!n.readAt) {
      try {
        await api.patch(`/notifications/${n.id}/read`);
        setData(
          (d) =>
            d && {
              ...d,
              unreadCount: Math.max(0, d.unreadCount - 1),
              items: d.items.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)),
            },
        );
        announceChange();
      } catch (e) {
        toast.error(errorMessage(e));
      }
    }
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    setMarkingAll(true);
    try {
      await api.patch('/notifications/read-all');
      announceChange();
      toast.success('All notifications marked as read');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Booking confirmations, cancellations, refunds, schedule changes and account news."
        actions={
          !!data?.unreadCount && (
            <Button variant="secondary" onClick={() => void markAll()} loading={markingAll}>
              Mark all as read
            </Button>
          )
        }
      />
      <Tabs
        label="Filter notifications"
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setPage(1);
        }}
        items={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread', count: data?.unreadCount },
        ]}
      />

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error.message} action={<Button onClick={reload}>Try again</Button>} />
      ) : !data?.items.length ? (
        <EmptyState
          icon={<BellIcon className="size-6" />}
          title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
          description="You will see booking confirmations, refunds and schedule changes here."
        />
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void open(n)}
                  className={cn(
                    'flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-canvas',
                    !n.readAt && 'bg-brand-soft/40',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn('mt-2 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className={cn('text-ink', !n.readAt && 'font-semibold')}>{n.title}</span>
                      <time
                        dateTime={n.createdAt}
                        title={formatDateTime(n.createdAt)}
                        className="text-sm text-ink-faint"
                      >
                        {formatRelative(n.createdAt)}
                      </time>
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-soft">{n.message}</span>
                    {!n.readAt && <span className="sr-only">Unread.</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
