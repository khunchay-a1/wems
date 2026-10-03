'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCheck, MessageSquarePlus, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PdfViewer, type ViewerAnchor, type ViewerMark } from '@/components/pdf-viewer';
import { ProblemAlert } from '@/components/problem-alert';
import { type SignatureInput, SignatureDialog } from '@/components/signature-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type Comment,
  type ReviewStep,
  revisionDownloadUrl,
  useComments,
  useRefreshDocument,
  useRevision,
} from '@/features/documents/api';
import {
  CommentCard,
  CommentComposer,
  type CommentFilter,
  CommentFilterSelect,
  filterComments,
} from '@/features/documents/comment-panel';
import { CrsButtons } from '@/features/documents/revision-panel';
import { api, newIdempotencyKey, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/hooks/use-format';

type Decision = 'APPROVED' | 'APPROVED_WITH_COMMENTS' | 'REJECTED';

const tone = (c: Comment): ViewerMark['tone'] =>
  c.status === 'OPEN'
    ? 'open'
    : c.status === 'RESPONDED'
      ? 'responded'
      : c.status === 'CLOSED'
        ? 'closed'
        : 'note';

/** Full-screen review (docs/07-web-ui.md §6.5). */
export default function ReviewPage() {
  const { id: projectId, docId, revId } = useParams<{ id: string; docId: string; revId: string }>();
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const { me } = useAuth();
  const rev = useRevision(revId);
  const comments = useComments(revId);
  const [page, setPage] = useState(1);
  const [addMode, setAddMode] = useState(false);
  const [composer, setComposer] = useState<{ anchor: ViewerAnchor | null } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<CommentFilter>('all');
  const [decision, setDecision] = useState<Decision | null>(null);

  const hasPdf = !!rev.data?.files.some(
    (x) => x.role === 'PDF_RENDITION' && x.isCurrent && x.file.status === 'AVAILABLE',
  );
  const pdfUrl = useQuery({
    queryKey: ['pdf-url', revId, rev.data?.version],
    enabled: hasPdf,
    staleTime: 4 * 60_000,
    queryFn: () => revisionDownloadUrl(revId, { fileRole: 'PDF_RENDITION' }),
  });

  const myStep: ReviewStep | undefined = rev.data?.cycles
    .find((c) => c.status === 'IN_PROGRESS')
    ?.steps.find((s) => s.allowedActions.includes('decide'));
  const list = useMemo(
    () => filterComments(comments.data ?? [], filter, me.id),
    [comments.data, filter, me.id],
  );
  const marks = useMemo<ViewerMark[]>(
    () =>
      list
        .filter((c) => c.anchor)
        .map((c) => ({
          id: c.id,
          label: String(c.seq),
          anchor: c.anchor!,
          tone: tone(c),
          active: c.id === selected,
        })),
    [list, selected],
  );

  // keyboard: C add comment, J/K next/previous comment, ←/→ pages (docs/07-web-ui.md §6.5)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
      if (e.key === 'c' || e.key === 'C') setAddMode((m) => !m);
      else if (e.key === 'ArrowRight') setPage((p) => p + 1);
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1));
      else if (e.key === 'j' || e.key === 'k') {
        if (!list.length) return;
        const i = list.findIndex((c) => c.id === selected);
        const next = list[(i + (e.key === 'j' ? 1 : -1) + list.length) % list.length]!;
        setSelected(next.id);
        if (next.anchor) setPage(next.anchor.page);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list, selected]);

  if (!rev.data) {
    return rev.error ? (
      <ProblemAlert error={rev.error} />
    ) : (
      <Skeleton className="h-[80vh] w-full" />
    );
  }
  const r = rev.data;
  const canComment =
    r.allowedActions.includes('comment') && !['VOID', 'SUPERSEDED'].includes(r.status);
  const back = `/projects/${projectId}/documents/${docId}?rev=${revId}`;

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <Link
          href={back}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t('common.back')}
        </Link>
        <span className="font-mono text-sm">{r.documentNumber}</span>
        <span className="font-semibold">Rev.{r.revLabel}</span>
        <StatusBadge enumName="RevisionStatus" value={r.status} />
        <span className="hidden truncate text-sm text-muted md:inline">{r.documentTitle}</span>
        {myStep ? (
          <span className="ml-auto text-sm" data-testid="my-step">
            {t('review.myStep', { name: myStep.name })}
            {myStep.dueAt ? ` · ${t('documents.dueAt', { date: f.dateTime(myStep.dueAt) })}` : ''}
          </span>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {pdfUrl.data ? (
            <PdfViewer
              url={pdfUrl.data}
              page={page}
              onPageChange={setPage}
              marks={marks}
              addMode={addMode}
              onAdd={(anchor) => {
                setComposer({ anchor });
                setAddMode(false);
              }}
              onSelect={setSelected}
            />
          ) : (
            <div className="p-6 text-sm text-muted">
              {hasPdf ? <Skeleton className="h-[70vh] w-full" /> : t('review.noPdf')}
            </div>
          )}
        </div>
        <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">{t('review.comments')}</span>
            <CommentFilterSelect value={filter} onChange={setFilter} />
            {canComment ? (
              <span className="ml-auto flex gap-1">
                <Button
                  size="sm"
                  variant={addMode ? 'default' : 'outline'}
                  onClick={() => setAddMode(!addMode)}
                  title={t('review.addOnPdf')}
                  data-testid="add-mode"
                >
                  <MessageSquarePlus />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setComposer({ anchor: null })}
                  data-testid="add-general"
                >
                  {t('review.general')}
                </Button>
              </span>
            ) : null}
          </div>
          {composer ? (
            <CommentComposer
              revisionId={revId}
              documentId={docId}
              anchor={composer.anchor}
              reviewStepId={myStep?.id ?? null}
              onDone={(c) => {
                setComposer(null);
                setSelected(c.id);
              }}
              onCancel={() => setComposer(null)}
            />
          ) : null}
          <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="comment-list">
            {list.map((c) => (
              <CommentCard
                key={c.id}
                c={c}
                revisionId={revId}
                documentId={docId}
                active={c.id === selected}
                onSelect={() => {
                  setSelected(c.id);
                  if (c.anchor) setPage(c.anchor.page);
                }}
              />
            ))}
            {!list.length && !comments.isLoading ? (
              <li className="p-6 text-center text-sm text-muted">{t('review.noComments')}</li>
            ) : null}
          </ul>
          {r.commentCount ? (
            <div className="border-t border-border px-3 py-2">
              <CrsButtons revisionId={revId} />
            </div>
          ) : null}
          {myStep ? (
            <div className="grid grid-cols-3 gap-2 border-t border-border p-3">
              <Button
                variant="danger"
                onClick={() => setDecision('REJECTED')}
                data-testid="decide-REJECTED"
              >
                <Undo2 /> {t('review.reject')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setDecision('APPROVED_WITH_COMMENTS')}
                data-testid="decide-APPROVED_WITH_COMMENTS"
              >
                <Check /> {t('review.approveWithComments')}
              </Button>
              <Button onClick={() => setDecision('APPROVED')} data-testid="decide-APPROVED">
                <CheckCheck /> {t('review.approve')}
              </Button>
            </div>
          ) : null}
        </aside>
      </div>
      {myStep && decision ? (
        <DecisionFlow
          step={myStep}
          decision={decision}
          lines={[`${r.documentNumber} Rev.${r.revLabel} (${r.purposeCode})`, r.documentTitle]}
          onClose={() => setDecision(null)}
          onDone={() => {
            setDecision(null);
            router.push(back);
          }}
          revisionId={revId}
          documentId={docId}
        />
      ) : null}
    </div>
  );
}

/** Note → (signature if the step requires it) → POST decision with an Idempotency-Key. */
function DecisionFlow({
  step,
  decision,
  lines,
  onClose,
  onDone,
  revisionId,
  documentId,
}: {
  step: ReviewStep;
  decision: Decision;
  lines: string[];
  onClose: () => void;
  onDone: () => void;
  revisionId: string;
  documentId: string;
}) {
  const t = useTranslations();
  const refresh = useRefreshDocument();
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const decide = useMutation({
    mutationFn: async (signature?: SignatureInput) =>
      unwrap(
        await api.POST('/api/v1/review-steps/{id}/decision', {
          params: { path: { id: step.id } },
          headers: { 'Idempotency-Key': signature ? newIdempotencyKey() : key },
          body: { version: step.version, decision, note: note || undefined, signature },
        }),
      ),
    onSuccess: () => {
      toast.success(t(`review.done.${decision}`));
      refresh(documentId, revisionId);
      onDone();
    },
  });
  const label = t(
    `review.${decision === 'REJECTED' ? 'reject' : decision === 'APPROVED' ? 'approve' : 'approveWithComments'}`,
  );
  return (
    <>
      <Dialog open={!signing} onOpenChange={(o) => !o && onClose()}>
        <DialogContent title={label} description={lines.join(' · ')}>
          <div className="space-y-3">
            <ProblemAlert error={decide.error} />
            <div className="space-y-1.5">
              <Label htmlFor="decision-note">{t('review.note')}</Label>
              <Textarea
                id="decision-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid="decision-note"
              />
              {decision === 'REJECTED' ? (
                <p className="text-xs text-muted">{t('review.rejectHint')}</p>
              ) : null}
              {decision === 'APPROVED_WITH_COMMENTS' ? (
                <p className="text-xs text-muted">{t('review.withCommentsHint')}</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={decision === 'REJECTED' ? 'danger' : 'default'}
              disabled={decide.isPending}
              onClick={() => (step.requiresSignature ? setSigning(true) : decide.mutate(undefined))}
              data-testid="decision-confirm"
            >
              {label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SignatureDialog
        open={signing}
        onOpenChange={(o) => !o && setSigning(false)}
        title={t('signature.title')}
        lines={[...lines, `${step.name}: ${label}`]}
        confirmLabel={t('signature.sign')}
        pending={decide.isPending}
        error={decide.error}
        showLicense={step.requiresLicense}
        onSign={(s) => decide.mutate(s)}
      />
    </>
  );
}
