'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  FileDown,
  Link2,
  Mail,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionButton } from '@/components/action-button';
import { DateField } from '@/components/date-field';
import { FileUploader } from '@/components/file-uploader';
import { FormField } from '@/components/form-field';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { ReasonDialog } from '@/components/reason-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { CLIENT_CODES } from '@/features/documents/api';
import {
  FORMATS,
  formatBytes,
  type Transmittal,
  type TransmittalFormat,
  type TransmittalItem,
  useRefreshTransmittal,
  useTransmittal,
} from '@/features/transmittals/api';
import { api, newIdempotencyKey, unwrap } from '@/lib/api';
import { todayBangkok } from '@/lib/dates';
import { useFormat } from '@/lib/hooks/use-format';

/** Transmittal editor (DRAFT) and sent view (docs/07-web-ui.md §6.6). */
export default function TransmittalPage() {
  const { id: projectId, tid } = useParams<{ id: string; tid: string }>();
  const t = useTranslations();
  const f = useFormat();
  const tr = useTransmittal(tid);
  if (!tr.data)
    return tr.error ? <ProblemAlert error={tr.error} /> : <Skeleton className="h-64 w-full" />;
  const x = tr.data;
  const draft = x.status === 'DRAFT';
  return (
    <>
      <Link
        href={`/projects/${projectId}/transmittals`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t('projects.transmittals')}
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm" data-testid="trn-number">
              {x.number}
            </span>
            <span data-testid="trn-status">
              <StatusBadge enumName="TransmittalStatus" value={x.status} />
            </span>
          </div>
          <h2 className="text-lg font-semibold">{x.subject}</h2>
          <p className="text-sm text-muted">
            {x.recipientName} · {t(`enums.DeliveryMethod.${x.deliveryMethod}`)} · {x.purposeCode}
            {x.sentAt
              ? ` · ${t('transmittals.sentOn', { date: f.dateTime(x.sentAt), name: x.sentBy?.displayName ?? '' })}`
              : ''}
          </p>
        </div>
        <HeaderActions x={x} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {draft && x.allowedActions.includes('edit') ? <HeaderForm x={x} /> : <HeaderView x={x} />}
          <Items x={x} projectId={projectId} />
        </div>
        <aside className="space-y-4">
          <SizeCard x={x} />
          {x.publicUrl ? <LinkCard x={x} /> : null}
          {x.allowedActions.includes('acknowledge') || x.acknowledgedAt ? <AckCard x={x} /> : null}
          {x.downloads.length ? <DownloadsCard x={x} /> : null}
        </aside>
      </div>
    </>
  );
}

function HeaderActions({ x }: { x: Transmittal }) {
  const t = useTranslations();
  const refresh = useRefreshTransmittal();
  const [cancelling, setCancelling] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const send = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/transmittals/{id}/send', {
          params: { path: { id: x.id } },
          headers: { 'Idempotency-Key': key },
          body: { version: x.version },
        }),
      ),
    onSuccess: (r) => {
      for (const w of r.warnings) toast.warning(t(`transmittals.warnings.${w}`));
      toast.success(t('transmittals.sent'));
      refresh(x.id, r);
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const cancel = useMutation({
    mutationFn: async (reason: string) =>
      unwrap(
        await api.POST('/api/v1/transmittals/{id}/cancel', {
          params: { path: { id: x.id } },
          body: { version: x.version, reason },
        }),
      ),
    onSuccess: (r) => {
      refresh(x.id, r);
      setCancelling(false);
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const resend = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/transmittals/{id}/resend-email', {
          params: { path: { id: x.id } },
          body: { version: x.version },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('transmittals.resent'));
      refresh(x.id, r);
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const cover = async () => {
    try {
      const r = unwrap(
        await api.GET('/api/v1/transmittals/{id}/cover-sheet', { params: { path: { id: x.id } } }),
      );
      window.open(r.url, '_blank', 'noopener');
    } catch (e) {
      toastError(e, t('common.unexpected'));
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {x.coverSheetFileId ? (
        <Button variant="outline" onClick={() => void cover()} data-testid="trn-cover">
          <FileDown /> {t('transmittals.coverSheet')}
        </Button>
      ) : null}
      <ActionButton
        state={x}
        action="resendEmail"
        variant="outline"
        onClick={() => resend.mutate()}
      >
        <Mail /> {t('transmittals.resend')}
      </ActionButton>
      <ActionButton state={x} action="cancel" variant="ghost" onClick={() => setCancelling(true)}>
        {t('common.cancel')}
      </ActionButton>
      <ActionButton
        state={x}
        action="send"
        disabled={send.isPending}
        onClick={() =>
          window.confirm(t('transmittals.confirmSend', { n: x.itemCount })) && send.mutate()
        }
        data-testid="trn-send"
      >
        <Send /> {t('transmittals.send')}
      </ActionButton>
      <ReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t('transmittals.cancelTitle')}
        confirmLabel={t('common.confirm')}
        danger
        pending={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
    </div>
  );
}

function HeaderView({ x }: { x: Transmittal }) {
  const t = useTranslations();
  return (
    <Card>
      <CardContent className="grid gap-2 pt-4 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted">{t('transmittals.emails')}: </span>
          {x.recipientEmails.join(', ') || '–'}
        </p>
        <p>
          <span className="text-muted">{t('transmittals.cc')}: </span>
          {x.ccEmails.join(', ') || '–'}
        </p>
        {x.message ? <p className="whitespace-pre-wrap sm:col-span-2">{x.message}</p> : null}
        {x.cancelReason ? <p className="text-danger-fg sm:col-span-2">{x.cancelReason}</p> : null}
      </CardContent>
    </Card>
  );
}

function HeaderForm({ x }: { x: Transmittal }) {
  const t = useTranslations();
  const refresh = useRefreshTransmittal();
  const [subject, setSubject] = useState(x.subject);
  const [recipientName, setRecipient] = useState(x.recipientName);
  const [emails, setEmails] = useState(x.recipientEmails.join(', '));
  const [cc, setCc] = useState(x.ccEmails.join(', '));
  const [message, setMessage] = useState(x.message ?? '');
  const [deliveryMethod, setMethod] = useState(x.deliveryMethod);
  const split = (s: string) =>
    s
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PATCH('/api/v1/transmittals/{id}', {
          params: { path: { id: x.id } },
          body: {
            version: x.version,
            subject,
            recipientName,
            recipientEmails: split(emails),
            ccEmails: split(cc),
            message: message || null,
            deliveryMethod,
          },
        }),
      ),
    onSuccess: (r) => {
      toast.success(t('common.saved'));
      refresh(x.id, r);
    },
  });
  return (
    <Card>
      <CardContent className="pt-4">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <ProblemAlert error={save.error} />
          </div>
          <FormField label={t('transmittals.subject')}>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </FormField>
          <FormField label={t('transmittals.deliveryMethod')}>
            <NativeSelect
              value={deliveryMethod}
              onChange={(e) => setMethod(e.target.value as Transmittal['deliveryMethod'])}
            >
              {(['EMAIL_ATTACHMENT', 'EMAIL_LINK', 'HARD_COPY', 'OTHER'] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`enums.DeliveryMethod.${m}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('transmittals.recipient')}>
            <Input value={recipientName} onChange={(e) => setRecipient(e.target.value)} />
          </FormField>
          <FormField label={t('transmittals.emails')}>
            <Input
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              data-testid="trn-edit-emails"
            />
          </FormField>
          <FormField label={t('transmittals.cc')}>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </FormField>
          <FormField label={t('transmittals.message')}>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
          </FormField>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="outline" disabled={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Items({ x, projectId }: { x: Transmittal; projectId: string }) {
  const t = useTranslations();
  const f = useFormat();
  const refresh = useRefreshTransmittal();
  const [adding, setAdding] = useState(false);
  const [responding, setResponding] = useState<TransmittalItem | null>(null);
  const editable = x.allowedActions.includes('addItem');
  const patch = useMutation({
    mutationFn: async ({
      itemId,
      body,
    }: {
      itemId: string;
      body: { copies?: number; format?: TransmittalFormat; remark?: string | null };
    }) =>
      unwrap(
        await api.PATCH('/api/v1/transmittals/{id}/items/{itemId}', {
          params: { path: { id: x.id, itemId } },
          body,
        }),
      ),
    onSuccess: (r) => refresh(x.id, r),
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const remove = useMutation({
    mutationFn: async (itemId: string) =>
      unwrap(
        await api.DELETE('/api/v1/transmittals/{id}/items/{itemId}', {
          params: { path: { id: x.id, itemId } },
        }),
      ),
    onSuccess: (r) => refresh(x.id, r),
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('transmittals.items')}</CardTitle>
        {editable ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAdding(true)}
            data-testid="trn-add-items"
          >
            <Plus /> {t('transmittals.addDocuments')}
          </Button>
        ) : null}
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>{t('documents.number')}</TH>
              <TH>Rev.</TH>
              <TH>{t('transmittals.format')}</TH>
              <TH>{t('transmittals.copies')}</TH>
              <TH>{t('documents.remarks')}</TH>
              {x.status === 'DRAFT' ? <TH /> : <TH>{t('transmittals.clientResponse')}</TH>}
            </TR>
          </THead>
          <TBody>
            {x.items.map((i, n) => (
              <TR key={i.id} data-testid={`trn-item-${i.documentNumber}`}>
                <TD className="tabular-nums">{n + 1}</TD>
                <TD>
                  <Link
                    className="font-mono text-xs hover:underline"
                    href={`/projects/${projectId}/documents/${i.documentId}?rev=${i.revisionId}`}
                  >
                    {i.documentNumber}
                  </Link>
                  <div className="text-xs">{i.documentTitle}</div>
                  {!i.isLatest ? (
                    <span className="inline-flex items-center gap-1 text-xs text-warning-fg">
                      <AlertTriangle className="size-3" /> {t('transmittals.notLatest')}
                    </span>
                  ) : null}
                </TD>
                <TD>
                  {i.revLabel} <span className="text-xs text-muted">{i.purposeCode}</span>
                </TD>
                <TD>
                  {editable ? (
                    <NativeSelect
                      className="h-8 w-36"
                      value={i.format}
                      onChange={(e) =>
                        patch.mutate({
                          itemId: i.id,
                          body: { format: e.target.value as TransmittalFormat },
                        })
                      }
                    >
                      {FORMATS.map((fm) => (
                        <option key={fm} value={fm}>
                          {t(`enums.TransmittalFormat.${fm}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    t(`enums.TransmittalFormat.${i.format}`)
                  )}
                  <div className="text-xs text-muted">{formatBytes(i.sizeBytes)}</div>
                </TD>
                <TD>
                  {editable ? (
                    <Input
                      className="h-8 w-16"
                      type="number"
                      min={1}
                      max={99}
                      defaultValue={i.copies}
                      onBlur={(e) =>
                        Number(e.target.value) !== i.copies &&
                        patch.mutate({ itemId: i.id, body: { copies: Number(e.target.value) } })
                      }
                    />
                  ) : (
                    i.copies
                  )}
                </TD>
                <TD>
                  {editable ? (
                    <Input
                      className="h-8"
                      defaultValue={i.remark ?? ''}
                      onBlur={(e) =>
                        e.target.value !== (i.remark ?? '') &&
                        patch.mutate({ itemId: i.id, body: { remark: e.target.value || null } })
                      }
                    />
                  ) : (
                    i.remark
                  )}
                </TD>
                {x.status === 'DRAFT' ? (
                  <TD className="text-right">
                    {editable ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove.mutate(i.id)}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </TD>
                ) : (
                  <TD>
                    {i.clientReturnCode ? (
                      <div>
                        <StatusBadge enumName="ClientReturnCode" value={i.clientReturnCode} />
                        <div className="text-xs text-muted">{f.date(i.clientReturnedAt)}</div>
                      </div>
                    ) : null}
                    {x.allowedActions.includes('recordResponse') ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setResponding(i)}
                        data-testid="trn-record-response"
                      >
                        {i.clientReturnCode ? t('common.edit') : t('transmittals.recordResponse')}
                      </Button>
                    ) : null}
                  </TD>
                )}
              </TR>
            ))}
            {!x.items.length ? (
              <TR>
                <TD colSpan={7} className="py-6 text-center text-muted">
                  {t('transmittals.noItems')}
                </TD>
              </TR>
            ) : null}
          </TBody>
        </Table>
      </div>
      <AddItemsDialog x={x} open={adding} onOpenChange={setAdding} />
      {responding ? (
        <ClientResponseDialog x={x} item={responding} onClose={() => setResponding(null)} />
      ) : null}
    </Card>
  );
}

function AddItemsDialog({
  x,
  open,
  onOpenChange,
}: {
  x: Transmittal;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations();
  const refresh = useRefreshTransmittal();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const list = useQuery({
    queryKey: ['transmittable', x.projectId, q],
    enabled: open,
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/projects/{projectId}/transmittable-revisions', {
          params: { path: { projectId: x.projectId }, query: { q: q || undefined } },
        }),
      ),
  });
  const inList = new Set(x.items.map((i) => i.revisionId));
  const add = useMutation({
    mutationFn: async () => {
      let last: Transmittal | undefined;
      for (const revisionId of picked) {
        last = unwrap(
          await api.POST('/api/v1/transmittals/{id}/items', {
            params: { path: { id: x.id } },
            body: { revisionId },
          }),
        );
      }
      return last;
    },
    onSuccess: (r) => {
      refresh(x.id, r);
      setPicked([]);
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('transmittals.addDocuments')}
        description={t('transmittals.addHelp')}
        wide
      >
        <div className="space-y-3">
          <ProblemAlert error={add.error} />
          <Input
            placeholder={t('common.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="trn-pick-search"
          />
          <ul className="max-h-80 divide-y divide-border overflow-auto rounded border border-border">
            {list.data
              ?.filter((r) => !inList.has(r.revisionId))
              .map((r) => (
                <li key={r.revisionId}>
                  <label className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox
                      checked={picked.includes(r.revisionId)}
                      onCheckedChange={(v) =>
                        setPicked(
                          v === true
                            ? [...picked, r.revisionId]
                            : picked.filter((p) => p !== r.revisionId),
                        )
                      }
                      data-testid={`trn-pick-${r.documentNumber}-${r.revLabel}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-xs">{r.documentNumber}</span> Rev.{r.revLabel}{' '}
                      ({r.purposeCode})
                      <span className="block truncate text-xs text-muted">{r.documentTitle}</span>
                    </span>
                    <StatusBadge enumName="RevisionStatus" value={r.status} />
                    {!r.isLatest ? (
                      <Badge tone="warning">{t('transmittals.notLatest')}</Badge>
                    ) : null}
                    <span className="w-16 text-right text-xs text-muted">
                      {formatBytes(r.sizeBytes)}
                    </span>
                  </label>
                </li>
              ))}
            {list.data && !list.data.length ? (
              <li className="px-3 py-4 text-center text-sm text-muted">
                {t('transmittals.nothingToSend')}
              </li>
            ) : null}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!picked.length || add.isPending}
            onClick={() => add.mutate()}
            data-testid="trn-pick-confirm"
          >
            {t('transmittals.addCount', { n: picked.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientResponseDialog({
  x,
  item,
  onClose,
}: {
  x: Transmittal;
  item: TransmittalItem;
  onClose: () => void;
}) {
  const t = useTranslations();
  const refresh = useRefreshTransmittal();
  const [code, setCode] = useState<(typeof CLIENT_CODES)[number] | 'INFO'>(
    item.clientReturnCode ?? 'CODE_2',
  );
  const [returnedAt, setReturned] = useState<string | null>(
    item.clientReturnedAt ?? todayBangkok(),
  );
  const [note, setNote] = useState(item.clientResponseNote ?? '');
  const [fileId, setFileId] = useState<string | null>(item.clientCommentFileId);
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/transmittal-items/{id}/client-response', {
          params: { path: { id: item.id } },
          body: {
            code,
            returnedAt: returnedAt!,
            note: note || undefined,
            fileId: fileId ?? undefined,
          },
        }),
      ),
    onSuccess: (r) => {
      refresh(x.id, r);
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t('transmittals.recordResponse')}
        description={`${item.documentNumber} Rev.${item.revLabel}`}
      >
        <div className="space-y-3">
          <ProblemAlert error={save.error} />
          <FormField label={t('transmittals.returnCode')}>
            <NativeSelect
              value={code}
              onChange={(e) => setCode(e.target.value as typeof code)}
              data-testid="trn-return-code"
            >
              {[...CLIENT_CODES, 'INFO' as const].map((c) => (
                <option key={c} value={c}>
                  {t(`enums.ClientReturnCode.${c}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('transmittals.returnedAt')}>
            <DateField value={returnedAt} onChange={setReturned} />
          </FormField>
          <FormField label={t('documents.remarks')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <FileUploader
            purpose="CLIENT_RESPONSE"
            onUploaded={(file) => setFileId(file.id)}
            label={t('transmittals.clientFile')}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!returnedAt || save.isPending}
            onClick={() => save.mutate()}
            data-testid="trn-return-save"
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SizeCard({ x }: { x: Transmittal }) {
  const t = useTranslations();
  return (
    <Card>
      <CardContent className="space-y-1 pt-4 text-sm">
        <p>
          {t('transmittals.totalSize')}:{' '}
          <span className="font-semibold">{formatBytes(x.totalBytes)}</span>
        </p>
        {x.status === 'DRAFT' && x.willSendLink ? (
          <p className="rounded bg-warning p-2 text-warning-fg" data-testid="trn-will-link">
            {t('transmittals.willLink', { mb: x.maxAttachmentMb })}
          </p>
        ) : null}
        {x.blockedActions.map((b) => (
          <p key={b.action} className="text-xs text-muted">
            {t.has(`errors.${b.code}.title`) ? t(`errors.${b.code}.title`) : b.code}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

function LinkCard({ x }: { x: Transmittal }) {
  const t = useTranslations();
  const f = useFormat();
  const refresh = useRefreshTransmittal();
  const [days, setDays] = useState(30);
  const act = useMutation({
    mutationFn: async (kind: 'revoke' | 'extend') =>
      kind === 'revoke'
        ? unwrap(
            await api.POST('/api/v1/transmittals/{id}/revoke-link', {
              params: { path: { id: x.id } },
              body: { version: x.version },
            }),
          )
        : unwrap(
            await api.POST('/api/v1/transmittals/{id}/extend-link', {
              params: { path: { id: x.id } },
              body: { version: x.version, days },
            }),
          ),
    onSuccess: (r) => refresh(x.id, r),
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4" /> {t('transmittals.link')}
        </CardTitle>
        {x.linkRevokedAt ? <Badge tone="danger">{t('transmittals.revoked')}</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <code
            className="min-w-0 flex-1 truncate rounded bg-subtle px-2 py-1 text-xs"
            data-testid="trn-public-url"
          >
            {x.publicUrl}
          </code>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('common.copy')}
            onClick={() => {
              void navigator.clipboard.writeText(x.publicUrl ?? '');
              toast.success(t('common.copied'));
            }}
          >
            <Copy />
          </Button>
        </div>
        <p className="text-xs text-muted">
          {t('transmittals.expires', { date: f.dateTime(x.linkExpiresAt) })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            state={x}
            action="revokeLink"
            size="sm"
            variant="outline"
            onClick={() => act.mutate('revoke')}
            data-testid="trn-revoke"
          >
            {t('transmittals.revoke')}
          </ActionButton>
          {x.allowedActions.includes('extendLink') ? (
            <>
              <Input
                className="h-8 w-16"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
              <Button size="sm" variant="outline" onClick={() => act.mutate('extend')}>
                {t('transmittals.extend')}
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function AckCard({ x }: { x: Transmittal }) {
  const t = useTranslations();
  const f = useFormat();
  const refresh = useRefreshTransmittal();
  const [date, setDate] = useState<string | null>(todayBangkok());
  const [note, setNote] = useState('');
  const [fileId, setFileId] = useState<string | null>(null);
  const ack = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/transmittals/{id}/acknowledge', {
          params: { path: { id: x.id } },
          body: {
            version: x.version,
            acknowledgedAt: date!,
            note: note || undefined,
            fileId: fileId ?? undefined,
          },
        }),
      ),
    onSuccess: (r) => refresh(x.id, r),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('transmittals.acknowledgement')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {x.acknowledgedAt ? (
          <p>
            {t('transmittals.receivedOn', { date: f.date(x.acknowledgedAt) })}
            {x.acknowledgedNote ? ` · ${x.acknowledgedNote}` : ''}
          </p>
        ) : (
          <>
            <ProblemAlert error={ack.error} />
            <DateField value={date} onChange={setDate} />
            <Input
              placeholder={t('documents.remarks')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <FileUploader
              purpose="ATTACHMENT"
              onUploaded={(file) => setFileId(file.id)}
              label={t('transmittals.receiptFile')}
            />
            <Button
              size="sm"
              disabled={!date || ack.isPending}
              onClick={() => ack.mutate()}
              data-testid="trn-acknowledge"
            >
              {t('transmittals.acknowledge')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DownloadsCard({ x }: { x: Transmittal }) {
  const t = useTranslations();
  const f = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('transmittals.downloads')}</CardTitle>
      </CardHeader>
      <ul
        className="max-h-64 divide-y divide-border overflow-auto text-xs"
        data-testid="trn-downloads"
      >
        {x.downloads.map((d, i) => (
          <li key={i} className="px-4 py-2">
            <div>{d.fileName ?? '–'}</div>
            <div className="text-muted">
              {f.dateTime(d.downloadedAt)} {d.ip ? `· ${d.ip}` : ''}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
