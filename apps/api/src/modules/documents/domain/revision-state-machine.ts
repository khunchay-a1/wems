import type { RevisionStatus } from '../../../generated/prisma/enums';
import { Problem } from '../../../common/errors/problem';

/** Revision actions — one per row of docs/05-workflows.md §1 (system actions included). */
export type RevisionAction =
  | 'upload'
  | 'edit'
  | 'discard'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'cancelReview'
  | 'issue'
  | 'supersede'
  | 'void';

export const REVISION_TRANSITIONS: Record<
  RevisionAction,
  { from: RevisionStatus[]; to: RevisionStatus | null }
> = {
  upload: { from: ['DRAFT'], to: 'DRAFT' },
  edit: { from: ['DRAFT'], to: 'DRAFT' },
  /** null = the row is deleted (BR-DOC-025) */
  discard: { from: ['DRAFT'], to: null },
  submit: { from: ['DRAFT'], to: 'IN_REVIEW' },
  approve: { from: ['IN_REVIEW'], to: 'APPROVED' },
  reject: { from: ['IN_REVIEW'], to: 'DRAFT' },
  cancelReview: { from: ['IN_REVIEW'], to: 'DRAFT' },
  issue: { from: ['APPROVED'], to: 'ISSUED' },
  supersede: { from: ['APPROVED', 'ISSUED'], to: 'SUPERSEDED' },
  void: { from: ['DRAFT', 'APPROVED', 'ISSUED'], to: 'VOID' },
};

export function canRevision(status: RevisionStatus, action: RevisionAction): boolean {
  return REVISION_TRANSITIONS[action].from.includes(status);
}

export function assertRevisionTransition(
  status: RevisionStatus,
  action: RevisionAction,
): RevisionStatus | null {
  if (!canRevision(status, action)) {
    if (action === 'upload' || action === 'edit') {
      throw new Problem('DOC_REVISION_LOCKED', { rule: 'BR-DOC-026' });
    }
    throw new Problem('INVALID_STATE_TRANSITION', { extra: { status, action } });
  }
  return REVISION_TRANSITIONS[action].to;
}

/** BR-DOC-021: one revision in DRAFT or IN_REVIEW at a time. */
export function isInProgress(status: RevisionStatus): boolean {
  return status === 'DRAFT' || status === 'IN_REVIEW';
}

/** Approved revisions usable on site ("ฉบับใช้งาน"). */
export function isApprovedLike(status: RevisionStatus): boolean {
  return status === 'APPROVED' || status === 'ISSUED';
}

/** BR-DOC-025: discard only drafts never submitted and without comments. */
export function canDiscard(r: {
  status: RevisionStatus;
  cycles: number;
  comments: number;
}): boolean {
  return r.status === 'DRAFT' && r.cycles === 0 && r.comments === 0;
}
