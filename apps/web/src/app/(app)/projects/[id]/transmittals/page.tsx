'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { Dto } from '@wems/api-contract';
import { Plus } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { FormField } from '@/components/form-field';
import { ProblemAlert } from '@/components/problem-alert';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { PURPOSES, type PurposeCode } from '@/features/documents/api';
import { useProject } from '@/features/projects/api';
import {
  DELIVERY_METHODS,
  type DeliveryMethod,
  TRANSMITTAL_STATUSES,
} from '@/features/transmittals/api';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/hooks/use-format';
import { useUrlState } from '@/lib/hooks/use-url-state';

type Row = Dto<'TransmittalListItemDto'>;
const KEYS = ['status', 'q', 'page'] as const;

/** Transmittal list (docs/07-web-ui.md §6.6). */
function TransmittalsInner() {
  const { id: projectId } = useParams<{ id: string }>();
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const { can } = useAuth();
  const project = useProject(projectId);
  const [state, set] = useUrlState(KEYS);
  const [creating, setCreating] = useState(false);
  const page = Number(state.page ?? 1);
  const list = useQuery({
    queryKey: ['transmittals', projectId, state],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/projects/{projectId}/transmittals', {
          params: {
            path: { projectId },
            query: {
              status: state.status as (typeof TRANSMITTAL_STATUSES)[number] | undefined,
              q: state.q,
              page,
              pageSize: 25,
            },
          },
        }),
      ),
  });
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: 'number',
        header: t('transmittals.number'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span>,
      },
      {
        id: 'subject',
        header: t('transmittals.subject'),
        cell: ({ row }) => <span className="font-medium">{row.original.subject}</span>,
      },
      {
        id: 'recipient',
        header: t('transmittals.recipient'),
        cell: ({ row }) => row.original.recipientName,
      },
      {
        id: 'purpose',
        header: t('documents.purpose'),
        cell: ({ row }) => row.original.purposeCode,
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => <StatusBadge enumName="TransmittalStatus" value={row.original.status} />,
      },
      {
        id: 'sentAt',
        header: t('transmittals.sentAt'),
        cell: ({ row }) => f.date(row.original.sentAt),
      },
      {
        id: 'items',
        header: t('transmittals.items'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.itemCount}</span>,
      },
      {
        id: 'responses',
        header: t('transmittals.responses'),
        cell: ({ row }) =>
          row.original.status === 'DRAFT' ? (
            ''
          ) : (
            <span className="tabular-nums">
              {row.original.respondedCount}/{row.original.itemCount}
            </span>
          ),
      },
    ],
    [t, f],
  );
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {can('transmittal.manage') ? (
          <Button
            onClick={() => setCreating(true)}
            disabled={!project.data?.allowedActions.includes('createTransmittal')}
            data-testid="new-transmittal"
          >
            <Plus /> {t('transmittals.new')}
          </Button>
        ) : null}
        <NativeSelect
          className="ml-auto w-44"
          value={state.status ?? ''}
          onChange={(e) => set({ status: e.target.value })}
        >
          <option value="">{t('common.all')}</option>
          {TRANSMITTAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`enums.TransmittalStatus.${s}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <ProblemAlert error={list.error} />
      <DataTable
        columns={columns}
        data={list.data?.data}
        loading={list.isLoading}
        page={page}
        pageSize={25}
        total={list.data?.meta.total}
        onPage={(p) => set({ page: p }, false)}
        onRowClick={(r) => router.push(`/projects/${projectId}/transmittals/${r.id}`)}
        rowTestId={(r) => `transmittal-row-${r.number}`}
      />
      <NewTransmittalDialog
        projectId={projectId}
        clientId={project.data?.client.id}
        clientName={project.data?.client.nameTh}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => router.push(`/projects/${projectId}/transmittals/${id}`)}
      />
    </>
  );
}

function NewTransmittalDialog({
  projectId,
  clientId,
  clientName,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  clientId?: string;
  clientName?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations();
  const [subject, setSubject] = useState('');
  const [purposeCode, setPurpose] = useState<PurposeCode>('FA');
  const [deliveryMethod, setMethod] = useState<DeliveryMethod>('EMAIL_ATTACHMENT');
  const [recipientName, setRecipient] = useState<string | null>(null);
  const [emails, setEmails] = useState<string | null>(null);
  const [cc, setCc] = useState('');
  const [message, setMessage] = useState('');
  // contacts flagged "receives transmittals" pre-fill the recipients (needs client.read; optional)
  const contacts = useQuery({
    queryKey: ['client-contacts', clientId],
    enabled: open && !!clientId,
    retry: false,
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/clients/{id}/contacts', { params: { path: { id: clientId! } } }),
      ),
  });
  const defaultEmails = (contacts.data ?? [])
    .filter((c) => c.receivesTransmittals && c.email && c.isActive)
    .map((c) => c.email!)
    .join(', ');
  const split = (s: string) =>
    s
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST('/api/v1/projects/{projectId}/transmittals', {
          params: { path: { projectId } },
          body: {
            subject,
            purposeCode,
            deliveryMethod,
            recipientClientId: clientId ?? null,
            recipientName: recipientName ?? clientName ?? '',
            recipientEmails: split(emails ?? defaultEmails),
            ccEmails: split(cc),
            message: message || null,
          },
        }),
      ),
    onSuccess: (x) => {
      onOpenChange(false);
      onCreated(x.id);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('transmittals.new')} wide>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <ProblemAlert error={create.error} />
          <FormField label={t('transmittals.subject')}>
            <Input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="trn-subject"
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('documents.purpose')}>
              <NativeSelect
                value={purposeCode}
                onChange={(e) => setPurpose(e.target.value as PurposeCode)}
                data-testid="trn-purpose"
              >
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p} · {t(`enums.PurposeCode.${p}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('transmittals.deliveryMethod')}>
              <NativeSelect
                value={deliveryMethod}
                onChange={(e) => setMethod(e.target.value as DeliveryMethod)}
                data-testid="trn-method"
              >
                {DELIVERY_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`enums.DeliveryMethod.${m}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label={t('transmittals.recipient')}>
            <Input
              required
              value={recipientName ?? clientName ?? ''}
              onChange={(e) => setRecipient(e.target.value)}
              data-testid="trn-recipient"
            />
          </FormField>
          <FormField label={t('transmittals.emails')} hint={t('transmittals.emailsHint')}>
            <Input
              value={emails ?? defaultEmails}
              onChange={(e) => setEmails(e.target.value)}
              data-testid="trn-emails"
            />
          </FormField>
          <FormField label={t('transmittals.cc')}>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </FormField>
          <FormField label={t('transmittals.message')}>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending} data-testid="trn-create">
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TransmittalsPage() {
  return (
    <Suspense>
      <TransmittalsInner />
    </Suspense>
  );
}
