'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { DateField } from '@/components/date-field';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { useProjectMembers } from '@/features/projects/api';
import { api, unwrap } from '@/lib/api';
import { useFieldError } from '@/lib/problem-fields';
import {
  CONFIDENTIALITY,
  type Doc,
  PLAN_PURPOSES,
  PURPOSES,
  type PurposeCode,
  useRefreshDocument,
} from './api';
import { useDisciplines, useDocumentTypes } from './master';

type Confidentiality = (typeof CONFIDENTIALITY)[number];

/** Register a document (docs/07-web-ui.md §6.2) — number previewed from the numbering scheme. */
export function CreateDocumentDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (d: Doc) => void;
}) {
  const t = useTranslations();
  const refresh = useRefreshDocument();
  const disciplines = useDisciplines();
  const types = useDocumentTypes();
  const members = useProjectMembers(projectId);
  const [disciplineId, setDiscipline] = useState('');
  const [documentTypeId, setType] = useState('');
  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [ownerId, setOwner] = useState('');
  const [confidentiality, setConf] = useState<Confidentiality>('CLIENT_SHAREABLE');
  const [tags, setTags] = useState('');
  const [plans, setPlans] = useState<Partial<Record<PurposeCode, string | null>>>({});
  const [withRev, setWithRev] = useState(false);
  const [purpose, setPurpose] = useState<PurposeCode>('FR');

  const preview = useQuery({
    queryKey: ['number-preview', projectId, disciplineId, documentTypeId],
    enabled: open && !!disciplineId && !!documentTypeId,
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/projects/{projectId}/documents/number-preview', {
          params: { path: { projectId }, query: { disciplineId, documentTypeId } },
        }),
      ),
  });

  const reset = () => {
    setDiscipline('');
    setType('');
    setTitle('');
    setTitleEn('');
    setOwner('');
    setTags('');
    setPlans({});
    setWithRev(false);
  };

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/projects/{projectId}/documents', {
          params: { path: { projectId } },
          body: {
            title,
            titleEn: titleEn || undefined,
            disciplineId,
            documentTypeId,
            ownerId: ownerId || undefined,
            confidentiality,
            tags: tags
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
            plans: Object.entries(plans)
              .filter(([, d]) => !!d)
              .map(([purposeCode, plannedDate]) => ({
                purposeCode: purposeCode as PurposeCode,
                plannedDate,
              })),
            firstRevision: withRev ? { purposeCode: purpose } : undefined,
          },
        }),
      ),
    onSuccess: (d) => {
      for (const w of d.warnings) {
        if (w.code === 'DOC_TITLE_EXISTS')
          toast.warning(t('documents.titleExists', { numbers: w.documents.join(', ') }));
      }
      toast.success(t('documents.registered', { number: d.number }));
      refresh(d.id);
      reset();
      onOpenChange(false);
      onCreated(d);
    },
  });
  const fieldError = useFieldError(create.error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('documents.register')} wide>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <ProblemAlert error={create.error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('documents.discipline')} error={fieldError('disciplineId')}>
              <NativeSelect
                required
                value={disciplineId}
                onChange={(e) => setDiscipline(e.target.value)}
                data-testid="doc-discipline"
              >
                <option value="">–</option>
                {disciplines.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.nameTh}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('documents.type')} error={fieldError('documentTypeId')}>
              <NativeSelect
                required
                value={documentTypeId}
                onChange={(e) => setType(e.target.value)}
                data-testid="doc-type"
              >
                <option value="">–</option>
                {types.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.nameTh}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          {preview.data ? (
            <p className="rounded bg-subtle px-3 py-2 text-sm">
              {t('documents.numberPreview')}:{' '}
              <span className="font-mono font-semibold" data-testid="number-preview">
                {preview.data.number}
              </span>
            </p>
          ) : null}
          <FormField label={t('documents.docTitle')} error={fieldError('title')}>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="doc-title"
            />
          </FormField>
          <FormField label={t('documents.titleEn')}>
            <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('documents.owner')}>
              <NativeSelect value={ownerId} onChange={(e) => setOwner(e.target.value)}>
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
                value={confidentiality}
                onChange={(e) => setConf(e.target.value as Confidentiality)}
              >
                {CONFIDENTIALITY.map((c) => (
                  <option key={c} value={c}>
                    {t(`enums.Confidentiality.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label={t('documents.tags')} hint={t('documents.tagsHint')}>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </FormField>
          <div>
            <p className="mb-1.5 text-sm font-medium">{t('documents.plans')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PLAN_PURPOSES.map((pc) => (
                <label key={pc} className="flex items-center gap-2 text-sm">
                  <span className="w-8 font-mono">{pc}</span>
                  <DateField
                    value={plans[pc] ?? null}
                    onChange={(v) => setPlans({ ...plans, [pc]: v })}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded border border-border p-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={withRev}
                onCheckedChange={(v) => setWithRev(v === true)}
                data-testid="doc-with-revision"
              />
              {t('documents.createFirstRevision')}
            </label>
            {withRev ? (
              <NativeSelect
                className="w-56"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as PurposeCode)}
              >
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p} · {t(`enums.PurposeCode.${p}`)}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending} data-testid="doc-submit">
              {t('documents.register')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
