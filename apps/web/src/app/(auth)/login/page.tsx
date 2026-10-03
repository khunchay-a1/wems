'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';

const credentials = z.object({ email: z.string().email(), password: z.string().min(1) });

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof credentials>>({ resolver: zodResolver(credentials) });

  const done = () => {
    router.replace(safeNext(params.get('next')));
    router.refresh();
  };

  const onLogin = form.handleSubmit(async (values) => {
    setBusy(true);
    setError(null);
    try {
      const res = unwrap(
        await api.POST('/api/v1/auth/login', { body: { ...values, platform: 'WEB' } }),
      );
      if (res.mfaRequired && res.mfaToken) setMfaToken(res.mfaToken);
      else done();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  });

  const onMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setBusy(true);
    setError(null);
    try {
      unwrap(await api.POST('/api/v1/auth/mfa/verify', { body: { mfaToken, code } }));
      done();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="space-y-5 p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-md bg-primary text-lg font-bold text-white">
            W
          </div>
          <h1 className="text-xl font-semibold">{mfaToken ? t('mfaTitle') : t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{mfaToken ? t('mfaHelp') : t('subtitle')}</p>
        </div>
        <ProblemAlert error={error} />
        {mfaToken ? (
          <form onSubmit={onMfa} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">{t('mfaCode')}</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
                data-testid="mfa-code"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
              {t('verify')}
            </Button>
          </form>
        ) : (
          <form onSubmit={onLogin} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                {...form.register('email')}
                data-testid="login-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
                data-testid="login-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy} data-testid="login-submit">
              {busy ? t('signingIn') : t('signIn')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
