'use client';

import type { Dto } from '@wems/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Monitor, Plus, ShieldCheck, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChangePasswordForm } from '@/components/change-password-form';
import { FormField } from '@/components/form-field';
import { AddLicenseDialog } from '@/components/licenses';
import { PageHeader } from '@/components/page-header';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { EnumLabel } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, unwrap } from '@/lib/api';
import { useAuth, type Me } from '@/lib/auth';
import { useDraft } from '@/lib/hooks/use-draft';
import { useFormat } from '@/lib/hooks/use-format';

export default function ProfilePage() {
  const t = useTranslations('profile');
  const { me } = useAuth();
  return (
    <>
      <PageHeader title={t('title')} subtitle={me.email} />
      <div className="grid gap-4 xl:grid-cols-2">
        <PersonalCard me={me} />
        <Card>
          <CardHeader>
            <CardTitle>{t('changePassword')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
        <MfaCard me={me} />
        <PinCard me={me} />
        <SessionsCard />
        <LicensesCard me={me} />
        <div className="xl:col-span-2">
          <PreferencesCard />
        </div>
      </div>
    </>
  );
}

type ProfileForm = {
  displayNameTh: string;
  displayNameEn: string;
  phone: string;
  locale: string;
  calendar: Me['calendar'];
};

function PersonalCard({ me }: { me: Me }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [draft, setForm] = useDraft<Me, ProfileForm>(me, (m) => ({
    displayNameTh: m.displayNameTh,
    displayNameEn: m.displayNameEn ?? '',
    phone: m.phone ?? '',
    locale: m.locale,
    calendar: m.calendar,
  }));
  const form = draft!;
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PATCH('/api/v1/users/me', {
          body: {
            version: me.version,
            displayNameTh: form.displayNameTh,
            displayNameEn: form.displayNameEn || null,
            phone: form.phone || null,
            locale: form.locale as 'th' | 'en',
            calendar: form.calendar,
          },
        }),
      ),
    onSuccess: async () => {
      toast.success(t('common.saved'));
      if (form.locale !== me.locale) {
        document.cookie = `NEXT_LOCALE=${form.locale}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
        return;
      }
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.personal')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <ProblemAlert error={save.error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('profile.displayNameTh')}>
              <Input
                required
                value={form.displayNameTh}
                onChange={(e) => setForm({ ...form, displayNameTh: e.target.value })}
                data-testid="profile-name-th"
              />
            </FormField>
            <FormField label={t('profile.displayNameEn')}>
              <Input
                value={form.displayNameEn}
                onChange={(e) => setForm({ ...form, displayNameEn: e.target.value })}
              />
            </FormField>
            <FormField label={t('common.phone')}>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </FormField>
            <FormField label={t('common.language')}>
              <NativeSelect
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
              >
                <option value="th">{t('common.thai')}</option>
                <option value="en">{t('common.english')}</option>
              </NativeSelect>
            </FormField>
            <FormField label={t('profile.calendar')}>
              <NativeSelect
                value={form.calendar}
                onChange={(e) => setForm({ ...form, calendar: e.target.value as Me['calendar'] })}
              >
                <option value="BUDDHIST">{t('profile.buddhist')}</option>
                <option value="GREGORIAN">{t('profile.gregorian')}</option>
              </NativeSelect>
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending} data-testid="profile-save">
              {t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MfaCard({ me }: { me: Me }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (setup)
      void QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 180 }).then(
        (url) => !cancelled && setQr(url),
      );
    return () => {
      cancelled = true;
    };
  }, [setup]);

  const reset = () => {
    setPassword('');
    setCode('');
    setSetup(null);
    setQr(null);
  };
  const start = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/api/v1/auth/mfa/setup', { body: { password } })),
    onSuccess: (s) => {
      setSetup(s);
      setPassword('');
    },
  });
  const enable = useMutation({
    mutationFn: async () => unwrap(await api.POST('/api/v1/auth/mfa/enable', { body: { code } })),
    onSuccess: async () => {
      toast.success(t('profile.mfaEnabled'));
      reset();
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const disable = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/api/v1/auth/mfa/disable', { body: { password, code } })),
    onSuccess: async () => {
      toast.success(t('common.saved'));
      reset();
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const error = start.error ?? enable.error ?? disable.error;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.mfa')}</CardTitle>
        <Badge tone={me.mfaEnabled ? 'success' : me.mfaSetupRequired ? 'warning' : 'muted'}>
          {me.mfaEnabled ? (
            <>
              <ShieldCheck className="mr-1 size-3" />
              {t('profile.mfaOn')}
            </>
          ) : (
            t('profile.mfaOff')
          )}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProblemAlert error={error} />
        {me.mfaEnabled ? (
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              disable.mutate();
            }}
          >
            <FormField label={t('auth.password')}>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <FormField label={t('auth.mfaCode')}>
              <Input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </FormField>
            <Button type="submit" variant="outline" disabled={disable.isPending}>
              {t('profile.mfaDisable')}
            </Button>
          </form>
        ) : setup ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              enable.mutate();
            }}
          >
            <p className="text-sm text-muted">{t('profile.mfaScan')}</p>
            <div className="flex flex-wrap items-center gap-4">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL generated client-side
                <img
                  src={qr}
                  alt=""
                  width={180}
                  height={180}
                  className="rounded border border-border"
                />
              ) : null}
              <div className="min-w-0 text-sm">
                <p className="text-muted">{t('profile.mfaKey')}</p>
                <code className="font-mono break-all" data-testid="mfa-secret">
                  {setup.secret}
                </code>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <FormField label={t('auth.mfaCode')}>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  data-testid="mfa-enable-code"
                />
              </FormField>
              <Button type="submit" disabled={enable.isPending}>
                {t('profile.mfaEnable')}
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start.mutate();
            }}
          >
            <div className="flex-1">
              <FormField label={t('auth.password')}>
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="mfa-password"
                />
              </FormField>
            </div>
            <Button type="submit" disabled={start.isPending} data-testid="mfa-start">
              {t('profile.mfaStart')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function PinCard({ me }: { me: Me }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const save = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST('/api/v1/auth/signing-pin', { body: { password, pin } })),
    onSuccess: async () => {
      toast.success(t('profile.pinSet'));
      setPassword('');
      setPin('');
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.signingPin')}</CardTitle>
        {me.hasSigningPin ? (
          <Badge tone="success">
            <CheckCircle2 className="mr-1 size-3" />
            {t('profile.pinSet')}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted">{t('profile.signingPinHelp')}</p>
        <ProblemAlert error={save.error} />
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <FormField label={t('auth.password')}>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <FormField label={t('profile.pin')}>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </FormField>
          <Button type="submit" disabled={save.isPending}>
            {t('profile.setPin')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const t = useTranslations();
  const f = useFormat();
  const qc = useQueryClient();
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => unwrap(await api.GET('/api/v1/auth/sessions')),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE('/api/v1/auth/sessions/{id}', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.sessions')}</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-border">
        {sessions.data?.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            {s.platform === 'WEB' ? (
              <Monitor className="size-4 text-muted" />
            ) : (
              <Smartphone className="size-4 text-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.deviceName ?? s.userAgent ?? s.platform}</p>
              <p className="text-xs text-muted">
                {t('profile.lastUsed')}: {f.dateTime(s.lastUsedAt)} {s.ip ? `· ${s.ip}` : ''}
              </p>
            </div>
            {s.current ? (
              <Badge tone="info">{t('profile.thisDevice')}</Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => revoke.mutate(s.id)}
                disabled={revoke.isPending}
              >
                {t('profile.revoke')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LicensesCard({ me }: { me: Me }) {
  const t = useTranslations();
  const f = useFormat();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const licenses = useQuery({
    queryKey: ['licenses', me.id],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/users/{id}/licenses', { params: { path: { id: me.id } } })),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.licenses')}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus /> {t('admin.addLicense')}
        </Button>
      </CardHeader>
      {licenses.data?.length ? (
        <Table>
          <THead>
            <TR>
              <TH>{t('admin.licenseNo')}</TH>
              <TH>{t('admin.branch')}</TH>
              <TH>{t('admin.expiresAt')}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {licenses.data.map((l) => (
              <TR key={l.id}>
                <TD>
                  <div className="font-medium">{l.licenseNo}</div>
                  <div className="text-xs text-muted">
                    <EnumLabel enumName="LicenseLevel" value={l.level} />
                  </div>
                </TD>
                <TD>
                  <EnumLabel enumName="LicenseBranch" value={l.branch} />
                </TD>
                <TD>
                  {f.date(l.expiresAt)}{' '}
                  {l.isExpired ? <Badge tone="danger">{t('admin.expired')}</Badge> : null}
                </TD>
                <TD className="text-right">
                  <Badge tone={l.verifiedAt ? 'success' : 'warning'}>
                    {l.verifiedAt ? t('admin.verified') : t('admin.notVerified')}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <CardContent>
          <p className="text-sm text-muted">{t('common.noData')}</p>
        </CardContent>
      )}
      <AddLicenseDialog
        open={adding}
        onOpenChange={setAdding}
        userId={me.id}
        onAdded={() => void qc.invalidateQueries({ queryKey: ['licenses', me.id] })}
      />
    </Card>
  );
}

type Pref = Dto<'NotificationPreferenceDto'>;
type Channel = Pref['channels'][number];
const CHANNELS: Channel[] = ['IN_APP', 'EMAIL', 'PUSH'];

function PreferencesCard() {
  const t = useTranslations();
  const tn = useTranslations('notificationTypes');
  const qc = useQueryClient();
  const prefs = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => unwrap(await api.GET('/api/v1/notification-preferences')),
  });
  const [draft, setDraft] = useDraft(prefs.data, (p) => p);
  const save = useMutation({
    mutationFn: async (list: Pref[]) =>
      unwrap(
        await api.PUT('/api/v1/notification-preferences', {
          body: { preferences: list.map((p) => ({ type: p.type, channels: p.channels })) },
        }),
      ),
    onSuccess: (data) => {
      qc.setQueryData(['notification-preferences'], data);
      toast.success(t('common.saved'));
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const toggle = (type: string, ch: Channel, on: boolean) =>
    setDraft(
      (draft ?? []).map((p) =>
        p.type === type
          ? { ...p, channels: on ? [...p.channels, ch] : p.channels.filter((c) => c !== ch) }
          : p,
      ),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.notifications')}</CardTitle>
        <Button size="sm" onClick={() => draft && save.mutate(draft)} disabled={save.isPending}>
          {t('common.save')}
        </Button>
      </CardHeader>
      <Table>
        <THead>
          <TR>
            <TH>{t('profile.eventType')}</TH>
            {CHANNELS.map((c) => (
              <TH key={c} className="w-28 text-center">
                {t(`notifications.${c}`)}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {draft?.map((p) => (
            <TR key={p.type}>
              <TD>{tn.has(p.type) ? tn(p.type) : p.type}</TD>
              {CHANNELS.map((c) => {
                const locked = c === 'IN_APP' && p.mandatoryInApp;
                return (
                  <TD key={c} className="text-center">
                    <Checkbox
                      checked={locked || p.channels.includes(c)}
                      disabled={locked}
                      onCheckedChange={(v) => toggle(p.type, c, v === true)}
                      aria-label={`${p.type} ${c}`}
                    />
                  </TD>
                );
              })}
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
