'use client';

import type { Dto } from '@wems/api-contract';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/form-field';
import { ThaiAddressFields } from '@/components/thai-address-fields';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useFieldError } from '@/lib/problem-fields';

export type ClientFormValue = Omit<Dto<'CreateClientDto'>, 'nameTh'> & { nameTh: string };

export const CLIENT_TYPES = [
  'COMPANY',
  'GOVERNMENT',
  'STATE_ENTERPRISE',
  'LOCAL_AUTHORITY',
  'INDIVIDUAL',
  'OTHER',
] as const;

/** Client fields shared by the create dialog and the detail page (M02 §4). */
export function ClientFields({
  value,
  onChange,
  error,
  showCode,
}: {
  value: ClientFormValue;
  onChange: (v: ClientFormValue) => void;
  error?: unknown;
  showCode?: boolean;
}) {
  const t = useTranslations();
  const te = useTranslations('enums');
  const fieldError = useFieldError(error);
  const set = (patch: Partial<ClientFormValue>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('clients.nameTh')} error={fieldError('nameTh')}>
          <Input
            required
            value={value.nameTh}
            onChange={(e) => set({ nameTh: e.target.value })}
            data-testid="client-name-th"
          />
        </FormField>
        <FormField label={t('clients.nameEn')} error={fieldError('nameEn')}>
          <Input
            value={value.nameEn ?? ''}
            onChange={(e) => set({ nameEn: e.target.value })}
            data-testid="client-name-en"
          />
        </FormField>
        {showCode ? (
          <FormField
            label={t('common.code')}
            hint={t('clients.codeHint')}
            error={fieldError('code')}
          >
            <Input
              value={value.code ?? ''}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              maxLength={12}
              data-testid="client-code"
            />
          </FormField>
        ) : null}
        <FormField label={t('clients.clientType')}>
          <NativeSelect
            value={value.clientType ?? 'COMPANY'}
            onChange={(e) => set({ clientType: e.target.value as ClientFormValue['clientType'] })}
          >
            {CLIENT_TYPES.map((c) => (
              <option key={c} value={c}>
                {te(`ClientType.${c}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('clients.taxId')} error={fieldError('taxId')}>
          <Input
            inputMode="numeric"
            maxLength={13}
            value={value.taxId ?? ''}
            onChange={(e) => set({ taxId: e.target.value.replace(/\D/g, '') })}
            data-testid="client-tax-id"
          />
        </FormField>
        <FormField
          label={t('clients.branchCode')}
          hint={t('clients.branchHint')}
          error={fieldError('branchCode')}
        >
          <Input
            inputMode="numeric"
            maxLength={5}
            value={value.branchCode ?? ''}
            onChange={(e) => set({ branchCode: e.target.value.replace(/\D/g, '') })}
          />
        </FormField>
        <FormField label={t('clients.industry')}>
          <Input value={value.industry ?? ''} onChange={(e) => set({ industry: e.target.value })} />
        </FormField>
        <FormField label={t('common.phone')}>
          <Input value={value.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />
        </FormField>
        <FormField label={t('common.email')} error={fieldError('email')}>
          <Input
            type="email"
            value={value.email ?? ''}
            onChange={(e) => set({ email: e.target.value })}
          />
        </FormField>
        <FormField label={t('admin.website')}>
          <Input value={value.website ?? ''} onChange={(e) => set({ website: e.target.value })} />
        </FormField>
      </div>
      <ThaiAddressFields value={value} onChange={(a) => onChange({ ...value, ...a })} />
      <FormField label={t('clients.notes')}>
        <Textarea value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
      </FormField>
    </div>
  );
}
