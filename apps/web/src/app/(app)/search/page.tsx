'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, FileText, FolderKanban } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert } from '@/components/problem-alert';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/lib/api';

/** Global search (M04 §10 `GET /search`): documents, projects and clients the user may see. */
function SearchInner() {
  const t = useTranslations();
  const q = (useSearchParams().get('q') ?? '').trim();
  const res = useQuery({
    queryKey: ['search', q],
    enabled: q.length >= 2,
    queryFn: async () => unwrap(await api.GET('/api/v1/search', { params: { query: { q } } })),
  });
  const r = res.data;
  const empty = r && !r.documents.length && !r.projects.length && !r.clients.length;
  return (
    <>
      <PageHeader title={t('search.title', { q })} />
      <ProblemAlert error={res.error} />
      {q.length < 2 ? <EmptyState title={t('search.tooShort')} /> : null}
      {res.isLoading ? <Skeleton className="h-48 w-full" /> : null}
      {empty ? <EmptyState title={t('search.none')} /> : null}
      {r && !empty ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Section icon={FileText} title={t('search.documents')} count={r.documents.length}>
            {r.documents.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/projects/${d.projectId}/documents/${d.id}`}
                  className="block px-4 py-2 text-sm hover:bg-subtle"
                  data-testid={`search-doc-${d.number}`}
                >
                  <span className="font-mono text-xs">{d.number}</span>
                  {d.currentRevLabel ? (
                    <span className="text-xs text-muted"> Rev.{d.currentRevLabel}</span>
                  ) : null}
                  <span className="block truncate">{d.title}</span>
                </Link>
              </li>
            ))}
          </Section>
          <Section icon={FolderKanban} title={t('search.projects')} count={r.projects.length}>
            {r.projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{p.code}</span>
                    <span className="block truncate">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{p.clientName}</span>
                  </span>
                  <StatusBadge enumName="ProjectStatus" value={p.status} />
                </Link>
              </li>
            ))}
          </Section>
          <Section icon={Building2} title={t('search.clients')} count={r.clients.length}>
            {r.clients.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="block px-4 py-2 text-sm hover:bg-subtle">
                  <span className="font-mono text-xs">{c.code}</span>
                  <span className="block truncate">{c.nameTh}</span>
                </Link>
              </li>
            ))}
          </Section>
        </div>
      ) : null}
    </>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted" /> {title}
          <span className="text-sm text-muted tabular-nums">{count}</span>
        </CardTitle>
      </CardHeader>
      <ul className="divide-y divide-border">{children}</ul>
    </Card>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchInner />
    </Suspense>
  );
}
