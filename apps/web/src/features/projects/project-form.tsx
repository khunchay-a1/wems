'use client';

import type { Dto } from '@wems/api-contract';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { DateField } from '@/components/date-field';
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { UserPicker } from '@/components/user-picker';
import { api, unwrap } from '@/lib/api';
import { useFieldError } from '@/lib/problem-fields';
import { PROJECT_TYPES } from './api';

export type ProjectFormValue = Omit<Dto<'CreateProjectDto'>, 'clientId'> & { clientId: string };

/** Fields shared by /projects/new and the project settings page (M03 §4). */
export function ProjectFields({
  value,
  onChange,
  error,
  clientLocked,
  schemeLocked,
}: {
  value: ProjectFormValue;
  onChange: (v: ProjectFormValue) => void;
  error?: unknown;
  clientLocked?: boolean;
  schemeLocked?: boolean;
}) {
  const t = useTranslations();
  const te = useTranslations('enums');
  const fieldError = useFieldError(error);
  const set = (patch: Partial<ProjectFormValue>) => onChange({ ...value, ...patch });
  const clients = useQuery({
    queryKey: ['clients', 'picker'],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/clients', {
          params: { query: { isActive: true, pageSize: 100, sort: 'nameTh' } },
        }),
      ),
    enabled: !clientLocked,
  });
  const sites = useQuery({
    queryKey: ['client', value.clientId, 'sites', 'active'],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/clients/{id}/sites', {
          params: { path: { id: value.clientId }, query: { isActive: true } },
        }),
      ),
    enabled: !!value.clientId,
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {!clientLocked ? (
          <FormField label={t('projects.client')} error={fieldError('clientId')}>
            <NativeSelect
              required
              value={value.clientId}
              onChange={(e) => set({ clientId: e.target.value, siteId: null })}
              data-testid="project-client"
            >
              <option value="">–</option>
              {clients.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.nameTh}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ) : null}
        <FormField label={t('projects.site')} error={fieldError('siteId')}>
          <NativeSelect
            value={value.siteId ?? ''}
            disabled={!value.clientId}
            onChange={(e) => set({ siteId: e.target.value || null })}
            data-testid="project-site"
          >
            <option value="">–</option>
            {sites.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <div className="sm:col-span-2">
          <FormField label={t('projects.name')} error={fieldError('name')}>
            <Input
              required
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              data-testid="project-name"
            />
          </FormField>
        </div>
        <FormField label={t('projects.nameEn')}>
          <Input value={value.nameEn ?? ''} onChange={(e) => set({ nameEn: e.target.value })} />
        </FormField>
        <FormField label={t('projects.type')}>
          <NativeSelect
            value={value.type}
            onChange={(e) => set({ type: e.target.value as ProjectFormValue['type'] })}
            data-testid="project-type"
          >
            {PROJECT_TYPES.map((p) => (
              <option key={p} value={p}>
                {te(`ProjectType.${p}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('projects.contractNo')}>
          <Input
            value={value.contractNo ?? ''}
            onChange={(e) => set({ contractNo: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('projects.contractValue')}
          hint={t('projects.thb')}
          error={fieldError('contractValue')}
        >
          <Input
            inputMode="decimal"
            className="tabular-nums"
            value={value.contractValue ?? ''}
            onChange={(e) => set({ contractValue: e.target.value.replace(/[^\d.]/g, '') })}
          />
        </FormField>
        <FormField label={t('projects.plannedStart')}>
          <DateField
            value={value.plannedStartDate}
            onChange={(v) => set({ plannedStartDate: v })}
          />
        </FormField>
        <FormField label={t('projects.plannedEnd')} error={fieldError('plannedEndDate')}>
          <DateField value={value.plannedEndDate} onChange={(v) => set({ plannedEndDate: v })} />
        </FormField>
        <FormField
          label={t('projects.manager')}
          hint={t('projects.managerHint')}
          error={fieldError('projectManagerId')}
        >
          <UserPicker
            value={value.projectManagerId ?? null}
            onChange={(id) => set({ projectManagerId: id ?? undefined })}
            testId="project-pm"
          />
        </FormField>
        <FormField
          label={t('projects.revisionScheme')}
          hint={schemeLocked ? t('projects.schemeLocked') : t('projects.schemeHint')}
        >
          <NativeSelect
            value={value.revisionScheme ?? 'ALPHA_NUMERIC'}
            disabled={schemeLocked}
            onChange={(e) =>
              set({ revisionScheme: e.target.value as ProjectFormValue['revisionScheme'] })
            }
          >
            <option value="ALPHA_NUMERIC">{te('RevisionScheme.ALPHA_NUMERIC')}</option>
            <option value="ISO19650">{te('RevisionScheme.ISO19650')}</option>
          </NativeSelect>
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.requireSeparationOfDuties ?? true}
          onCheckedChange={(v) => set({ requireSeparationOfDuties: v === true })}
        />
        {t('projects.separationOfDuties')}
      </label>
      <FormField label={t('projects.description')}>
        <Textarea
          value={value.description ?? ''}
          onChange={(e) => set({ description: e.target.value })}
        />
      </FormField>
    </div>
  );
}
