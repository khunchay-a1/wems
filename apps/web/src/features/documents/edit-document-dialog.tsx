'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConflictDialog, isConflict } from '@/components/conflict-dialog';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useProjectMembers } from '@/features/projects/api';
import { api, unwrap } from '@/lib/api';
import { useDraft } from '@/lib/hooks/use-draft';
import { useFieldError } from '@/lib/problem-fields';
import { CONFIDENTIALITY, type Doc, useRefreshDocument } from './api';
import { useDisciplines, useDocumentTypes } from './master';

type Form = {
  title: string;
  titleEn: string;
  disciplineId: string;
  documentTypeId: string;
  ownerId: string;
  confidentiality: Doc['confidentiality'];
  tags: string;
  sheetSize: string;
  scale: string;
  externalNumber: string;
  originator: string;
  remarks: string;
};

const toForm = (d: Doc): Form => ({
  title: d.title,
  titleEn: d.titleEn ?? '',
  disciplineId: d.discipline.id,
  documentTypeId: d.documentType.id,
  ownerId: d.owner?.id ?? '',
  confidentiality: d.confidentiality,
  tags: d.tags.join(', '),
  sheetSize: d.sheetSize ?? '',
  scale: d.scale ?? '',
  externalNumber: d.externalNumber ?? '',
  originator: d.originator ?? '',
  remarks: d.remarks ?? '',
});

/** Edit register fields; a discipline/type change before approval issues a new number (BR-DOC-011). */
export function EditDocumentDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: Doc;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations();
  const qc = useQueryClient();
  const refresh = useRefreshDocument();
  const disciplines = useDisciplines();
  const types = useDocumentTypes();
  const members = useProjectMembers(doc.projectId);
  const [draft, setForm] = useDraft(doc, toForm);
  const [reason, setReason] = useState('');
  const form = draft!;
  const numberChanges =
    form.disciplineId !== doc.discipline.id || form.documentTypeId !== doc.documentType.id;
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PATCH('/api/v1/documents/{id}', {
          params: { path: { id: doc.id } },
          body: {
            version: doc.version,
            title: form.title,
            titleEn: form.titleEn || null,
            disciplineId: form.disciplineId,
            documentTypeId: form.documentTypeId,
            ownerId: form.ownerId || null,
            confidentiality: form.confidentiality,
            tags: form.tags
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
            sheetSize: form.sheetSize || null,
            scale: form.scale || null,
            externalNumber: form.externalNumber || null,
            originator: form.originator || null,
            remarks: form.remarks || null,
            reason: reason || undefined,
          },
        }),
      ),
    onSuccess: (d) => {
      qc.setQueryData(['document', doc.id], d);
      refresh(doc.id);
      if (d.number !== doc.number) toast.info(t('documents.renumbered', { number: d.number }));
      else toast.success(t('common.saved'));
      onOpenChange(false);
    },
  });
  const fieldError = useFieldError(save.error);
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('documents.editDocument')} wide>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <ProblemAlert error={isConflict(save.error) ? null : save.error} />
          <FormField label={t('documents.docTitle')} error={fieldError('title')}>
            <Input
              required
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              data-testid="edit-title"
            />
          </FormField>
          <FormField label={t('documents.titleEn')}>
            <Input value={form.titleEn} onChange={(e) => set({ titleEn: e.target.value })} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('documents.discipline')}>
              <NativeSelect
                value={form.disciplineId}
                onChange={(e) => set({ disciplineId: e.target.value })}
              >
                {disciplines.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.nameTh}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('documents.type')}>
              <NativeSelect
                value={form.documentTypeId}
                onChange={(e) => set({ documentTypeId: e.target.value })}
              >
                {types.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.nameTh}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          {numberChanges ? (
            <div className="space-y-2 rounded bg-warning p-3 text-sm text-warning-fg">
              <p>{t('documents.numberWillChange')}</p>
              <Input
                placeholder={t('common.reason')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('documents.owner')}>
              <NativeSelect value={form.ownerId} onChange={(e) => set({ ownerId: e.target.value })}>
                <option value="">–</option>
                {members.data?.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('documents.confidentiality')}>
              <NativeSelect
                value={form.confidentiality}
                onChange={(e) => set({ confidentiality: e.target.value as Doc['confidentiality'] })}
              >
                {CONFIDENTIALITY.map((c) => (
                  <option key={c} value={c}>
                    {t(`enums.Confidentiality.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('documents.sheetSize')}>
              <Input value={form.sheetSize} onChange={(e) => set({ sheetSize: e.target.value })} />
            </FormField>
            <FormField label={t('documents.scale')}>
              <Input value={form.scale} onChange={(e) => set({ scale: e.target.value })} />
            </FormField>
            <FormField label={t('documents.externalNumber')}>
              <Input
                value={form.externalNumber}
                onChange={(e) => set({ externalNumber: e.target.value })}
              />
            </FormField>
            <FormField label={t('documents.originator')}>
              <Input
                value={form.originator}
                onChange={(e) => set({ originator: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label={t('documents.tags')} hint={t('documents.tagsHint')}>
            <Input value={form.tags} onChange={(e) => set({ tags: e.target.value })} />
          </FormField>
          <FormField label={t('documents.remarks')}>
            <Textarea value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending} data-testid="edit-save">
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
        <ConflictDialog
          error={save.error}
          yourInput={form}
          onReload={() => {
            refresh(doc.id);
            save.reset();
          }}
          onClose={() => save.reset()}
        />
      </DialogContent>
    </Dialog>
  );
}
