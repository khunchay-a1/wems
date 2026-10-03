'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert } from '@/components/problem-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';

export default function DepartmentsPage() {
  const t = useTranslations();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['departments'],
    queryFn: async () => unwrap(await api.GET('/api/v1/departments')),
  });
  const [code, setCode] = useState('');
  const [nameTh, setNameTh] = useState('');
  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/api/v1/departments', { body: { code, nameTh } })),
    onSuccess: () => {
      setCode('');
      setNameTh('');
      void qc.invalidateQueries({ queryKey: ['departments'] });
    },
  });
  const toggle = useMutation({
    mutationFn: async (d: { id: string; isActive: boolean }) =>
      unwrap(
        await api.PATCH('/api/v1/departments/{id}', {
          params: { path: { id: d.id } },
          body: { isActive: !d.isActive },
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['departments'] }),
  });
  return (
    <>
      <PageHeader title={t('admin.departmentsTitle')} />
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Input
          className="w-32"
          placeholder={t('common.code')}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <Input
          className="w-72"
          placeholder={t('common.name')}
          value={nameTh}
          onChange={(e) => setNameTh(e.target.value)}
        />
        <Button type="submit" disabled={!code || !nameTh}>
          {t('admin.newDepartment')}
        </Button>
      </form>
      <ProblemAlert error={create.error} />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{t('common.code')}</TH>
              <TH>{t('common.name')}</TH>
              <TH>{t('common.status')}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {list.data?.map((d) => (
              <TR key={d.id}>
                <TD className="font-mono">{d.code}</TD>
                <TD>{d.nameTh}</TD>
                <TD>
                  <Badge tone={d.isActive ? 'success' : 'muted'}>
                    {d.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate(d)}>
                    {d.isActive ? t('admin.deactivate') : t('admin.activate')}
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
