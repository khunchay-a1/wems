'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';

export function TemporaryPasswordDialog({
  password,
  onClose,
}: {
  password: string | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  return (
    <Dialog open={!!password} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('admin.tempPasswordTitle')} description={t('admin.tempPasswordHelp')}>
        <div
          className="flex items-center gap-2 rounded-md bg-subtle p-3 font-mono text-lg"
          data-testid="temp-password"
        >
          {password}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={() => {
              void navigator.clipboard.writeText(password ?? '');
              toast.success(t('common.copied'));
            }}
            aria-label={t('common.copy')}
          >
            <Copy />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose} data-testid="temp-password-close">
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
