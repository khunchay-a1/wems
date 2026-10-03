'use client';

import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter } from './ui/dialog';

/** 409 CONFLICT_STALE_VERSION: keep the user's input visible and offer to reload (docs/07-web-ui.md §3). */
export function ConflictDialog({
  error,
  yourInput,
  onReload,
  onClose,
}: {
  error: unknown;
  yourInput?: unknown;
  onReload: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('common');
  const open = error instanceof ApiError && error.problem.code === 'CONFLICT_STALE_VERSION';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('conflictTitle')} description={t('conflictBody')}>
        {yourInput !== undefined ? (
          <div>
            <p className="mb-1 text-xs font-semibold text-muted">{t('yourInput')}</p>
            <pre className="max-h-60 overflow-auto rounded bg-subtle p-2 text-xs">
              {JSON.stringify(yourInput, null, 2)}
            </pre>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('close')}
          </Button>
          <Button
            onClick={() => {
              onReload();
              onClose();
            }}
          >
            {t('reloadLatest')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.problem.code === 'CONFLICT_STALE_VERSION';
}
