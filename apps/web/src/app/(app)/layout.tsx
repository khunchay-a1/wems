'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Sidebar } from '@/components/app/sidebar';
import { Topbar } from '@/components/app/topbar';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, onUnauthenticated } from '@/lib/api';
import { AuthProvider, useMeQuery } from '@/lib/auth';

/** Signed-in shell: loads /auth/me, enforces the forced password change and the MFA banner. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('auth');
  const me = useMeQuery();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) onUnauthenticated();
  }, [me.error]);
  useEffect(() => {
    if (me.data?.mustChangePassword && pathname !== '/profile/password')
      router.replace('/profile/password');
  }, [me.data, pathname, router]);

  if (!me.data) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }
  return (
    <AuthProvider me={me.data}>
      <div className="flex min-h-screen flex-col">
        <Topbar />
        {me.data.mfaSetupRequired ? (
          <div className="bg-warning px-4 py-2 text-sm text-warning-fg" data-testid="mfa-banner">
            {t('mfaSetupRequired')}
          </div>
        ) : null}
        <div className="flex flex-1">
          <Sidebar />
          <main className="min-w-0 flex-1 p-6">{children}</main>
        </div>
      </div>
    </AuthProvider>
  );
}
