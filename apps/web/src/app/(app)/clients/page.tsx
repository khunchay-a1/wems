'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert } from '@/components/problem-alert';
import { EnumLabel } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { ClientFields, CLIENT_TYPES, type ClientFormValue } from '@/features/clients/client-form';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useUrlState } from '@/lib/hooks/use-url-state';

type Client = Dto<'ClientDto'>;
const KEYS = ['q', 'clientType', 'isActive', 'page', 'sort'] as const;

function ClientsInner() {
  const t = useTranslations();
  const router = useRouter();
  const { can } = useAuth();
  const [state, set] = useUrlState(KEYS);
  const page = Number(state.page ?? 1);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState(state.q ?? '');

  const clients = useQuery({
    queryKey: ['clients', state],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/clients', {
          params: {
            query: {
              q: state.q,
              clientType: state.clientType,
              isActive:
                state.isActive === undefined
                  ? true
                  : state.isActive === 'all'
                    ? undefined
                    : state.isActive === 'true',
              page,
              pageSize: 25,
              sort: state.sort,
            },
          },
        }),
      ),
  });

  const columns = useMemo<ColumnDef<Client, unknown>[]>(
    () => [
      {
        id: 'code',
        header: t('common.code'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
      },
      {
        id: 'nameTh',
        header: t('common.name'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.nameTh}</div>
            {row.original.nameEn ? (
              <div className="text-xs text-muted">{row.original.nameEn}</div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'clientType',
        header: t('clients.clientType'),
        cell: ({ row }) => <EnumLabel enumName="ClientType" value={row.original.clientType} />,
      },
      {
        id: 'province',
        header: t('address.province'),
        cell: ({ row }) => row.original.province ?? '–',
      },
      {
        id: 'openProjectCount',
        header: t('clients.openProjects'),
        cell: ({ row }) => row.original.openProjectCount,
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? 'success' : 'muted'}>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        title={t('clients.title')}
        actions={
          can('client.manage') ? (
            <Button onClick={() => setCreating(true)} data-testid="new-client">
              <Plus /> {t('clients.new')}
            </Button>
          ) : null
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
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
            data-testid="clients-search"
          />
        </form>
        <NativeSelect
          className="w-48"
          value={state.clientType ?? ''}
          onChange={(e) => set({ clientType: e.target.value })}
        >
          <option value="">{t('clients.allTypes')}</option>
          {CLIENT_TYPES.map((c) => (
            <option key={c} value={c}>
              {t(`enums.ClientType.${c}`)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-40"
          value={state.isActive ?? 'true'}
          onChange={(e) =>
            set({ isActive: e.target.value === 'true' ? undefined : e.target.value })
          }
        >
          <option value="true">{t('common.active')}</option>
          <option value="false">{t('common.inactive')}</option>
          <option value="all">{t('common.all')}</option>
        </NativeSelect>
      </div>
      <ProblemAlert error={clients.error} />
      <DataTable
        columns={columns}
        data={clients.data?.data}
        loading={clients.isLoading}
        page={page}
        pageSize={25}
        total={clients.data?.meta.total}
        onPage={(p) => set({ page: p }, false)}
        sort={state.sort}
        onSort={(s) => set({ sort: s })}
        sortable={['code', 'nameTh', 'province']}
        onRowClick={(c) => router.push(`/clients/${c.id}`)}
        rowTestId={(c) => `client-row-${c.code}`}
      />
      <CreateClientDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => router.push(`/clients/${id}`)}
      />
    </>
  );
}

const EMPTY: ClientFormValue = { nameTh: '', clientType: 'COMPANY' };

function CreateClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [value, setValue] = useState<ClientFormValue>(EMPTY);
  const create = useMutation({
    mutationFn: async () => {
      const body = Object.fromEntries(
        Object.entries(value).filter(([, v]) => v !== '' && v !== undefined),
      ) as ClientFormValue;
      return unwrap(await api.POST('/api/v1/clients', { body }));
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['clients'] });
      for (const w of res.warnings)
        toast.warning(t('clients.taxIdExists', { codes: w.clients.join(', ') }));
      setValue(EMPTY);
      onOpenChange(false);
      onCreated(res.id);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('clients.new')} wide>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <ProblemAlert error={create.error} />
          <div className="mt-3">
            <ClientFields value={value} onChange={setValue} error={create.error} showCode />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending} data-testid="client-submit">
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsInner />
    </Suspense>
  );
}
