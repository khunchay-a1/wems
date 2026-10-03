'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { toastError } from '@/components/problem-alert';
import { EnumLabel } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';

type Scheme = Dto<'NumberingSchemeDto'>;

export default function NumberingPage() {
  const t = useTranslations();
  const list = useQuery({
    queryKey: ['numbering'],
    queryFn: async () => unwrap(await api.GET('/api/v1/numbering-schemes')),
  });
  return (
    <>
      <PageHeader
        title={t('admin.numberingTitle')}
        subtitle={t.raw('admin.tokensHelp') as string}
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{t('admin.entity')}</TH>
              <TH>{t('admin.scope')}</TH>
              <TH>{t('admin.pattern')}</TH>
              <TH>{t('admin.reset')}</TH>
              <TH>{t('admin.example')}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {list.data?.map((s) => (
              <SchemeRow key={s.id} scheme={s} />
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

function SchemeRow({ scheme }: { scheme: Scheme }) {
  const t = useTranslations();
  const te = useTranslations('enums');
  const qc = useQueryClient();
  const [pattern, setPattern] = useState(scheme.pattern);
  const [reset, setReset] = useState(scheme.resetPolicy);
  const preview = useQuery({
    queryKey: ['numbering-preview', scheme.entity, pattern],
    queryFn: async () =>
      unwrap(
        await api.POST('/api/v1/numbering-schemes/preview', {
          body: { entity: scheme.entity, pattern },
        }),
      ),
    retry: false,
  });
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/api/v1/numbering-schemes/{id}', {
          params: { path: { id: scheme.id } },
          body: { pattern, resetPolicy: reset },
        }),
      ),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['numbering'] });
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const changed = pattern !== scheme.pattern || reset !== scheme.resetPolicy;
  return (
    <TR>
      <TD>
        <EnumLabel enumName="NumberedEntity" value={scheme.entity} />
      </TD>
      <TD className="font-mono text-xs">{scheme.scope}</TD>
      <TD>
        <Input
          className="w-72 font-mono"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
      </TD>
      <TD>
        <NativeSelect
          className="w-36"
          value={reset}
          onChange={(e) => setReset(e.target.value as typeof reset)}
        >
          {(['NEVER', 'YEARLY', 'MONTHLY'] as const).map((r) => (
            <option key={r} value={r}>
              {te(`SequenceReset.${r}`)}
            </option>
          ))}
        </NativeSelect>
      </TD>
      <TD className="font-mono">{preview.data?.number ?? (preview.error ? '⚠' : '…')}</TD>
      <TD>
        <Button size="sm" disabled={!changed || save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </TD>
    </TR>
  );
}
