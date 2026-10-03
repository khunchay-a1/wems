'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';
import { useDraft } from '@/lib/hooks/use-draft';

/** Permission × role matrix grouped by module (docs/07-web-ui.md §6.8). */
export default function RolesPage() {
  const t = useTranslations();
  const qc = useQueryClient();
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async () => unwrap(await api.GET('/api/v1/roles')),
  });
  const perms = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => unwrap(await api.GET('/api/v1/permissions')),
  });
  const [matrixDraft, setMatrix] = useDraft(
    roles.data,
    (rs) =>
      Object.fromEntries(rs.map((r) => [r.id, new Set(r.permissions)])) as Record<
        string,
        Set<string>
      >,
  );
  const matrix = useMemo(() => matrixDraft ?? {}, [matrixDraft]);
  const [creating, setCreating] = useState(false);

  const dirty = useMemo(
    () =>
      (roles.data ?? []).filter(
        (r) => [...(matrix[r.id] ?? [])].sort().join() !== [...r.permissions].sort().join(),
      ),
    [roles.data, matrix],
  );
  const save = useMutation({
    mutationFn: async () => {
      for (const r of dirty) {
        unwrap(
          await api.PATCH('/api/v1/roles/{id}', {
            params: { path: { id: r.id } },
            body: { permissions: [...(matrix[r.id] ?? [])] },
          }),
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success(t('common.saved'));
    },
  });

  const groups = useMemo(() => {
    const g = new Map<string, NonNullable<typeof perms.data>>();
    for (const p of perms.data ?? []) {
      const mod = p.code.split('.')[0]!;
      g.set(mod, [...(g.get(mod) ?? []), p]);
    }
    return [...g.entries()];
  }, [perms]);

  return (
    <>
      <PageHeader
        title={t('admin.rolesTitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus /> {t('admin.newRole')}
            </Button>
            <Button
              disabled={!dirty.length || save.isPending}
              onClick={() => save.mutate()}
              data-testid="save-matrix"
            >
              {t('admin.saveMatrix')} {dirty.length ? `(${dirty.length})` : ''}
            </Button>
          </>
        }
      />
      <ProblemAlert error={save.error ?? roles.error} />
      <div className="overflow-auto rounded-md border border-border bg-surface">
        <table className="text-xs">
          <thead className="sticky top-0 bg-subtle">
            <tr>
              <th className="sticky left-0 z-10 min-w-72 bg-subtle px-3 py-2 text-left">
                {t('admin.permission')}
              </th>
              {roles.data?.map((r) => (
                <th
                  key={r.id}
                  className="px-2 py-2 text-center font-semibold whitespace-nowrap"
                  title={r.description ?? ''}
                >
                  {r.nameTh}
                  <div className="font-normal text-muted">{r.userCount}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([mod, list]) => (
              <>
                <tr key={mod} className="bg-background">
                  <td
                    colSpan={(roles.data?.length ?? 0) + 1}
                    className="sticky left-0 px-3 py-1 font-semibold text-muted uppercase"
                  >
                    {mod}
                  </td>
                </tr>
                {list.map((p) => (
                  <tr key={p.code} className="border-t border-border">
                    <td className="sticky left-0 bg-surface px-3 py-1.5">
                      <div>{p.descriptionTh}</div>
                      <div className="font-mono text-[10px] text-muted">
                        {p.code} · {t('admin.phase')} {p.phase}
                      </div>
                    </td>
                    {roles.data?.map((r) => (
                      <td key={r.id} className="text-center">
                        <Checkbox
                          className="mx-auto"
                          checked={matrix[r.id]?.has(p.code) ?? false}
                          onCheckedChange={(c) =>
                            setMatrix((m) => {
                              const next = new Set(m?.[r.id]);
                              if (c) next.add(p.code);
                              else next.delete(p.code);
                              return { ...m, [r.id]: next };
                            })
                          }
                          aria-label={`${r.code} ${p.code}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <NewRoleDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function NewRoleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [nameTh, setName] = useState('');
  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/api/v1/roles', { body: { code, nameTh, permissions: [] } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('admin.newRole')}>
        <ProblemAlert error={create.error} />
        <div className="space-y-3">
          <FormField label={t('common.code')} hint="A-Z 0-9 _">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </FormField>
          <FormField label={t('common.name')}>
            <Input value={nameTh} onChange={(e) => setName(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
