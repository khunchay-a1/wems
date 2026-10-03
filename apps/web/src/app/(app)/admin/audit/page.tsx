'use client';

import type { Dto } from '@wems/api-contract';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';
import { useFormat } from '@/lib/hooks/use-format';
import { useUrlState } from '@/lib/hooks/use-url-state';

type Row = Dto<'AuditLogDto'>;
const KEYS = ['q', 'action', 'entityType', 'occurredFrom', 'occurredTo', 'page'] as const;

function AuditInner() {
  const t = useTranslations();
  const f = useFormat();
  const [state, set] = useUrlState(KEYS);
  const page = Number(state.page ?? 1);
  const [selected, setSelected] = useState<Row | null>(null);
  const query = {
    q: state.q,
    action: state.action,
    entityType: state.entityType,
    occurredFrom: state.occurredFrom,
    occurredTo: state.occurredTo,
  };
  const logs = useQuery({
    queryKey: ['audit', state],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/audit-logs', {
          params: { query: { ...query, page, pageSize: 50 } },
        }),
      ),
  });
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: 'occurredAt',
        header: t('admin.occurredAt'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{f.dateTime(row.original.occurredAt)}</span>
        ),
      },
      {
        id: 'actor',
        header: t('admin.actor'),
        cell: ({ row }) => row.original.actorName ?? row.original.actorType,
      },
      {
        id: 'action',
        header: t('admin.action'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
      },
      {
        id: 'entity',
        header: t('admin.entity2'),
        cell: ({ row }) => <span className="text-xs">{row.original.entityType}</span>,
      },
      {
        id: 'summary',
        header: t('common.details'),
        cell: ({ row }) => (
          <span className="text-muted">{row.original.summary ?? row.original.reason}</span>
        ),
      },
    ],
    [t, f],
  );
  const exportUrl = `/api/v1/audit-logs/export?${new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1])).toString()}`;
  return (
    <>
      <PageHeader
        title={t('admin.auditTitle')}
        actions={
          <Button variant="outline" asChild>
            <a href={exportUrl}>
              <Download /> {t('admin.exportCsv')}
            </a>
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          placeholder={t('common.search')}
          defaultValue={state.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <Input
          className="w-44"
          placeholder={t('admin.action')}
          defaultValue={state.action}
          onChange={(e) => set({ action: e.target.value })}
        />
        <span className="text-sm text-muted">{t('admin.from')}</span>
        <Input
          type="date"
          className="w-40"
          value={state.occurredFrom ?? ''}
          onChange={(e) => set({ occurredFrom: e.target.value })}
        />
        <span className="text-sm text-muted">{t('admin.to')}</span>
        <Input
          type="date"
          className="w-40"
          value={state.occurredTo ?? ''}
          onChange={(e) => set({ occurredTo: e.target.value })}
        />
      </div>
      <ProblemAlert error={logs.error} />
      <DataTable
        columns={columns}
        data={logs.data?.data}
        loading={logs.isLoading}
        page={page}
        pageSize={50}
        total={logs.data?.meta.total}
        onPage={(p) => set({ page: p }, false)}
        onRowClick={setSelected}
      />
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected ? (
          <DialogContent
            title={selected.action}
            description={`${f.dateTime(selected.occurredAt)} · ${selected.actorName ?? selected.actorType} · ${selected.ip ?? ''}`}
            wide
          >
            <DiffView
              changes={
                selected.changes as {
                  before?: Record<string, unknown>;
                  after?: Record<string, unknown>;
                } | null
              }
            />
            {selected.requestId ? (
              <p className="mt-3 text-xs text-muted">
                {t('common.requestId')}: {selected.requestId}
              </p>
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

function DiffView({
  changes,
}: {
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
}) {
  const t = useTranslations('admin');
  if (!changes?.after) return <p className="text-sm text-muted">–</p>;
  const keys = Object.keys(changes.after);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="py-1">{t('entity2')}</th>
          <th className="py-1">{t('before')}</th>
          <th className="py-1">{t('after')}</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-t border-border align-top">
            <td className="py-1 pr-2 font-mono text-xs">{k}</td>
            <td className="py-1 pr-2 text-danger-fg">
              {JSON.stringify(changes.before?.[k] ?? null)}
            </td>
            <td className="py-1 text-success-fg">{JSON.stringify(changes.after?.[k] ?? null)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditInner />
    </Suspense>
  );
}
