'use client';

import { useQuery } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/hooks/use-format';
import { cn } from '@/lib/utils';

export interface SignatureInput {
  method: 'PASSWORD' | 'SIGNING_PIN';
  secret: string;
}

/**
 * SignatureDialog (docs/07-web-ui.md §3, docs/06-security.md §4): re-authenticate with the
 * password or the signing PIN; shows what is being signed and the licence on file.
 */
export function SignatureDialog({
  open,
  onOpenChange,
  title,
  lines,
  confirmLabel,
  pending,
  error,
  onSign,
  showLicense,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  /** what is being signed (document, revision, decision) */
  lines: string[];
  confirmLabel: string;
  pending?: boolean;
  error?: unknown;
  onSign: (s: SignatureInput) => void;
  showLicense?: boolean;
}) {
  const t = useTranslations('signature');
  const f = useFormat();
  const { me } = useAuth();
  const [method, setMethod] = useState<SignatureInput['method']>(
    me.hasSigningPin ? 'SIGNING_PIN' : 'PASSWORD',
  );
  const [secret, setSecret] = useState('');
  const licenses = useQuery({
    queryKey: ['licenses', me.id],
    enabled: open && !!showLicense,
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/users/{id}/licenses', { params: { path: { id: me.id } } })),
  });
  const license = licenses.data?.find((l) => l.isActive && !l.isExpired && l.verifiedAt);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setSecret('');
        onOpenChange(o);
      }}
    >
      <DialogContent title={title}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (secret) onSign({ method, secret });
          }}
        >
          <ProblemAlert error={error} />
          <ul className="space-y-1 rounded bg-subtle p-3 text-sm">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
            {showLicense ? (
              <li className="text-muted">
                {license
                  ? t('license', { no: license.licenseNo, date: f.date(license.expiresAt) })
                  : t('noLicense')}
              </li>
            ) : null}
          </ul>
          <div className="flex gap-2">
            {(['SIGNING_PIN', 'PASSWORD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={m === 'SIGNING_PIN' && !me.hasSigningPin}
                onClick={() => {
                  setMethod(m);
                  setSecret('');
                }}
                className={cn(
                  'flex-1 rounded border px-3 py-2 text-sm disabled:opacity-40',
                  method === m ? 'border-primary bg-subtle font-medium' : 'border-border',
                )}
              >
                {t(m)}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signature-secret">{t(method)}</Label>
            <Input
              id="signature-secret"
              type="password"
              autoFocus
              autoComplete={method === 'PASSWORD' ? 'current-password' : 'off'}
              inputMode={method === 'SIGNING_PIN' ? 'numeric' : undefined}
              maxLength={method === 'SIGNING_PIN' ? 6 : undefined}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              data-testid="signature-secret"
            />
            <p className="text-xs text-muted">{t('notice')}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending || !secret} data-testid="signature-confirm">
              <PenLine /> {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
