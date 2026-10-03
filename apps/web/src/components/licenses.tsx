'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';

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

export function AddLicenseDialog({
  open,
  onOpenChange,
  userId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  onAdded: () => void;
}) {
  const t = useTranslations();
  const te = useTranslations('enums');
  const [licenseNo, setNo] = useState('');
  const [branch, setBranch] = useState<(typeof BRANCHES)[number]>('CIVIL');
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('PROFESSIONAL');
  const [expiresAt, setExpires] = useState('');
  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/users/{id}/licenses', {
          params: { path: { id: userId } },
          body: { type: 'ENGINEER', licenseNo, branch, level, expiresAt },
        }),
      ),
    onSuccess: () => {
      onOpenChange(false);
      setNo('');
      setExpires('');
      onAdded();
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('admin.addLicense')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <ProblemAlert error={add.error} />
          <FormField label={t('admin.licenseNo')}>
            <Input required value={licenseNo} onChange={(e) => setNo(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('admin.branch')}>
              <NativeSelect
                value={branch}
                onChange={(e) => setBranch(e.target.value as typeof branch)}
              >
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {te(`LicenseBranch.${b}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('admin.level')}>
              <NativeSelect
                value={level}
                onChange={(e) => setLevel(e.target.value as typeof level)}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {te(`LicenseLevel.${l}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label={t('admin.expiresAt')}>
            <Input
              type="date"
              required
              value={expiresAt}
              onChange={(e) => setExpires(e.target.value)}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
