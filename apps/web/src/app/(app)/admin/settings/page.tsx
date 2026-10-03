'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { toastError } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';
import { useDraft } from '@/lib/hooks/use-draft';
import { useFormat } from '@/lib/hooks/use-format';

type JsonValue = { [key: string]: unknown } | unknown[] | string | number | boolean;

type Company = {
  nameTh: string;
  nameEn: string;
  addressTh: string;
  addressEn: string;
  taxId: string;
  branchCode: string;
  phone: string;
  email: string;
  website: string;
  logoFileId: string | null;
};

function useSetting<T extends JsonValue>(key: string) {
  const qc = useQueryClient();
  const t = useTranslations('common');
  const q = useQuery({
    queryKey: ['setting', key],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/settings/{key}', { params: { path: { key } } })).value as T,
  });
  const m = useMutation({
    mutationFn: async (value: T) =>
      unwrap(
        await api.PUT('/api/v1/settings/{key}', { params: { path: { key } }, body: { value } }),
      ),
    onSuccess: () => {
      toast.success(t('saved'));
      void qc.invalidateQueries({ queryKey: ['setting', key] });
    },
    onError: (e) => toastError(e, t('unexpected')),
  });
  return [q.data, m.mutate, m.isPending] as const;
}

export default function SettingsPage() {
  const t = useTranslations('admin');
  return (
    <>
      <PageHeader title={t('settingsTitle')} />
      <div className="grid gap-4 xl:grid-cols-2">
        <CompanyCard />
        <HolidaysCard />
        <NumberSettingCard
          settingKey="security.sessionIdleMinutes"
          title={t('securitySettings')}
          label={t('sessionIdle')}
        />
        <NumberSettingCard
          settingKey="review.defaultDueDays"
          title={t('review')}
          label={t('defaultDueDays')}
        />
        <NumberSettingCard
          settingKey="transmittal.maxAttachmentMb"
          title={t('transmittal')}
          label={t('maxAttachmentMb')}
        />
        <NumberSettingCard
          settingKey="transmittal.linkExpiryDays"
          title={t('transmittal')}
          label={t('linkExpiryDays')}
        />
        <MobileCard />
      </div>
    </>
  );
}

function CompanyCard() {
  const t = useTranslations();
  const [value, save, pending] = useSetting<Company>('company.profile');
  const [form, setForm] = useDraft(value, (v) => v);
  if (!form) return null;
  const field = (k: keyof Company, label: string, area = false) => (
    <FormField label={label}>
      {area ? (
        <Textarea
          value={(form[k] as string) ?? ''}
          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        />
      ) : (
        <Input
          value={(form[k] as string) ?? ''}
          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        />
      )}
    </FormField>
  );
  return (
    <Card className="xl:row-span-2">
      <CardHeader>
        <CardTitle>{t('admin.company')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {field('nameTh', t('admin.nameTh'))}
        {field('nameEn', t('admin.nameEn'))}
        {field('addressTh', t('admin.addressTh'), true)}
        {field('addressEn', t('admin.addressEn'), true)}
        <div className="grid grid-cols-2 gap-3">
          {field('taxId', t('admin.taxId'))}
          {field('phone', t('common.phone'))}
          {field('email', t('common.email'))}
          {field('website', t('admin.website'))}
        </div>
        <div className="flex justify-end">
          <Button disabled={pending} onClick={() => save(form)}>
            {t('common.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HolidaysCard() {
  const t = useTranslations();
  const f = useFormat();
  const [value, save, pending] = useSetting<string[]>('calendar.holidays');
  const [day, setDay] = useState('');
  const list = [...(value ?? [])].sort();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.holidays')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted">{t('admin.holidaysHelp')}</p>
        <div className="flex gap-2">
          <Input
            type="date"
            className="w-48"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={!day || pending}
            onClick={() => {
              save([...new Set([...list, day])]);
              setDay('');
            }}
          >
            <Plus /> {t('admin.addHoliday')}
          </Button>
        </div>
        <ul className="flex flex-wrap gap-2">
          {list.map((d) => (
            <li
              key={d}
              className="flex items-center gap-1 rounded-full bg-subtle px-3 py-1 text-sm"
            >
              {f.date(d, 'long')}
              <button
                type="button"
                aria-label={t('common.delete')}
                onClick={() => save(list.filter((x) => x !== d))}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function NumberSettingCard({
  settingKey,
  title,
  label,
}: {
  settingKey: string;
  title: string;
  label: string;
}) {
  const t = useTranslations('common');
  const [value, save, pending] = useSetting<number>(settingKey);
  const [draft, setV] = useDraft(value, (x) => String(x));
  const v = draft ?? '';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-end gap-2">
        <FormField label={label}>
          <Input type="number" className="w-32" value={v} onChange={(e) => setV(e.target.value)} />
        </FormField>
        <Button disabled={pending || v === String(value)} onClick={() => save(Number(v))}>
          {t('save')}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Forced update and maintenance notice for the mobile app (/app/config, 09-nfr §3). */
function MobileCard() {
  const t = useTranslations();
  const [versions, saveVersions, savingVersions] = useSetting<{ android: string; ios: string }>(
    'mobile.minSupportedVersion',
  );
  const [message, saveMessage, savingMessage] = useSetting<string>('mobile.maintenanceMessage');
  const [v, setV] = useDraft(versions, (x) => x);
  const [msg, setMsg] = useDraft(message, (x) => x);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.mobileApp')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {v ? (
          <div className="flex flex-wrap items-end gap-2">
            <FormField label={t('admin.minVersionAndroid')}>
              <Input
                className="w-28"
                value={v.android}
                onChange={(e) => setV({ ...v, android: e.target.value })}
              />
            </FormField>
            <FormField label={t('admin.minVersionIos')}>
              <Input
                className="w-28"
                value={v.ios}
                onChange={(e) => setV({ ...v, ios: e.target.value })}
              />
            </FormField>
            <Button disabled={savingVersions} onClick={() => saveVersions(v)}>
              {t('common.save')}
            </Button>
          </div>
        ) : null}
        <FormField label={t('admin.maintenanceMessage')}>
          <Textarea
            value={msg ?? ''}
            maxLength={500}
            onChange={(e) => setMsg(e.target.value)}
            data-testid="maintenance-message"
          />
        </FormField>
        <p className="text-sm text-muted">{t('admin.maintenanceHelp')}</p>
        <div className="flex justify-end">
          <Button disabled={savingMessage} onClick={() => saveMessage(msg ?? '')}>
            {t('common.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
