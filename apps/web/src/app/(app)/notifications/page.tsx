'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { useFormat } from '@/lib/hooks/use-format';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { cn } from '@/lib/utils';

const URL_KEYS = ['unread'] as const;

export default function NotificationsPage() {
  return (
    <Suspense>
      <NotificationsInner />
    </Suspense>
  );
}

function NotificationsInner() {
  const t = useTranslations();
  const f = useFormat();
  const qc = useQueryClient();
  const router = useRouter();
  const [state, setState] = useUrlState(URL_KEYS);
  const unreadOnly = state.unread === '1';

  const list = useInfiniteQuery({
    queryKey: ['notifications', 'list', unreadOnly],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET('/api/v1/notifications', {
          params: { query: { cursor: pageParam, limit: 30, unreadOnly } },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.POST('/api/v1/notifications/{id}/read', { params: { path: { id } } })),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: async () => unwrap(await api.POST('/api/v1/notifications/read-all')),
    onSuccess: invalidate,
    onError: (e) => toastError(e, t('common.unexpected')),
  });

  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const unread = list.data?.pages[0]?.meta.unreadCount ?? 0;

  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={unreadOnly}
                onCheckedChange={(v) => setState({ unread: v === true ? '1' : '' })}
                data-testid="unread-only"
              />
              {t('notifications.unreadOnly')}
            </label>
            <Button
              variant="outline"
              onClick={() => markAll.mutate()}
              disabled={unread === 0 || markAll.isPending}
              data-testid="mark-all-read"
            >
              <CheckCheck /> {t('notifications.markAllRead')}
            </Button>
          </>
        }
      />
      <ProblemAlert error={list.error} />
      {list.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title={t('notifications.empty')} />
      ) : (
        <Card>
          <ul className="divide-y divide-border" data-testid="notification-list">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full gap-3 px-4 py-3 text-left hover:bg-subtle',
                    !n.readAt && 'bg-info/40',
                  )}
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                    if (n.link) router.push(n.link);
                  }}
                >
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      n.readAt ? 'bg-transparent' : 'bg-primary',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', !n.readAt && 'font-semibold')}>
                      {n.title}
                    </span>
                    {n.body ? <span className="block text-sm text-muted">{n.body}</span> : null}
                    <span className="block text-xs text-muted">{f.dateTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {list.hasNextPage ? (
            <div className="border-t border-border p-3 text-center">
              <Button
                variant="ghost"
                onClick={() => void list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
              >
                {t('notifications.loadMore')}
              </Button>
            </div>
          ) : null}
        </Card>
      )}
    </>
  );
}
