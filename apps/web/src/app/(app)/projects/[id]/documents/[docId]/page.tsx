'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { ActionButton, useBlockedReason } from '@/components/action-button';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { ReasonDialog } from '@/components/reason-dialog';
import { EnumLabel, StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Doc, useDocument, useRefreshDocument } from '@/features/documents/api';
import { EditDocumentDialog } from '@/features/documents/edit-document-dialog';
import { NewRevisionDialog } from '@/features/documents/new-revision-dialog';
import { PlansEditor } from '@/features/documents/plans-editor';
import { RevisionPanel } from '@/features/documents/revision-panel';
import { SupersedeDialog } from '@/features/documents/supersede-dialog';
import { api, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';

type DocAction = 'hold' | 'resume' | 'cancel' | 'supersede';

/** Document detail (docs/07-web-ui.md §6.3). */
function DocumentInner() {
  const { id: projectId, docId } = useParams<{ id: string; docId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const t = useTranslations();
  const doc = useDocument(docId);
  const [editing, setEditing] = useState(false);
  const [newRev, setNewRev] = useState(false);

  if (!doc.data) {
    return doc.error ? <ProblemAlert error={doc.error} /> : <Skeleton className="h-40 w-full" />;
  }
  const d = doc.data;
  const selected = params.get('rev') ?? d.currentRevision?.id ?? d.revisions[0]?.id ?? null;
  const select = (rev: string) =>
    router.replace(`/projects/${projectId}/documents/${docId}?rev=${rev}`, { scroll: false });

  return (
    <>
      <Link
        href={`/projects/${projectId}/documents`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t('documents.register')}
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm" data-testid="document-number">
              {d.number}
            </span>
            <StatusBadge enumName="DocumentStatus" value={d.status} />
            {d.needsNewRevision ? (
              <Badge tone="danger">{t('documents.needsNewRevision')}</Badge>
            ) : null}
          </div>
          <h2 className="text-lg font-semibold">{d.title}</h2>
          <p className="text-sm text-muted">
            {t('documents.owner')}: {d.owner?.displayName ?? '–'} · {t('documents.approvedRev')}:{' '}
            {d.latestApprovedRevision
              ? `Rev.${d.latestApprovedRevision.revLabel} (${d.latestApprovedRevision.purposeCode})`
              : '–'}{' '}
            · <EnumLabel enumName="Confidentiality" value={d.confidentiality} />
            {d.tags.length ? ` · ${d.tags.join(', ')}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <ActionButton state={d} action="edit" variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> {t('common.edit')}
          </ActionButton>
          <DocumentActions doc={d} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-2">
          <ul
            className="overflow-hidden rounded-md border border-border bg-surface"
            data-testid="revision-list"
          >
            {d.revisions.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => select(r.id)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-subtle',
                    r.id === selected && 'bg-subtle font-medium',
                    r.status === 'SUPERSEDED' && 'text-muted line-through',
                  )}
                  data-testid={`revision-${r.revLabel}`}
                >
                  <span className="w-8 font-semibold">{r.revLabel}</span>
                  <span className="text-xs text-muted">{r.purposeCode}</span>
                  <span className="ml-auto">
                    <StatusBadge enumName="RevisionStatus" value={r.status} />
                  </span>
                </button>
                {r.clientReturnCode ? (
                  <div className="px-3 pb-2 text-xs text-muted">
                    {t('documents.clientCode')}:{' '}
                    <EnumLabel enumName="ClientReturnCode" value={r.clientReturnCode} />
                  </div>
                ) : null}
              </li>
            ))}
            {d.revisions.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-muted">
                {t('documents.noRevisions')}
              </li>
            ) : null}
          </ul>
          <ActionButton
            state={d}
            action="newRevision"
            className="w-full"
            variant="outline"
            onClick={() => setNewRev(true)}
            data-testid="new-revision"
          >
            <Plus /> {t('documents.newRevision')}
          </ActionButton>
        </aside>
        <section className="min-w-0">
          {selected ? (
            <RevisionPanel revisionId={selected} projectId={projectId} documentId={docId} />
          ) : (
            <p className="text-sm text-muted">{t('documents.noRevisions')}</p>
          )}
        </section>
      </div>
      <Tabs defaultValue="plans" className="mt-6">
        <TabsList>
          <TabsTrigger value="plans">{t('documents.plans')}</TabsTrigger>
          <TabsTrigger value="details">{t('common.details')}</TabsTrigger>
        </TabsList>
        <TabsContent value="plans">
          <PlansEditor doc={d} />
        </TabsContent>
        <TabsContent value="details">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Detail
              label={t('documents.discipline')}
              value={`${d.discipline.code} · ${d.discipline.nameTh}`}
            />
            <Detail
              label={t('documents.type')}
              value={`${d.documentType.code} · ${d.documentType.nameTh}`}
            />
            <Detail label={t('documents.titleEn')} value={d.titleEn} />
            <Detail label={t('documents.source')} value={t(`enums.DocumentSource.${d.source}`)} />
            <Detail label={t('documents.externalNumber')} value={d.externalNumber} />
            <Detail label={t('documents.originator')} value={d.originator} />
            <Detail label={t('documents.sheetSize')} value={d.sheetSize} />
            <Detail label={t('documents.scale')} value={d.scale} />
            <Detail label={t('documents.remarks')} value={d.remarks} />
          </dl>
        </TabsContent>
      </Tabs>
      <EditDocumentDialog doc={d} open={editing} onOpenChange={setEditing} />
      <NewRevisionDialog
        doc={d}
        open={newRev}
        onOpenChange={setNewRev}
        onCreated={(r) => select(r.id)}
      />
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2 border-b border-border py-1.5">
      <dt className="w-40 shrink-0 text-muted">{label}</dt>
      <dd>{value || '–'}</dd>
    </div>
  );
}

function DocumentActions({ doc }: { doc: Doc }) {
  const t = useTranslations();
  const reason = useBlockedReason();
  const refresh = useRefreshDocument();
  const [asking, setAsking] = useState<DocAction | null>(null);
  const act = useMutation({
    mutationFn: async ({
      action,
      why,
    }: {
      action: Exclude<DocAction, 'supersede'>;
      why?: string;
    }) =>
      unwrap(
        await api.POST(`/api/v1/documents/{id}/${action}`, {
          params: { path: { id: doc.id } },
          body: { version: doc.version, reason: why },
        }),
      ),
    onSuccess: () => {
      refresh(doc.id);
      setAsking(null);
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const actions = (['hold', 'resume', 'cancel', 'supersede'] as const).filter((a) =>
    doc.allowedActions.includes(a),
  );
  const blocked = doc.blockedActions.filter((b) => b.action === 'newRevision');
  if (!actions.length) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label={t('common.actions')} data-testid="document-menu">
            {t('common.actions')} <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((a) => (
            <DropdownMenuItem
              key={a}
              onSelect={() => (a === 'resume' ? act.mutate({ action: a }) : setAsking(a))}
              data-testid={`document-action-${a}`}
            >
              {t(`documents.action.${a}`)}
            </DropdownMenuItem>
          ))}
          {blocked.map((b) => (
            <DropdownMenuItem key={b.action} disabled>
              {t('documents.newRevision')} — {reason(b.code)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ReasonDialog
        open={asking === 'hold' || asking === 'cancel'}
        onOpenChange={(o) => !o && setAsking(null)}
        title={asking ? t(`documents.action.${asking}`) : ''}
        confirmLabel={t('common.confirm')}
        danger={asking === 'cancel'}
        pending={act.isPending}
        onConfirm={(why) =>
          (asking === 'hold' || asking === 'cancel') && act.mutate({ action: asking, why })
        }
      />
      <SupersedeDialog
        doc={doc}
        open={asking === 'supersede'}
        onOpenChange={(o) => !o && setAsking(null)}
      />
    </>
  );
}

export default function DocumentPage() {
  return (
    <Suspense>
      <DocumentInner />
    </Suspense>
  );
}
