'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  ExternalLink,
  FileText,
  MessageSquare,
  Paperclip,
  PenTool,
  Send,
  Trash2,
  UserRoundCog,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionButton } from '@/components/action-button';
import { FileUploader } from '@/components/file-uploader';
import { ProblemAlert, toastError } from '@/components/problem-alert';
import { ReasonDialog } from '@/components/reason-dialog';
import { EnumLabel, StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPicker } from '@/components/user-picker';
import { api, unwrap } from '@/lib/api';
import { useFormat } from '@/lib/hooks/use-format';
import { cn } from '@/lib/utils';
import {
  FILE_ROLES,
  type FileRole,
  type Revision,
  type ReviewStep,
  revisionDownloadUrl,
  saveBlob,
  useRefreshDocument,
  useRevision,
} from './api';
import { SubmitDialog } from './submit-dialog';

/** Selected revision: files, review cycles and actions (docs/07-web-ui.md §6.3). */
export function RevisionPanel({
  revisionId,
  projectId,
  documentId,
}: {
  revisionId: string;
  projectId: string;
  documentId: string;
}) {
  const t = useTranslations();
  const rev = useRevision(revisionId);
  if (!rev.data) {
    return rev.error ? <ProblemAlert error={rev.error} /> : <Skeleton className="h-64 w-full" />;
  }
  const r = rev.data;
  return (
    <Card data-testid="revision-panel">
      <CardHeader className="flex-wrap gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span data-testid="revision-label">Rev.{r.revLabel}</span>
          <span className="text-sm font-normal text-muted">
            {r.purposeCode} · <EnumLabel enumName="PurposeCode" value={r.purposeCode} />
          </span>
          <span data-testid="revision-status">
            <StatusBadge enumName="RevisionStatus" value={r.status} />
          </span>
          {r.isLatestApproved ? (
            <Badge tone="success">{t('documents.latestApproved')}</Badge>
          ) : null}
        </CardTitle>
        <RevisionActions r={r} documentId={documentId} />
      </CardHeader>
      <CardContent className="space-y-5">
        <Description r={r} documentId={documentId} />
        {r.voidReason ? (
          <p className="rounded bg-danger p-2 text-sm text-danger-fg">
            {t('documents.voidReason')}: {r.voidReason}
          </p>
        ) : null}
        <Files r={r} documentId={documentId} />
        <Cycles r={r} documentId={documentId} />
        <div className="flex flex-wrap items-center gap-3 rounded border border-border p-3 text-sm">
          <MessageSquare className="size-4 text-muted" />
          <span data-testid="comment-count">
            {t('documents.commentSummary', { open: r.openCommentCount, total: r.commentCount })}
          </span>
          <Button asChild size="sm" className="ml-auto" data-testid="open-review">
            <Link href={`/projects/${projectId}/documents/${documentId}/revisions/${r.id}/review`}>
              <ExternalLink /> {t('documents.openReview')}
            </Link>
          </Button>
          {r.commentCount ? <CrsButtons revisionId={r.id} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Description({ r, documentId }: { r: Revision; documentId: string }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const refresh = useRefreshDocument();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.description ?? '');
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PATCH('/api/v1/revisions/{id}', {
          params: { path: { id: r.id } },
          body: { version: r.version, description: text },
        }),
      ),
    onSuccess: (x) => {
      qc.setQueryData(['revision', r.id], x);
      refresh(documentId);
      setEditing(false);
    },
  });
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted uppercase">
        {t('documents.revisionDescription')}
      </p>
      {editing ? (
        <div className="space-y-2">
          <ProblemAlert error={save.error} />
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="revision-description"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              data-testid="revision-description-save"
            >
              {t('common.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className="text-sm whitespace-pre-wrap">{r.description || '–'}</p>
          {r.allowedActions.includes('edit') ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(r.description ?? '');
                setEditing(true);
              }}
              aria-label={t('common.edit')}
            >
              <PenTool />
            </Button>
          ) : null}
        </div>
      )}
      <p className="mt-1 text-xs text-muted">
        {t('documents.preparedBy')}: {r.preparedBy.displayName}
        {r.checkedBy ? ` · ${t('documents.checkedBy')}: ${r.checkedBy.displayName}` : ''}
        {r.approvedBy ? ` · ${t('documents.approvedBy')}: ${r.approvedBy.displayName}` : ''}
      </p>
    </div>
  );
}

function Files({ r, documentId }: { r: Revision; documentId: string }) {
  const t = useTranslations();
  const f = useFormat();
  const qc = useQueryClient();
  const refresh = useRefreshDocument();
  const [role, setRole] = useState<FileRole>('PDF_RENDITION');
  const [showOld, setShowOld] = useState(false);
  const attach = useMutation({
    mutationFn: async (fileId: string) =>
      unwrap(
        await api.POST('/api/v1/revisions/{id}/files', {
          params: { path: { id: r.id } },
          body: { fileId, role },
        }),
      ),
    onSuccess: (x) => {
      qc.setQueryData(['revision', r.id], x);
      refresh(documentId);
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const download = async (documentFileId: string, fileRole: FileRole, stamp = true) => {
    try {
      window.open(
        await revisionDownloadUrl(r.id, { documentFileId, fileRole, stamp }),
        '_blank',
        'noopener',
      );
    } catch (e) {
      toastError(e, t('common.unexpected'));
    }
  };
  const files = r.files.filter((x) => showOld || x.isCurrent);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted uppercase">{t('documents.files')}</p>
        {r.files.some((x) => !x.isCurrent) ? (
          <button
            type="button"
            className="text-xs text-muted hover:underline"
            onClick={() => setShowOld(!showOld)}
          >
            {showOld ? t('documents.hideOldVersions') : t('documents.showOldVersions')}
          </button>
        ) : null}
      </div>
      <ul
        className="divide-y divide-border rounded border border-border"
        data-testid="revision-files"
      >
        {files.map((x) => (
          <li
            key={x.id}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm',
              !x.isCurrent && 'text-muted',
            )}
          >
            {x.role === 'SUPPORTING' ? (
              <Paperclip className="size-4" />
            ) : (
              <FileText className="size-4" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{x.file.originalName}</span>
              <span className="block text-xs text-muted">
                <EnumLabel enumName="DocumentFileRole" value={x.role} /> · v{x.uploadVersion}
                {x.file.pageCount
                  ? ` · ${t('documents.pages', { n: x.file.pageCount })}`
                  : ''} · {f.dateTime(x.uploadedAt)}
              </span>
            </span>
            {x.file.status !== 'AVAILABLE' ? (
              <StatusBadge enumName="FileStatus" value={x.file.status} />
            ) : null}
            {x.file.status === 'AVAILABLE' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void download(x.id, x.role)}
                aria-label={t('common.download')}
              >
                <Download />
              </Button>
            ) : null}
            {x.role === 'PDF_RENDITION' &&
            r.allowedActions.includes('downloadUnstamped') &&
            x.file.status === 'AVAILABLE' ? (
              <Button size="sm" variant="ghost" onClick={() => void download(x.id, x.role, false)}>
                {t('documents.unstamped')}
              </Button>
            ) : null}
          </li>
        ))}
        {files.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted">{t('documents.noFiles')}</li>
        ) : null}
      </ul>
      {r.allowedActions.includes('upload') ? (
        <div className="mt-2 space-y-2">
          <NativeSelect
            className="w-56"
            value={role}
            onChange={(e) => setRole(e.target.value as FileRole)}
            data-testid="file-role"
          >
            {FILE_ROLES.map((x) => (
              <option key={x} value={x}>
                {t(`enums.DocumentFileRole.${x}`)}
              </option>
            ))}
          </NativeSelect>
          <FileUploader
            purpose="DOCUMENT_REVISION"
            accept={role === 'PDF_RENDITION' ? 'application/pdf,.pdf' : undefined}
            onUploaded={(file) => attach.mutate(file.id)}
            testId="revision-uploader"
          />
        </div>
      ) : null}
    </div>
  );
}

function Cycles({ r, documentId }: { r: Revision; documentId: string }) {
  const t = useTranslations();
  const f = useFormat();
  if (!r.cycles.length) return null;
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted uppercase">{t('documents.reviewCycles')}</p>
      {r.cycles.map((c) => (
        <div key={c.id} className="rounded border border-border" data-testid={`cycle-${c.cycleNo}`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-subtle px-3 py-2 text-sm">
            <span className="font-medium">{t('documents.cycleNo', { n: c.cycleNo })}</span>
            <StatusBadge enumName="ReviewCycleStatus" value={c.status} />
            <span className="text-xs text-muted">
              {t('documents.submittedBy', {
                name: c.submittedBy.displayName,
                date: f.dateTime(c.submittedAt),
              })}
            </span>
          </div>
          {c.submitNote ? <p className="px-3 pt-2 text-sm text-muted">{c.submitNote}</p> : null}
          {c.cancelledReason ? (
            <p className="px-3 pt-2 text-sm text-danger-fg">{c.cancelledReason}</p>
          ) : null}
          <ol className="divide-y divide-border">
            {c.steps.map((s) => (
              <StepRow key={s.id} s={s} revision={r} documentId={documentId} />
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function StepRow({
  s,
  revision,
  documentId,
}: {
  s: ReviewStep;
  revision: Revision;
  documentId: string;
}) {
  const t = useTranslations();
  const f = useFormat();
  const qc = useQueryClient();
  const refresh = useRefreshDocument();
  const [mode, setMode] = useState<'reassign' | 'skip' | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const done = (x: Revision) => {
    qc.setQueryData(['revision', revision.id], x);
    refresh(documentId, revision.id);
    setMode(null);
    setAssignee(null);
  };
  const reassign = useMutation({
    mutationFn: async (reason: string) =>
      unwrap(
        await api.POST('/api/v1/review-steps/{id}/reassign', {
          params: { path: { id: s.id } },
          body: { version: s.version, assigneeId: assignee!, reason },
        }),
      ),
    onSuccess: done,
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const skip = useMutation({
    mutationFn: async (reason: string) =>
      unwrap(
        await api.POST('/api/v1/review-steps/{id}/skip', {
          params: { path: { id: s.id } },
          body: { version: s.version, reason },
        }),
      ),
    onSuccess: done,
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  return (
    <li
      className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
      data-testid={`step-${s.kind}`}
    >
      <span className="w-6 text-muted tabular-nums">{s.stepOrder}</span>
      <span className="w-32 font-medium">{s.name}</span>
      <span className="min-w-32">
        {s.assignee?.displayName ?? '–'}
        {s.delegatedFrom ? (
          <span className="block text-xs text-muted">
            {t('documents.delegatedFrom', { name: s.delegatedFrom.displayName })}
          </span>
        ) : null}
      </span>
      <StatusBadge enumName="ReviewStepStatus" value={s.status} />
      {s.status === 'ACTIVE' && s.dueAt ? (
        <span
          className={cn('text-xs', s.isOverdue ? 'font-semibold text-danger-fg' : 'text-muted')}
        >
          {t('documents.dueAt', { date: f.dateTime(s.dueAt) })}
        </span>
      ) : null}
      {s.decidedAt ? <span className="text-xs text-muted">{f.dateTime(s.decidedAt)}</span> : null}
      {s.signatureEventId ? <Badge tone="success">{t('documents.signed')}</Badge> : null}
      <span className="ml-auto flex gap-1">
        {s.allowedActions.includes('reassign') ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMode('reassign')}
            data-testid="step-reassign"
          >
            <UserRoundCog /> {t('documents.reassign')}
          </Button>
        ) : null}
        {s.allowedActions.includes('skip') ? (
          <Button size="sm" variant="ghost" onClick={() => setMode('skip')}>
            {t('documents.skip')}
          </Button>
        ) : null}
      </span>
      {s.decisionNote ? <p className="w-full pl-8 text-xs text-muted">“{s.decisionNote}”</p> : null}
      <ReasonDialog
        open={mode === 'reassign'}
        onOpenChange={(o) => !o && setMode(null)}
        title={t('documents.reassign')}
        confirmLabel={t('common.confirm')}
        pending={reassign.isPending}
        onConfirm={(reason) =>
          assignee ? reassign.mutate(reason) : toast.error(t('common.choosePerson'))
        }
      >
        <UserPicker value={assignee} onChange={(id) => setAssignee(id)} testId="reassign-picker" />
      </ReasonDialog>
      <ReasonDialog
        open={mode === 'skip'}
        onOpenChange={(o) => !o && setMode(null)}
        title={t('documents.skip')}
        confirmLabel={t('common.confirm')}
        pending={skip.isPending}
        onConfirm={(reason) => skip.mutate(reason)}
      />
    </li>
  );
}

function RevisionActions({ r, documentId }: { r: Revision; documentId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const refresh = useRefreshDocument();
  const [mode, setMode] = useState<'submit' | 'cancelReview' | 'void' | null>(null);
  const done = (x?: Revision) => {
    if (x) qc.setQueryData(['revision', r.id], x);
    refresh(documentId, r.id);
    setMode(null);
  };
  const cancelReview = useMutation({
    mutationFn: async (reason: string) =>
      unwrap(
        await api.POST('/api/v1/revisions/{id}/cancel-review', {
          params: { path: { id: r.id } },
          body: { version: r.version, reason },
        }),
      ),
    onSuccess: done,
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const voidRev = useMutation({
    mutationFn: async (reason: string) =>
      unwrap(
        await api.POST('/api/v1/revisions/{id}/void', {
          params: { path: { id: r.id } },
          body: { version: r.version, reason },
        }),
      ),
    onSuccess: done,
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  const discard = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/api/v1/revisions/{id}', { params: { path: { id: r.id } } })),
    onSuccess: () => {
      void qc.removeQueries({ queryKey: ['revision', r.id] });
      refresh(documentId);
      router.replace(pathname);
    },
    onError: (e) => toastError(e, t('common.unexpected')),
  });
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        state={r}
        action="submit"
        onClick={() => setMode('submit')}
        data-testid="submit-review"
      >
        <Send /> {t('documents.submit')}
      </ActionButton>
      <ActionButton
        state={r}
        action="cancelReview"
        variant="outline"
        onClick={() => setMode('cancelReview')}
      >
        {t('documents.cancelReview')}
      </ActionButton>
      <ActionButton
        state={r}
        action="discard"
        variant="ghost"
        onClick={() => window.confirm(t('documents.confirmDiscard')) && discard.mutate()}
      >
        <Trash2 /> {t('documents.discard')}
      </ActionButton>
      <ActionButton state={r} action="void" variant="ghost" onClick={() => setMode('void')}>
        {t('documents.void')}
      </ActionButton>
      <SubmitDialog
        revision={r}
        open={mode === 'submit'}
        onOpenChange={(o) => !o && setMode(null)}
        onDone={done}
      />
      <ReasonDialog
        open={mode === 'cancelReview'}
        onOpenChange={(o) => !o && setMode(null)}
        title={t('documents.cancelReview')}
        confirmLabel={t('common.confirm')}
        danger
        pending={cancelReview.isPending}
        onConfirm={(reason) => cancelReview.mutate(reason)}
      />
      <ReasonDialog
        open={mode === 'void'}
        onOpenChange={(o) => !o && setMode(null)}
        title={t('documents.void')}
        description={t('documents.voidHelp')}
        confirmLabel={t('documents.void')}
        danger
        pending={voidRev.isPending}
        onConfirm={(reason) => voidRev.mutate(reason)}
      />
    </div>
  );
}

export function CrsButtons({ revisionId }: { revisionId: string }) {
  const t = useTranslations();
  const get = async (format: 'pdf' | 'xlsx') => {
    try {
      const res = await api.GET('/api/v1/revisions/{id}/crs', {
        params: { path: { id: revisionId }, query: { format } },
        parseAs: 'blob',
      });
      if (!res.response.ok || !res.data) throw new Error('crs');
      saveBlob(res.data as Blob, `CRS.${format}`, res.response.headers.get('content-disposition'));
    } catch (e) {
      toastError(e, t('common.unexpected'));
    }
  };
  return (
    <span className="flex gap-1">
      <Button size="sm" variant="outline" onClick={() => void get('pdf')} data-testid="crs-pdf">
        CRS PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => void get('xlsx')}>
        CRS Excel
      </Button>
    </span>
  );
}
