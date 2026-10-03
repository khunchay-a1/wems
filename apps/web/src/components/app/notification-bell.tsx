'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { api, unwrap } from '@/lib/api';

/** Bell with unread count; Server-Sent Events update it live (docs/04-api-conventions.md §10). */
export function NotificationBell() {
  const t = useTranslations('nav');
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => unwrap(await api.GET('/api/v1/notifications/unread-count')),
    refetchInterval: 120_000,
  });

  useEffect(() => {
    const es = new EventSource('/api/v1/events');
    const onNotification = (e: MessageEvent<string>) => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      try {
        const d = JSON.parse(e.data) as { title?: string };
        if (d.title) toast(d.title);
      } catch {
        /* ignore */
      }
    };
    const invalidate = (keys: string[][]) => () =>
      keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
    es.addEventListener('notification.created', onNotification);
    es.addEventListener('review.updated', invalidate([['reviews'], ['revision'], ['my-work']]));
    es.addEventListener('document.updated', invalidate([['documents'], ['document']]));
    es.addEventListener('file.processed', invalidate([['files']]));
    return () => es.close();
  }, [qc]);

  const n = data?.unreadCount ?? 0;
  return (
    <Link
      href="/notifications"
      className="relative rounded-md p-2 hover:bg-subtle"
      aria-label={t('notifications')}
      data-testid="bell"
    >
      <Bell className="size-5" />
      {n > 0 ? (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-danger-fg px-1 text-center text-[10px] leading-4 font-semibold text-white"
          data-testid="bell-count"
        >
          {n > 99 ? '99+' : n}
        </span>
      ) : null}
    </Link>
  );
}
