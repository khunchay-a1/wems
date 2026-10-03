'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert } from '@/components/problem-alert';
import { EnumLabel, StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect } from '@/components/ui/input';
import { PROJECT_STATUSES, PROJECT_TYPES, type Project } from '@/features/projects/api';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/hooks/use-format';
import { useUrlState } from '@/lib/hooks/use-url-state';

const KEYS = ['q', 'status', 'type', 'mine', 'page', 'sort', 'clientId'] as const;

function ProjectsInner() {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const { can } = useAuth();
  const [state, set] = useUrlState(KEYS);
  const [q, setQ] = useState(state.q ?? '');
  const page = Number(state.page ?? 1);
  const projects = useQuery({
    queryKey: ['projects', state],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/projects', {
          params: {
            query: {
              q: state.q,
              status: state.status ?? 'PLANNING,ACTIVE,ON_HOLD,COMPLETED',
              type: state.type,
              clientId: state.clientId,
              mine: state.mine === '1' ? true : undefined,
              page,
              pageSize: 25,
              sort: state.sort,
            },
          },
        }),
      ),
  });

  const columns = useMemo<ColumnDef<Project, unknown>[]>(
    () => [
      {
        id: 'code',
        header: t('common.code'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
      },
      {
        id: 'name',
        header: t('projects.name'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted">{row.original.client.nameTh}</div>
          </div>
        ),
      },
      {
        id: 'type',
        header: t('projects.type'),
        cell: ({ row }) => <EnumLabel enumName="ProjectType" value={row.original.type} />,
      },
      {
        id: 'pm',
        header: t('projects.manager'),
        cell: ({ row }) => row.original.projectManager?.displayName ?? '–',
      },
      {
        id: 'plannedEndDate',
        header: t('projects.plannedEnd'),
        cell: ({ row }) => f.date(row.original.plannedEndDate),
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => <StatusBadge enumName="ProjectStatus" value={row.original.status} />,
      },
    ],
    [t, f],
  );

  return (
    <>
      <PageHeader
        title={t('projects.title')}
        actions={
          can('project.create') ? (
            <Button asChild data-testid="new-project">
              <Link href="/projects/new">
                <Plus /> {t('projects.new')}
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q });
          }}
        >
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted" />
          <Input
            className="w-72 pl-8"
            placeholder={t('common.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <NativeSelect
          className="w-44"
          value={state.status ?? ''}
          onChange={(e) => set({ status: e.target.value })}
        >
          <option value="">{t('projects.openStatuses')}</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`enums.ProjectStatus.${s}`)}
            </option>
          ))}
          <option value={PROJECT_STATUSES.join(',')}>{t('common.all')}</option>
        </NativeSelect>
        <NativeSelect
          className="w-48"
          value={state.type ?? ''}
          onChange={(e) => set({ type: e.target.value })}
        >
          <option value="">{t('projects.allTypes')}</option>
          {PROJECT_TYPES.map((s) => (
            <option key={s} value={s}>
              {t(`enums.ProjectType.${s}`)}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={state.mine === '1'}
            onCheckedChange={(v) => set({ mine: v === true ? '1' : undefined })}
            data-testid="mine-only"
          />
          {t('projects.mine')}
        </label>
      </div>
      <ProblemAlert error={projects.error} />
      <DataTable
        columns={columns}
        data={projects.data?.data}
        loading={projects.isLoading}
        page={page}
        pageSize={25}
        total={projects.data?.meta.total}
        onPage={(p) => set({ page: p }, false)}
        sort={state.sort}
        onSort={(s) => set({ sort: s })}
        sortable={['code', 'name', 'plannedEndDate', 'status']}
        onRowClick={(p) => router.push(`/projects/${p.id}`)}
        rowTestId={(p) => `project-row-${p.code}`}
      />
    </>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsInner />
    </Suspense>
  );
}
