'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProject } from '@/features/projects/api';
import { api, unwrap } from '@/lib/api';
import { useFormat } from '@/lib/hooks/use-format';

/** Project overview (M03 §3 GET /projects/{id}/overview). */
export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const f = useFormat();
  const project = useProject(id);
  const overview = useQuery({
    queryKey: ['project', id, 'overview'],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/projects/{id}/overview', { params: { path: { id } } })),
  });
  const p = project.data;
  const o = overview.data;
  if (!p) return null;
  const money = p.contractValue
    ? new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(Number(p.contractValue))
    : '–';
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
        <Stat
          label={t('projects.documents')}
          value={o?.documentCount}
          href={`/projects/${id}/documents`}
        />
        <Stat label={t('projects.activeReviews')} value={o?.activeReviewSteps} />
        <Stat
          label={t('projects.overdueReviews')}
          value={o?.overdueReviewSteps}
          danger={!!o?.overdueReviewSteps}
        />
        <Stat
          label={t('projects.draftTransmittals')}
          value={o?.draftTransmittals}
          href={`/projects/${id}/transmittals`}
        />
        <Card className="col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle>{t('projects.documentsByRevision')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {o?.documentsByRevisionStatus.length ? (
              o.documentsByRevisionStatus.map((s) => (
                <div
                  key={s.status}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                >
                  {s.status === 'NO_REVISION' ? (
                    <span className="text-sm text-muted">{t('projects.noRevision')}</span>
                  ) : (
                    <StatusBadge enumName="RevisionStatus" value={s.status} />
                  )}
                  <span className="text-lg font-semibold tabular-nums">{s.count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle>{t('projects.recentTransmittals')}</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-border">
            {o?.recentTransmittals.map((tr) => (
              <li key={tr.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Link
                  href={`/projects/${id}/transmittals/${tr.id}`}
                  className="font-mono text-xs hover:underline"
                >
                  {tr.number}
                </Link>
                <span className="min-w-0 flex-1 truncate">{tr.subject}</span>
                <span className="text-xs text-muted">{f.date(tr.sentAt)}</span>
                <StatusBadge enumName="TransmittalStatus" value={tr.status} />
              </li>
            ))}
            {!o?.recentTransmittals.length ? (
              <li className="px-4 py-3 text-sm text-muted">{t('common.noData')}</li>
            ) : null}
          </ul>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('projects.info')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">{t('projects.type')}</dt>
            <dd>{t(`enums.ProjectType.${p.type}`)}</dd>
            <dt className="text-muted">{t('projects.manager')}</dt>
            <dd>{p.projectManager?.displayName ?? '–'}</dd>
            <dt className="text-muted">{t('projects.contractNo')}</dt>
            <dd>{p.contractNo ?? '–'}</dd>
            <dt className="text-muted">{t('projects.contractValue')}</dt>
            <dd className="tabular-nums">{money}</dd>
            <dt className="text-muted">{t('projects.plannedPeriod')}</dt>
            <dd>
              {f.date(p.plannedStartDate)} – {f.date(p.plannedEndDate)}
            </dd>
            <dt className="text-muted">{t('projects.actualPeriod')}</dt>
            <dd>
              {f.date(p.actualStartDate)} – {f.date(p.actualEndDate)}
            </dd>
            <dt className="text-muted">{t('projects.revisionScheme')}</dt>
            <dd>{t(`enums.RevisionScheme.${p.revisionScheme}`)}</dd>
            <dt className="text-muted">{t('projects.team')}</dt>
            <dd>{p.memberCount}</dd>
          </dl>
          {p.description ? (
            <p className="mt-3 text-sm whitespace-pre-line">{p.description}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  danger,
}: {
  label: string;
  value: number | undefined;
  href?: string;
  danger?: boolean;
}) {
  const body = (
    <Card className="h-full p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${danger ? 'text-danger-fg' : ''}`}>
        {value ?? '–'}
      </p>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
