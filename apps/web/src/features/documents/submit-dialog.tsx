'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useBlockedReason } from '@/components/action-button';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { EnumLabel } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, newIdempotencyKey, unwrap } from '@/lib/api';
import { useFormat } from '@/lib/hooks/use-format';
import type { Revision } from './api';
import { useTemplates } from './master';

/**
 * Submit for review (docs/07-web-ui.md §6.4): one picker per template step listing only the
 * candidates the API returns; ineligible people are greyed out with the reason.
 */
export function SubmitDialog({
  revision,
  open,
  onOpenChange,
  onDone,
}: {
  revision: Revision;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: (r: Revision) => void;
}) {
  const t = useTranslations();
  const f = useFormat();
  const reason = useBlockedReason();
  const templates = useTemplates();
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  // one key per dialog session: a retried click replays instead of submitting twice
  const [idempotencyKey, setKey] = useState(newIdempotencyKey);
  const eligible = useQuery({
    queryKey: ['eligible', revision.id, templateId],
    enabled: open,
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/revisions/{id}/eligible-reviewers', {
          params: { path: { id: revision.id }, query: { templateId } },
        }),
      ),
  });
  const steps = eligible.data?.steps ?? [];
  const chosen = (stepId: string) => {
    if (picked[stepId] !== undefined) return picked[stepId];
    const s = steps.find((x) => x.templateStepId === stepId);
    return s?.candidates.find((c) => c.suggested && c.eligible)?.userId ?? '';
  };
  const submit = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/revisions/{id}/submit', {
          params: { path: { id: revision.id } },
          headers: { 'Idempotency-Key': idempotencyKey },
          body: {
            version: revision.version,
            templateId: eligible.data?.templateId ?? undefined,
            steps: steps
              .map((s) => ({
                templateStepId: s.templateStepId,
                assigneeId: chosen(s.templateStepId),
              }))
              .filter((s) => s.assigneeId),
            note: note || undefined,
          },
        }),
      ),
    onSuccess: (r) => {
      for (const w of r.warnings)
        toast.warning(t.has(`documents.warnings.${w}`) ? t(`documents.warnings.${w}`) : reason(w));
      toast.success(t('documents.submitted'));
      setPicked({});
      setNote('');
      setKey(newIdempotencyKey());
      onDone(r);
    },
    // a rejected attempt may be corrected and sent with different assignees
    onError: () => setKey(newIdempotencyKey()),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('documents.submitTitle', { label: revision.revLabel })}
        description={`${revision.documentNumber} · ${revision.documentTitle}`}
        wide
      >
        <div className="space-y-4">
          <ProblemAlert error={submit.error ?? eligible.error} />
          <FormField label={t('documents.workflowTemplate')}>
            <NativeSelect
              value={templateId ?? eligible.data?.templateId ?? ''}
              onChange={(e) => {
                setTemplateId(e.target.value || undefined);
                setPicked({});
              }}
              data-testid="submit-template"
            >
              {templates.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {eligible.isLoading ? <Skeleton className="h-32 w-full" /> : null}
          <ol className="space-y-3">
            {steps.map((s) => (
              <li
                key={s.templateStepId}
                className="rounded border border-border p-3"
                data-testid={`submit-step-${s.kind}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted tabular-nums">{s.stepOrder}.</span>
                  <span className="font-medium">{s.name}</span>
                  <Badge tone="neutral">
                    <EnumLabel enumName="ReviewStepKind" value={s.kind} />
                  </Badge>
                  {s.isOptional ? <Badge tone="muted">{t('master.optional')}</Badge> : null}
                  {s.requiresSignature ? <Badge tone="info">{t('master.signature')}</Badge> : null}
                  {s.needsLicense ? <Badge tone="warning">{t('master.license')}</Badge> : null}
                  <span className="ml-auto text-xs text-muted">
                    {t('documents.estimatedDue', { date: f.dateTime(s.estimatedDueAt) })}
                  </span>
                </div>
                <NativeSelect
                  value={chosen(s.templateStepId)}
                  onChange={(e) => setPicked({ ...picked, [s.templateStepId]: e.target.value })}
                  data-testid={`assignee-${s.kind}`}
                >
                  <option value="">{s.isOptional ? t('documents.noAssigneeOptional') : '–'}</option>
                  {s.candidates.map((c) => (
                    <option key={c.userId} value={c.userId} disabled={!c.eligible}>
                      {c.displayName}
                      {c.license
                        ? ` · ${t(`enums.LicenseLevel.${c.license.level}`)} ${c.license.licenseNo} (${f.date(c.license.expiresAt)})`
                        : ''}
                      {c.eligible ? '' : ` — ${reason(c.reason ?? '')}`}
                      {c.licenseExpiresBeforeDue
                        ? ` ⚠ ${t('documents.licenseExpiresBeforeDue')}`
                        : ''}
                    </option>
                  ))}
                </NativeSelect>
              </li>
            ))}
          </ol>
          <FormField label={t('documents.noteToReviewers')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !steps.length}
            data-testid="submit-confirm"
          >
            {t('documents.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
