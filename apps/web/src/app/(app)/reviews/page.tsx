'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert } from '@/components/problem-alert';
import { StatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';
import { useFormat } from '@/lib/hooks/use-format';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { cn } from '@/lib/utils';

const KEYS = ['status'] as const;

/** Review inbox across projects, by due date (M04 §10 `GET /review-steps`). */
function ReviewsInner() {
  const t = useTranslations();
  const f = useFormat();
  const [state, set] = useUrlState(KEYS);
  const status = state.status ?? 'ACTIVE';
  const steps = useQuery({
    queryKey: ['review-steps', status],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/review-steps', { params: { query: { status } } })),
  });
  return (
    <>
      <PageHeader
        title={t('reviews.title')}
        actions={
          <NativeSelect
            className="w-56"
            value={status}
            onChange={(e) => set({ status: e.target.value })}
            data-testid="reviews-status"
          >
            <option value="ACTIVE">{t('reviews.waiting')}</option>
            <option value="APPROVED,APPROVED_WITH_COMMENTS,REJECTED">{t('reviews.decided')}</option>
            <option value="PENDING">{t('reviews.upcoming')}</option>
          </NativeSelect>
        }
      />
      <ProblemAlert error={steps.error} />
      {steps.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !steps.data?.length ? (
        <EmptyState title={t('reviews.empty')} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>{t('documents.number')}</TH>
                  <TH>{t('documents.docTitle')}</TH>
                  <TH>{t('reviews.project')}</TH>
                  <TH>{t('reviews.step')}</TH>
                  <TH>{t('reviews.submittedBy')}</TH>
                  <TH>{t('reviews.due')}</TH>
                  <TH>{t('common.status')}</TH>
                </TR>
              </THead>
              <TBody>
                {steps.data.map((s) => (
                  <TR key={s.id} data-testid={`review-row-${s.documentNumber}`}>
                    <TD>
                      <Link
                        className="font-mono text-xs hover:underline"
                        href={`/projects/${s.projectId}/documents/${s.documentId}/revisions/${s.revisionId}/review`}
                      >
                        {s.documentNumber} Rev.{s.revLabel}
                      </Link>
                    </TD>
                    <TD>{s.documentTitle}</TD>
                    <TD className="text-xs">
                      {s.projectCode} · {s.projectName}
                    </TD>
                    <TD>{s.name}</TD>
                    <TD>{s.submittedBy.displayName}</TD>
                    <TD
                      className={cn(
                        'text-xs whitespace-nowrap',
                        s.isOverdue && 'font-semibold text-danger-fg',
                      )}
                    >
                      {f.dateTime(s.dueAt)}
                    </TD>
                    <TD>
                      <StatusBadge enumName="ReviewStepStatus" value={s.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense>
      <ReviewsInner />
    </Suspense>
  );
}
