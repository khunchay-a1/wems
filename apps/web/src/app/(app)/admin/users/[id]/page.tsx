'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, KeyRound, LogOut, Plus, Unlock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConflictDialog } from '@/components/conflict-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { EnumLabel } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';
import { useDraft } from '@/lib/hooks/use-draft';
import { useFormat } from '@/lib/hooks/use-format';
import { AddLicenseDialog } from '@/components/licenses';
import { TemporaryPasswordDialog } from '../temporary-password-dialog';

type User = Dto<'UserDetailDto'>;

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const qc = useQueryClient();
  const user = useQuery({
    queryKey: ['user', id],
    queryFn: async () => unwrap(await api.GET('/api/v1/users/{id}', { params: { path: { id } } })),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async () => unwrap(await api.GET('/api/v1/roles')),
  });
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: async () => unwrap(await api.GET('/api/v1/departments')),
  });
  const [draft, setForm] = useDraft<User, Partial<User>>(user.data, (u) => u);
  const form = draft ?? {};
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['user', id] });
  const save = useMutation({
    mutationFn: async (patch: Partial<User> & { version: number }) =>
      unwrap(
        await api.PATCH('/api/v1/users/{id}', {
          params: { path: { id } },
          body: {
            version: patch.version,
            displayNameTh: patch.displayNameTh,
            displayNameEn: patch.displayNameEn,
            position: patch.position,
            phone: patch.phone,
            employeeCode: patch.employeeCode,
            departmentId: patch.departmentId,
            roleCodes: patch.roles,
            isActive: patch.isActive,
          },
        }),
      ),
    onSuccess: (u) => {
      qc.setQueryData(['user', id], u);
      void qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(t('common.saved'));
    },
  });
  const action = useMutation({
    mutationFn: async (kind: 'reset' | 'unlock' | 'revoke') => {
      if (kind === 'reset')
        return unwrap(
          await api.POST('/api/v1/users/{id}/reset-password', { params: { path: { id } } }),
        );
      if (kind === 'unlock')
        return unwrap(await api.POST('/api/v1/users/{id}/unlock', { params: { path: { id } } }));
      return unwrap(
        await api.POST('/api/v1/users/{id}/revoke-sessions', { params: { path: { id } } }),
      );
    },
    onSuccess: (res) => {
      if (res && typeof res === 'object' && 'temporaryPassword' in res)
        setTempPassword(res.temporaryPassword);
      else toast.success(t('common.saved'));
      void refresh();
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });

  if (!user.data) return <ProblemAlert error={user.error} />;
  const u = user.data;
  const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();

  return (
    <>
      <Link
        href="/admin/users"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t('common.back')}
      </Link>
      <PageHeader
        title={u.displayNameTh}
        subtitle={u.email}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => action.mutate('reset')}
              data-testid="reset-password"
            >
              <KeyRound /> {t('admin.resetPassword')}
            </Button>
            {locked ? (
              <Button variant="outline" onClick={() => action.mutate('unlock')}>
                <Unlock /> {t('admin.unlock')}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => action.mutate('revoke')}>
              <LogOut /> {t('admin.revokeSessions')}
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('profile.personal')}</CardTitle>
            <Badge tone={u.isActive ? 'success' : 'muted'}>
              {u.isActive ? t('common.active') : t('common.inactive')}
            </Badge>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate({ ...form, version: u.version });
              }}
            >
              <ProblemAlert
                error={
                  save.error &&
                  !(save.error as { problem?: { code?: string } }).problem?.code?.startsWith(
                    'CONFLICT',
                  )
                    ? save.error
                    : null
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t('profile.displayNameTh')}>
                  <Input
                    value={form.displayNameTh ?? ''}
                    onChange={(e) => setForm({ ...form, displayNameTh: e.target.value })}
                  />
                </FormField>
                <FormField label={t('profile.displayNameEn')}>
                  <Input
                    value={form.displayNameEn ?? ''}
                    onChange={(e) => setForm({ ...form, displayNameEn: e.target.value })}
                  />
                </FormField>
                <FormField label={t('admin.position')}>
                  <Input
                    value={form.position ?? ''}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                  />
                </FormField>
                <FormField label={t('common.phone')}>
                  <Input
                    value={form.phone ?? ''}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </FormField>
                <FormField label={t('admin.employeeCode')}>
                  <Input
                    value={form.employeeCode ?? ''}
                    onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                  />
                </FormField>
                <FormField label={t('admin.department')}>
                  <NativeSelect
                    value={form.departmentId ?? ''}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value || null })}
                  >
                    <option value="">–</option>
                    {departments.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nameTh}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium">{t('admin.roles')}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {roles.data?.map((r) => (
                    <label key={r.code} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.roles?.includes(r.code) ?? false}
                        onCheckedChange={(c) =>
                          setForm({
                            ...form,
                            roles: c
                              ? [...(form.roles ?? []), r.code]
                              : (form.roles ?? []).filter((x) => x !== r.code),
                          })
                        }
                      />
                      {r.nameTh}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.isActive ?? true}
                    onCheckedChange={(c) => setForm({ ...form, isActive: c === true })}
                  />
                  {t('common.active')}
                </label>
                <Button type="submit" disabled={save.isPending} data-testid="save-user">
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Licenses user={u} onChanged={refresh} />
      </div>
      <TemporaryPasswordDialog password={tempPassword} onClose={() => setTempPassword(null)} />
      <ConflictDialog
        error={save.error}
        yourInput={form}
        onReload={() => void refresh()}
        onClose={() => save.reset()}
      />
    </>
  );
}

function Licenses({ user, onChanged }: { user: User; onChanged: () => void }) {
  const t = useTranslations();
  const f = useFormat();
  const [adding, setAdding] = useState(false);
  const verify = useMutation({
    mutationFn: async (licenseId: string) =>
      unwrap(
        await api.POST('/api/v1/licenses/{id}/verify', { params: { path: { id: licenseId } } }),
      ),
    onSuccess: onChanged,
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.licenses')}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus /> {t('admin.addLicense')}
        </Button>
      </CardHeader>
      <Table>
        <THead>
          <TR>
            <TH>{t('admin.licenseNo')}</TH>
            <TH>{t('admin.branch')}</TH>
            <TH>{t('admin.expiresAt')}</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {user.licenses.map((l) => (
            <TR key={l.id}>
              <TD>
                <div className="font-medium">{l.licenseNo}</div>
                <div className="text-xs text-muted">
                  <EnumLabel enumName="LicenseType" value={l.type} /> ·{' '}
                  <EnumLabel enumName="LicenseLevel" value={l.level} />
                </div>
              </TD>
              <TD>
                <EnumLabel enumName="LicenseBranch" value={l.branch} />
              </TD>
              <TD>
                {f.date(l.expiresAt)}{' '}
                {l.isExpired ? <Badge tone="danger">{t('admin.expired')}</Badge> : null}
              </TD>
              <TD className="text-right">
                {l.verifiedAt ? (
                  <Badge tone="success">
                    <CheckCircle2 className="mr-1 size-3" />
                    {t('admin.verified')}
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => verify.mutate(l.id)}>
                    {t('admin.verify')}
                  </Button>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <AddLicenseDialog
        open={adding}
        onOpenChange={setAdding}
        userId={user.id}
        onAdded={onChanged}
      />
    </Card>
  );
}
