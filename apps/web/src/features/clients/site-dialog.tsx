'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { ThaiAddressFields } from '@/components/thai-address-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';
import { useFieldError } from '@/lib/problem-fields';

const LocationPicker = dynamic(
  () => import('@/components/location-picker').then((m) => m.LocationPicker),
  { ssr: false },
);

type Site = Dto<'SiteDto'>;
type Form = Omit<Dto<'CreateSiteDto'>, 'latitude' | 'longitude'> & {
  latitude: number | null;
  longitude: number | null;
};

const SITE_TYPES = [
  'FACTORY',
  'BUILDING',
  'INDUSTRIAL_ESTATE',
  'MUNICIPAL',
  'WATER_TREATMENT_PLANT',
  'WASTEWATER_TREATMENT_PLANT',
  'NATURAL_WATER_BODY',
  'OTHER',
] as const;
const BUILDING_CLASSES = ['A', 'B', 'C', 'D', 'E'] as const;

export function SiteDialog({
  clientId,
  site,
  onClose,
  onSaved,
}: {
  clientId: string;
  site: Site | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = site !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        <SiteForm
          key={site === 'new' ? 'new' : site.id}
          clientId={clientId}
          site={site}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function toForm(s: Site | 'new'): Form {
  if (s === 'new')
    return { code: '', name: '', siteType: 'FACTORY', latitude: null, longitude: null };
  return {
    code: s.code,
    name: s.name,
    siteType: s.siteType,
    addressLine: s.addressLine,
    subdistrict: s.subdistrict,
    district: s.district,
    province: s.province,
    postcode: s.postcode,
    latitude: s.latitude ? Number(s.latitude) : null,
    longitude: s.longitude ? Number(s.longitude) : null,
    buildingClass: s.buildingClass,
    factoryRegistrationNo: s.factoryRegistrationNo,
    factoryTypeCode: s.factoryTypeCode,
    notes: s.notes,
  };
}

function SiteForm({
  clientId,
  site,
  onClose,
  onSaved,
}: {
  clientId: string;
  site: Site | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const te = useTranslations('enums');
  const [form, setForm] = useState<Form>(toForm(site));
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const save = useMutation({
    mutationFn: async () => {
      // BR-CRM-005: type-specific fields are only sent for their type; the API also enforces it
      const body = {
        ...form,
        buildingClass: form.siteType === 'BUILDING' ? (form.buildingClass ?? null) : null,
        factoryRegistrationNo: form.siteType === 'FACTORY' ? form.factoryRegistrationNo : null,
        factoryTypeCode: form.siteType === 'FACTORY' ? form.factoryTypeCode : null,
      };
      if (site === 'new')
        return unwrap(
          await api.POST('/api/v1/clients/{id}/sites', {
            params: { path: { id: clientId } },
            body,
          }),
        );
      const { code: _code, ...rest } = body;
      return unwrap(
        await api.PATCH('/api/v1/clients/{id}/sites/{siteId}', {
          params: { path: { id: clientId, siteId: site.id } },
          body: { ...rest, version: site.version },
        }),
      );
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const fieldError = useFieldError(save.error);
  return (
    <DialogContent title={site === 'new' ? t('clients.addSite') : t('common.edit')} wide>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <ProblemAlert error={save.error} />
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t('common.code')} error={fieldError('code')}>
            <Input
              required
              disabled={site !== 'new'}
              value={form.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              maxLength={20}
              data-testid="site-code"
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label={t('common.name')} error={fieldError('name')}>
              <Input
                required
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                data-testid="site-name"
              />
            </FormField>
          </div>
          <FormField label={t('clients.siteType')}>
            <NativeSelect
              value={form.siteType}
              onChange={(e) => set({ siteType: e.target.value as Form['siteType'] })}
              data-testid="site-type"
            >
              {SITE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {te(`SiteType.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {form.siteType === 'BUILDING' ? (
            <FormField
              label={t('clients.buildingClass')}
              hint={t('clients.buildingClassHint')}
              error={fieldError('buildingClass')}
            >
              <NativeSelect
                value={form.buildingClass ?? ''}
                onChange={(e) =>
                  set({ buildingClass: (e.target.value || null) as Form['buildingClass'] })
                }
                data-testid="site-building-class"
              >
                <option value="">–</option>
                {BUILDING_CLASSES.map((b) => (
                  <option key={b} value={b}>
                    {te(`BuildingClass.${b}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : null}
          {form.siteType === 'FACTORY' ? (
            <>
              <FormField
                label={t('clients.factoryRegistrationNo')}
                error={fieldError('factoryRegistrationNo')}
              >
                <Input
                  value={form.factoryRegistrationNo ?? ''}
                  onChange={(e) => set({ factoryRegistrationNo: e.target.value })}
                />
              </FormField>
              <FormField label={t('clients.factoryTypeCode')}>
                <Input
                  value={form.factoryTypeCode ?? ''}
                  onChange={(e) => set({ factoryTypeCode: e.target.value })}
                />
              </FormField>
            </>
          ) : null}
        </div>
        <ThaiAddressFields value={form} onChange={(a) => setForm({ ...form, ...a })} />
        <div>
          <p className="mb-1.5 text-sm font-medium">
            {t('clients.location')}{' '}
            <span className="text-xs font-normal text-muted">
              {form.latitude !== null && form.longitude !== null
                ? `${form.latitude.toFixed(6)}, ${form.longitude.toFixed(6)}`
                : t('clients.locationHint')}
            </span>
          </p>
          <LocationPicker
            value={
              form.latitude !== null && form.longitude !== null
                ? { lat: form.latitude, lng: form.longitude }
                : null
            }
            onChange={(p) => setForm((f) => ({ ...f, latitude: p.lat, longitude: p.lng }))}
          />
        </div>
        <FormField label={t('clients.notes')}>
          <Textarea value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending} data-testid="site-submit">
            {t('common.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
