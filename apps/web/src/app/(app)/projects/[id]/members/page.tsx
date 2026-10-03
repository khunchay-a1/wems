'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Crown, Trash2, UserPlus } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { UserPicker } from '@/components/user-picker';
import { PROJECT_ROLES, useProject, useProjectMembers } from '@/features/projects/api';
import { api, unwrap } from '@/lib/api';
import { useFormat } from '@/lib/hooks/use-format';

type Role = (typeof PROJECT_ROLES)[number];

/** Project team (M03 §3 members, BR-PRJ-002/003/010). */
export default function MembersPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const te = useTranslations('enums');
  const f = useFormat();
  const qc = useQueryClient();
  const project = useProject(id);
  const members = useProjectMembers(id);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('ENGINEER');
  const manage = !!project.data?.allowedActions.includes('manageMembers');

  const refresh = (data?: unknown) => {
    if (data) qc.setQueryData(['project', id, 'members'], data);
    void qc.invalidateQueries({ queryKey: ['project', id] });
  };
  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/projects/{id}/members', {
          params: { path: { id } },
          body: { userId: userId!, role },
        }),
      ),
    onSuccess: (d) => {
      setUserId(null);
      refresh(d);
    },
  });
  const change = useMutation({
    mutationFn: async (v: { userId: string; role: Role }) =>
      unwrap(
        await api.PATCH('/api/v1/projects/{id}/members/{userId}', {
          params: { path: { id, userId: v.userId } },
          body: { role: v.role },
        }),
      ),
    onSuccess: refresh,
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const remove = useMutation({
    mutationFn: async (uid: string) =>
      unwrap(
        await api.DELETE('/api/v1/projects/{id}/members/{userId}', {
          params: { path: { id, userId: uid } },
        }),
      ),
    onSuccess: () => refresh(),
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const memberIds = new Set(members.data?.map((m) => m.userId));

  return (
    <div className="space-y-4">
      {manage ? (
        <Card className="p-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (userId) add.mutate();
            }}
          >
            <div className="w-72">
              <p className="mb-1.5 text-sm font-medium">{t('projects.addMember')}</p>
              <UserPicker
                value={userId}
                onChange={(v) => setUserId(v)}
                filter={(u) => !memberIds.has(u.id)}
                testId="member-picker"
              />
            </div>
            <NativeSelect
              className="w-52"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              data-testid="member-role"
            >
              {PROJECT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {te(`ProjectRole.${r}`)}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" disabled={!userId || add.isPending} data-testid="member-add">
              <UserPlus /> {t('common.add')}
            </Button>
          </form>
          <div className="mt-2">
            <ProblemAlert error={add.error} />
          </div>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('projects.team')} ({members.data?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>{t('common.name')}</TH>
              <TH>{t('projects.role')}</TH>
              <TH>{t('projects.addedAt')}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {members.data?.map((m) => (
              <TR key={m.userId} data-testid="member-row">
                <TD>
                  <div className="flex items-center gap-1.5 font-medium">
                    {m.displayName}
                    {m.isProjectManager ? (
                      <Crown
                        className="size-3.5 text-warning-fg"
                        aria-label={t('projects.manager')}
                      />
                    ) : null}
                  </div>
                  <div className="text-xs text-muted">{m.position}</div>
                </TD>
                <TD>
                  {manage ? (
                    <NativeSelect
                      className="w-52"
                      value={m.role}
                      onChange={(e) =>
                        change.mutate({ userId: m.userId, role: e.target.value as Role })
                      }
                    >
                      {PROJECT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {te(`ProjectRole.${r}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    te(`ProjectRole.${m.role}`)
                  )}
                </TD>
                <TD className="text-sm text-muted">{f.date(m.addedAt)}</TD>
                <TD className="text-right">
                  {manage && !m.isProjectManager ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('projects.removeMember')}
                      onClick={() =>
                        window.confirm(t('projects.confirmRemoveMember')) && remove.mutate(m.userId)
                      }
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
