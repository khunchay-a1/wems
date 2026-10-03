'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { api, unwrap } from '@/lib/api';
import { type Doc, useRefreshDocument } from './api';

/** Mark a document as replaced by another document of the same project. */
export function SupersedeDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: Doc;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations();
  const refresh = useRefreshDocument();
  const [q, setQ] = useState('');
  const [byDocumentId, setBy] = useState('');
  const [reason, setReason] = useState('');
  const candidates = useQuery({
    queryKey: ['documents', doc.projectId, 'supersede', q],
    enabled: open,
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/projects/{projectId}/documents', {
          params: {
            path: { projectId: doc.projectId },
            query: { q: q || undefined, pageSize: 20 },
          },
        }),
      ),
  });
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/documents/{id}/supersede', {
          params: { path: { id: doc.id } },
          body: { version: doc.version, byDocumentId, reason: reason || undefined },
        }),
      ),
    onSuccess: () => {
      refresh(doc.id);
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('documents.action.supersede')}>
        <div className="space-y-3">
          <ProblemAlert error={save.error} />
          <Input
            placeholder={t('common.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <FormField label={t('documents.supersededBy')}>
            <NativeSelect value={byDocumentId} onChange={(e) => setBy(e.target.value)}>
              <option value="">–</option>
              {candidates.data?.data
                .filter((d) => d.id !== doc.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.number} · {d.title}
                  </option>
                ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('common.reason')}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={!byDocumentId || save.isPending}
            onClick={() => save.mutate()}
          >
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
