'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';

/** Change own password (the password policy is enforced by the API — docs/06-security.md §2). */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const t = useTranslations('profile');
  const qc = useQueryClient();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  const change = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/auth/change-password', { body: { currentPassword, newPassword } }),
      ),
    onSuccess: async () => {
      toast.success(t('passwordChanged'));
      setCurrent('');
      setNew('');
      setConfirm('');
      await qc.invalidateQueries({ queryKey: ['me'] });
      onDone?.();
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mismatch) change.mutate();
      }}
    >
      <ProblemAlert error={change.error} />
      <FormField label={t('currentPassword')} htmlFor="currentPassword">
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          data-testid="current-password"
        />
      </FormField>
      <FormField label={t('newPassword')} htmlFor="newPassword" hint={t('passwordHint')}>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          data-testid="new-password"
        />
      </FormField>
      <FormField
        label={t('confirmPassword')}
        htmlFor="confirmPassword"
        error={mismatch ? t('passwordMismatch') : undefined}
      >
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          data-testid="confirm-password"
        />
      </FormField>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={change.isPending || mismatch}
          data-testid="change-password-submit"
        >
          {t('changePassword')}
        </Button>
      </div>
    </form>
  );
}
