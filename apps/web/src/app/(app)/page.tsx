'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, MessageSquareReply, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert } from '@/components/problem-alert';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/hooks/use-format';
import { cn } from '@/lib/utils';

const reviewHref = (r: { projectId: string; documentId: string; revisionId: string }) =>
  `/projects/${r.projectId}/documents/${r.documentId}/revisions/${r.revisionId}/review`;
const docHref = (r: { projectId: string; documentId: string; revisionId: string }) =>
  `/projects/${r.projectId}/documents/${r.documentId}?rev=${r.revisionId}`;

/** My work (docs/07-web-ui.md §6.1): everything waiting for me, each item links straight to it. */
export default function HomePage() {
  const t = useTranslations();
  const f = useFormat();
  const { me } = useAuth();
  const work = useQuery({
    queryKey: ['my-work'],
    queryFn: async () => unwrap(await api.GET('/api/v1/my-work')),
    refetchInterval: 60_000,
  });
  const notifications = useQuery({
    queryKey: ['notifications', 'home'],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/notifications', { params: { query: { limit: 5 } } })),
  });
  const w = work.data;
  return (
    <>
      <PageHeader
        title={t('home.greeting', { name: me.displayNameTh })}
        subtitle={t('home.intro')}
      />
      <ProblemAlert error={work.error} />
      {!w ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <WorkCard
            icon={ClipboardCheck}
            title={t('home.toReview')}
            count={w.reviewCount}
            badge={
              w.overdueReviewCount ? t('home.overdue', { n: w.overdueReviewCount }) : undefined
            }
            more={
              w.reviewCount > w.reviews.length
                ? { href: '/reviews', label: t('home.seeAll') }
                : undefined
            }
            testId="work-reviews"
          >
            {w.reviews.map((s) => (
              <Row key={s.id} href={reviewHref(s)}>
                <span className="font-mono text-xs">{s.documentNumber}</span> Rev.{s.revLabel}
                <span className="block truncate text-xs text-muted">
                  {s.name} · {s.documentTitle}
                </span>
                {s.dueAt ? (
                  <span
                    className={cn(
                      'text-xs',
                      s.isOverdue ? 'font-semibold text-danger-fg' : 'text-muted',
                    )}
                  >
                    {t('documents.dueAt', { date: f.dateTime(s.dueAt) })}
                  </span>
                ) : null}
              </Row>
            ))}
          </WorkCard>
          <WorkCard
            icon={MessageSquareReply}
            title={t('home.toAnswer')}
            count={w.commentsToAnswerCount}
            testId="work-comments"
          >
            {w.commentsToAnswer.map((c) => (
              <Row key={c.commentId} href={reviewHref(c)}>
                <span className="font-mono text-xs">{c.documentNumber}</span> Rev.{c.revLabel}
                <span className="block truncate text-xs">{c.body}</span>
                <span className="text-xs text-muted">
                  {c.authorName} · {f.dateTime(c.createdAt)}
                </span>
              </Row>
            ))}
          </WorkCard>
          <WorkCard
            icon={Undo2}
            title={t('home.returned')}
            count={w.returned.length}
            testId="work-returned"
          >
            {w.returned.map((r) => (
              <Row key={r.revisionId} href={docHref(r)}>
                <span className="font-mono text-xs">{r.documentNumber}</span> Rev.{r.revLabel}
                <span className="block truncate text-xs text-muted">{r.documentTitle}</span>
              </Row>
            ))}
          </WorkCard>
          <WorkCard
            icon={AlertTriangle}
            title={t('home.clientReturns')}
            count={w.clientReturns.length}
            testId="work-client"
          >
            {w.clientReturns.map((r) => (
              <Row key={r.revisionId} href={docHref(r)}>
                <span className="font-mono text-xs">{r.documentNumber}</span> Rev.{r.revLabel}{' '}
                <StatusBadge enumName="ClientReturnCode" value={r.clientReturnCode} />
                <span className="block truncate text-xs text-muted">{r.documentTitle}</span>
              </Row>
            ))}
          </WorkCard>
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>{t('home.latestNotifications')}</CardTitle>
              <Link href="/notifications" className="text-sm text-muted hover:underline">
                {t('home.seeAll')}
              </Link>
            </CardHeader>
            <ul className="divide-y divide-border">
              {notifications.data?.data.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.link ?? '/notifications'}
                    className="flex gap-3 px-4 py-2 text-sm hover:bg-subtle"
                  >
                    <span
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        n.readAt ? 'bg-transparent' : 'bg-primary',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{n.title}</span>
                    <span className="text-xs text-muted">{f.dateTime(n.createdAt)}</span>
                  </Link>
                </li>
              ))}
              {notifications.data && !notifications.data.data.length ? (
                <li className="px-4 py-3 text-sm text-muted">{t('notifications.empty')}</li>
              ) : null}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

function WorkCard({
  icon: Icon,
  title,
  count,
  badge,
  more,
  children,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  badge?: string;
  more?: { href: string; label: string };
  children: React.ReactNode;
  testId: string;
}) {
  const t = useTranslations('home');
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted" />
          {title}
          <span
            className="rounded-full bg-subtle px-2 text-sm tabular-nums"
            data-testid={`${testId}-count`}
          >
            {count}
          </span>
          {badge ? <Badge tone="danger">{badge}</Badge> : null}
        </CardTitle>
        {more ? (
          <Link href={more.href} className="text-sm text-muted hover:underline">
            {more.label}
          </Link>
        ) : null}
      </CardHeader>
      {count ? (
        <ul className="divide-y divide-border">{children}</ul>
      ) : (
        <CardContent>
          <p className="text-sm text-muted">{t('nothing')}</p>
        </CardContent>
      )}
    </Card>
  );
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="block px-4 py-2 text-sm hover:bg-subtle">
        {children}
      </Link>
    </li>
  );
}
