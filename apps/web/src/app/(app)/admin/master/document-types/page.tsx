'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { EnumLabel } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useTemplates } from '@/features/documents/master';
import { api, unwrap } from '@/lib/api';
import { useFieldError } from '@/lib/problem-fields';

type DocType = Dto<'DocumentTypeDto'>;
type Form = Omit<DocType, 'id'>;

const BRANCHES = [
  'CIVIL',
  'MECHANICAL',
  'ELECTRICAL_POWER',
  'ELECTRICAL_COMMUNICATION',
  'INDUSTRIAL',
  'ENVIRONMENTAL',
  'CHEMICAL',
  'MINING',
  'OTHER',
] as const;
const LEVELS = ['ASSOCIATE', 'ASSOCIATE_SPECIAL', 'PROFESSIONAL', 'SENIOR'] as const;

export default function DocumentTypesPage() {
  const t = useTranslations();
  const [editing, setEditing] = useState<DocType | 'new' | null>(null);
  const list = useQuery({
    queryKey: ['document-types', 'all'],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/document-types', { params: { query: { includeInactive: true } } }),
      ),
  });
  const templates = useTemplates(true);
  const tplName = (id: string | null) => templates.data?.find((x) => x.id === id)?.code ?? '–';
  return (
    <Card>
      <div className="flex justify-end p-3">
        <Button size="sm" onClick={() => setEditing('new')} data-testid="new-document-type">
          <Plus /> {t('common.add')}
        </Button>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>{t('common.code')}</TH>
            <TH>{t('common.name')}</TH>
            <TH>{t('master.pdfRequired')}</TH>
            <TH>{t('master.licensedApprover')}</TH>
            <TH>{t('master.defaultWorkflow')}</TH>
            <TH>{t('common.status')}</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {list.data?.map((d) => (
            <TR key={d.id}>
              <TD className="font-mono">{d.code}</TD>
              <TD>
                <div>{d.nameTh}</div>
                <div className="text-xs text-muted">{d.nameEn}</div>
              </TD>
              <TD>{d.requiresPdfRendition ? <Check className="size-4" /> : null}</TD>
              <TD>
                {d.requiresLicensedApprover ? (
                  <div className="text-xs">
                    <Check className="inline size-4" />{' '}
                    {d.minLicenseLevel ? (
                      <EnumLabel enumName="LicenseLevel" value={d.minLicenseLevel} />
                    ) : null}
                  </div>
                ) : null}
              </TD>
              <TD className="font-mono text-xs">{tplName(d.defaultWorkflowTemplateId)}</TD>
              <TD>
                <Badge tone={d.isActive ? 'success' : 'muted'}>
                  {d.isActive ? t('common.active') : t('common.inactive')}
                </Badge>
              </TD>
              <TD className="text-right">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditing(d)}
                  aria-label={t('common.edit')}
                >
                  <Pencil />
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <TypeForm
            key={editing === 'new' ? 'new' : editing.id}
            value={editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </Card>
  );
}

function TypeForm({ value, onDone }: { value: DocType | 'new'; onDone: () => void }) {
  const t = useTranslations();
  const te = useTranslations('enums');
  const qc = useQueryClient();
  const templates = useTemplates();
  const [form, setForm] = useState<Form>(
    value === 'new'
      ? {
          code: '',
          nameTh: '',
          nameEn: '',
          requiresPdfRendition: true,
          requiresLicensedApprover: false,
          allowedLicenseBranches: [],
          minLicenseLevel: null,
          defaultWorkflowTemplateId: null,
          sortOrder: 0,
          isActive: true,
        }
      : value,
  );
  const save = useMutation({
    mutationFn: async () => {
      const { code, ...body } = form;
      return value === 'new'
        ? unwrap(await api.POST('/api/v1/document-types', { body: { ...body, code } }))
        : unwrap(
            await api.PATCH('/api/v1/document-types/{id}', {
              params: { path: { id: value.id } },
              body,
            }),
          );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['document-types'] });
      onDone();
    },
  });
  const fe = useFieldError(save.error);
  const toggleBranch = (b: (typeof BRANCHES)[number], on: boolean) =>
    setForm({
      ...form,
      allowedLicenseBranches: on
        ? [...form.allowedLicenseBranches, b]
        : form.allowedLicenseBranches.filter((x) => x !== b),
    });
  return (
    <DialogContent title={value === 'new' ? t('master.newDocumentType') : t('common.edit')} wide>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <ProblemAlert error={save.error} />
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t('common.code')} hint={t('master.codeHint')} error={fe('code')}>
            <Input
              required
              disabled={value !== 'new'}
              maxLength={10}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </FormField>
          <FormField label={t('admin.nameTh')}>
            <Input
              required
              value={form.nameTh}
              onChange={(e) => setForm({ ...form, nameTh: e.target.value })}
            />
          </FormField>
          <FormField label={t('admin.nameEn')}>
            <Input
              required
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            />
          </FormField>
          <FormField label={t('master.defaultWorkflow')} error={fe('defaultWorkflowTemplateId')}>
            <NativeSelect
              value={form.defaultWorkflowTemplateId ?? ''}
              onChange={(e) =>
                setForm({ ...form, defaultWorkflowTemplateId: e.target.value || null })
              }
            >
              <option value="">–</option>
              {templates.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} · {x.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('master.sortOrder')}>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </FormField>
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.requiresPdfRendition}
              onCheckedChange={(v) => setForm({ ...form, requiresPdfRendition: v === true })}
            />
            {t('master.pdfRequiredLong')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.requiresLicensedApprover}
              onCheckedChange={(v) => setForm({ ...form, requiresLicensedApprover: v === true })}
            />
            {t('master.licensedApproverLong')}
          </label>
        </div>
        {form.requiresLicensedApprover ? (
          <div className="space-y-3 rounded-md border border-border p-3">
            <FormField label={t('master.minLicenseLevel')}>
              <NativeSelect
                className="w-60"
                value={form.minLicenseLevel ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    minLicenseLevel: (e.target.value || null) as Form['minLicenseLevel'],
                  })
                }
              >
                <option value="">{t('master.anyLevel')}</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {te(`LicenseLevel.${l}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <div>
              <p className="mb-1 text-sm font-medium">{t('master.allowedBranches')}</p>
              <p className="mb-1.5 text-xs text-muted">{t('master.allowedBranchesHint')}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {BRANCHES.map((b) => (
                  <label key={b} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.allowedLicenseBranches.includes(b)}
                      onCheckedChange={(v) => toggleBranch(b, v === true)}
                    />
                    {te(`LicenseBranch.${b}`)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.isActive}
            onCheckedChange={(v) => setForm({ ...form, isActive: v === true })}
          />
          {t('common.active')}
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
