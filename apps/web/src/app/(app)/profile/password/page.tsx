'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChangePasswordForm } from '@/components/change-password-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';

/** Forced password change after an admin-issued temporary password (docs/06-security.md §2). */
export default function ForcedPasswordPage() {
  const t = useTranslations();
  const { me } = useAuth();
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md pt-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {me.mustChangePassword ? t('auth.mustChangeTitle') : t('profile.changePassword')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {me.mustChangePassword ? (
            <p className="text-sm text-muted">{t('auth.mustChangeHelp')}</p>
          ) : null}
          <ChangePasswordForm onDone={() => router.replace('/')} />
        </CardContent>
      </Card>
    </div>
  );
}
