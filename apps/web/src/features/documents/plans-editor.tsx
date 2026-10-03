'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DateField } from '@/components/date-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';
import { useDraft } from '@/lib/hooks/use-draft';
import { useFormat } from '@/lib/hooks/use-format';
import { type Doc, PLAN_PURPOSES, type PurposeCode } from './api';

type Row = {
  purposeCode: PurposeCode;
  plannedDate: string | null;
  forecastDate: string | null;
  actualDate: string | null;
};

/** Delivery plan per purpose (M04 §9); actual dates come from transmittals (BR-DOC-063). */
export function PlansEditor({ doc }: { doc: Doc }) {
  const t = useTranslations();
  const f = useFormat();
  const qc = useQueryClient();
  const editable = doc.allowedActions.includes('editPlans');
  const [draft, setRows] = useDraft(doc, (d) =>
    PLAN_PURPOSES.map((pc): Row => {
      const p = d.plans.find((x) => x.purposeCode === pc);
      return {
        purposeCode: pc,
        plannedDate: p?.plannedDate ?? null,
        forecastDate: p?.forecastDate ?? null,
        actualDate: p?.actualDate ?? null,
      };
    }),
  );
  const rows = draft ?? [];
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PUT('/api/v1/documents/{id}/plans', {
          params: { path: { id: doc.id } },
          body: { plans: rows.filter((r) => r.plannedDate || r.forecastDate || r.actualDate) },
        }),
      ),
    onSuccess: (d) => {
      qc.setQueryData(['document', doc.id], d);
      toast.success(t('common.saved'));
    },
  });
  const set = (pc: PurposeCode, patch: Partial<Row>) =>
    setRows(rows.map((r) => (r.purposeCode === pc ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      <ProblemAlert error={save.error} />
      <div className="overflow-x-auto rounded-md border border-border bg-surface">
        <Table>
          <THead>
            <TR>
              <TH>{t('documents.purpose')}</TH>
              <TH>{t('documents.planned')}</TH>
              <TH>{t('documents.forecast')}</TH>
              <TH>{t('documents.actual')}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.purposeCode}>
                <TD>
                  <span className="font-mono">{r.purposeCode}</span> ·{' '}
                  {t(`enums.PurposeCode.${r.purposeCode}`)}
                </TD>
                {(['plannedDate', 'forecastDate', 'actualDate'] as const).map((k) => (
                  <TD key={k}>
                    {editable ? (
                      <DateField value={r[k]} onChange={(v) => set(r.purposeCode, { [k]: v })} />
                    ) : (
                      f.date(r[k])
                    )}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      {editable ? (
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
