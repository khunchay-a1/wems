'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter } from './ui/dialog';
import { FieldError, Label, Textarea } from './ui/input';

/** Confirmation with a mandatory reason (void, cancel, reject, reassign — docs/07-web-ui.md §3). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  pending,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations('common');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const invalid = reason.trim().length < 3;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason('');
          setTouched(false);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent title={title} description={description}>
        {children}
        <div className="space-y-1.5">
          <Label htmlFor="reason">{t('reason')}</Label>
          <Textarea
            id="reason"
            data-testid="reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && invalid}
          />
          <FieldError message={touched && invalid ? t('reasonRequired') : undefined} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'default'}
            disabled={pending}
            data-testid="reason-confirm"
            onClick={() => {
              setTouched(true);
              if (!invalid) onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
