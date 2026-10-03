'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { type Doc, PURPOSES, type PurposeCode, type Revision, useRefreshDocument } from './api';

/** New revision; the label comes from the project's scheme (BR-DOC-020..024). */
export function NewRevisionDialog({
  doc,
  open,
  onOpenChange,
  onCreated,
}: {
  doc: Doc;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (r: Revision) => void;
}) {
  const t = useTranslations();
  const { can } = useAuth();
  const refresh = useRefreshDocument();
  const [purposeCode, setPurpose] = useState<PurposeCode>(doc.currentRevision ? 'FA' : 'FR');
  const [description, setDescription] = useState('');
  const [override, setOverride] = useState('');
  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/documents/{id}/revisions', {
          params: { path: { id: doc.id } },
          body: {
            purposeCode,
            description: description || undefined,
            revLabelOverride: override || undefined,
          },
        }),
      ),
    onSuccess: (r) => {
      refresh(doc.id, r.id);
      setDescription('');
      setOverride('');
      onOpenChange(false);
      onCreated(r);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('documents.newRevision')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <ProblemAlert error={create.error} />
          <FormField label={t('documents.purpose')}>
            <NativeSelect
              value={purposeCode}
              onChange={(e) => setPurpose(e.target.value as PurposeCode)}
              data-testid="revision-purpose"
            >
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p} · {t(`enums.PurposeCode.${p}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            label={t('documents.revisionDescription')}
            hint={doc.revisions.length ? t('documents.descriptionRequiredHint') : undefined}
          >
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          {can('document.admin') ? (
            <FormField label={t('documents.labelOverride')} hint={t('documents.labelOverrideHint')}>
              <Input
                className="w-32"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
              />
            </FormField>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending} data-testid="revision-create">
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
