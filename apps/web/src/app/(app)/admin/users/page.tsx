'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert } from '@/components/problem-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';
import { useFormat } from '@/lib/hooks/use-format';
import { useUrlState } from '@/lib/hooks/use-url-state';
import { TemporaryPasswordDialog } from './temporary-password-dialog';

type User = Dto<'UserDto'>;

function UsersPageInner() {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const [state, set] = useUrlState(['q', 'roleCode', 'isActive', 'page', 'sort'] as const);
  const page = Number(state.page ?? 1);
  const [creating, setCreating] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['users', state],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/users', {
          params: {
            query: {
              q: state.q,
              roleCode: state.roleCode,
              isActive: state.isActive === undefined ? undefined : state.isActive === 'true',
              page,
              pageSize: 25,
              sort: state.sort,
            },
          },
        }),
      ),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async () => unwrap(await api.GET('/api/v1/roles')),
  });

  const columns = useMemo<ColumnDef<User, unknown>[]>(
    () => [
      {
        id: 'displayNameTh',
        header: t('common.name'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.displayNameTh}</div>
            <div className="text-xs text-muted">{row.original.position}</div>
          </div>
        ),
      },
      { id: 'email', header: t('common.email'), cell: ({ row }) => row.original.email },
      {
        id: 'roles',
        header: t('admin.roles'),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r}>{roles.data?.find((x) => x.code === r)?.nameTh ?? r}</Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Badge tone={row.original.isActive ? 'success' : 'muted'}>
              {row.original.isActive ? t('common.active') : t('common.inactive')}
            </Badge>
            {row.original.lockedUntil && new Date(row.original.lockedUntil) > new Date() ? (
              <Badge tone="danger">{t('admin.locked')}</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'lastLoginAt',
        header: t('admin.lastLogin'),
        cell: ({ row }) => (
          <span className="text-muted">{f.dateTime(row.original.lastLoginAt)}</span>
        ),
      },
    ],
    [t, f, roles.data],
  );

  return (
    <>
      <PageHeader
        title={t('admin.usersTitle')}
        actions={
          <Button onClick={() => setCreating(true)} data-testid="new-user">
            <Plus /> {t('admin.newUser')}
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          className="w-64"
          placeholder={t('common.search')}
          defaultValue={state.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <NativeSelect
          className="w-52"
          value={state.roleCode ?? ''}
          onChange={(e) => set({ roleCode: e.target.value })}
        >
          <option value="">
            {t('admin.roles')}: {t('common.all')}
          </option>
          {roles.data?.map((r) => (
            <option key={r.code} value={r.code}>
              {r.nameTh}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-40"
          value={state.isActive ?? ''}
          onChange={(e) => set({ isActive: e.target.value })}
        >
          <option value="">
            {t('common.status')}: {t('common.all')}
          </option>
          <option value="true">{t('common.active')}</option>
          <option value="false">{t('common.inactive')}</option>
        </NativeSelect>
      </div>
      <ProblemAlert error={users.error} />
      <DataTable
        columns={columns}
        data={users.data?.data}
        loading={users.isLoading}
        page={page}
        pageSize={25}
        total={users.data?.meta.total}
        onPage={(p) => set({ page: p }, false)}
        sort={state.sort}
        onSort={(s) => set({ sort: s })}
        sortable={['displayNameTh', 'email', 'lastLoginAt']}
        onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
        rowTestId={(u) => `user-row-${u.email}`}
      />
      <CreateUserDialog
        open={creating}
        onOpenChange={setCreating}
        roles={roles.data ?? []}
        onCreated={(pw) => setTempPassword(pw)}
      />
      <TemporaryPasswordDialog password={tempPassword} onClose={() => setTempPassword(null)} />
    </>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: Dto<'RoleDto'>[];
  onCreated: (tempPassword: string) => void;
}) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/users', {
          body: { email, displayNameTh: name, position: position || undefined, roleCodes },
        }),
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      onOpenChange(false);
      setEmail('');
      setName('');
      setPosition('');
      setRoleCodes([]);
      onCreated(res.temporaryPassword);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('admin.newUser')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <ProblemAlert error={create.error} />
          <FormField label={t('common.email')} htmlFor="nu-email">
            <Input
              id="nu-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="new-user-email"
            />
          </FormField>
          <FormField label={t('profile.displayNameTh')} htmlFor="nu-name">
            <Input
              id="nu-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="new-user-name"
            />
          </FormField>
          <FormField label={t('admin.position')} htmlFor="nu-pos">
            <Input id="nu-pos" value={position} onChange={(e) => setPosition(e.target.value)} />
          </FormField>
          <div>
            <p className="mb-1.5 text-sm font-medium">{t('admin.roles')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {roles.map((r) => (
                <label key={r.code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={roleCodes.includes(r.code)}
                    onCheckedChange={(c) =>
                      setRoleCodes((prev) =>
                        c ? [...prev, r.code] : prev.filter((x) => x !== r.code),
                      )
                    }
                    data-testid={`new-user-role-${r.code}`}
                  />
                  {r.nameTh}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending} data-testid="new-user-submit">
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  return (
    <Suspense>
      <UsersPageInner />
    </Suspense>
  );
}
