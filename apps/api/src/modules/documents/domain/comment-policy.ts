import type { CommentStatus, ReviewStepStatus } from '../../../generated/prisma/enums';
import { canComment } from './comment-state-machine';

/** Facts about one top-level comment and the acting user (pure input for the policy). */
export interface CommentFacts {
  status: CommentStatus;
  isAuthor: boolean;
  /** status of the review step a review comment belongs to (null for general comments) */
  stepStatus: ReviewStepStatus | null;
  /** owner (revision) accepts changes — false for VOID/SUPERSEDED revisions */
  ownerOpen: boolean;
  /** revision preparer / document owner / holder of document.edit (may answer) */
  canAnswer: boolean;
  isDocumentAdmin: boolean;
}

export interface CommentActions {
  allowed: string[];
  blocked: { action: string; code: string }[];
}

/**
 * docs/05-workflows.md §3 + M04 §10: authors edit/delete until their step decides; the preparer
 * answers OPEN comments; the comment author (or document.admin) closes or reopens.
 */
export function commentActions(f: CommentFacts): CommentActions {
  const allowed: string[] = [];
  const blocked: { action: string; code: string }[] = [];
  if (!f.ownerOpen) return { allowed, blocked };
  allowed.push('reply');
  if (f.isAuthor) {
    if (isEditable(f)) allowed.push('edit', 'delete');
    else blocked.push({ action: 'edit', code: 'DOC_COMMENT_NOT_EDITABLE' });
  }
  if (f.status === 'NONE') return { allowed, blocked };
  if (f.canAnswer && canComment(f.status, 'respond')) allowed.push('respond');
  const manages = f.isAuthor || f.isDocumentAdmin;
  if (manages && canComment(f.status, 'close')) allowed.push('close');
  if (manages && canComment(f.status, 'reopen')) allowed.push('reopen');
  return { allowed, blocked };
}

/** A review comment is frozen once its step has decided (or the comment moved on from OPEN). */
export function isEditable(f: Pick<CommentFacts, 'status' | 'stepStatus'>): boolean {
  if (f.status === 'NONE') return true;
  return f.status === 'OPEN' && f.stepStatus === 'ACTIVE';
}

/** RECT anchors need a size; PIN anchors must not carry one. */
export function validAnchor(a: {
  kind: 'PIN' | 'RECT';
  x: number;
  y: number;
  w?: number;
  h?: number;
}): boolean {
  if (a.kind === 'PIN') return a.w === undefined && a.h === undefined;
  const eps = 1e-9; // float rounding from the client's pixel → 0..1 conversion
  return (
    a.w !== undefined &&
    a.h !== undefined &&
    a.w > 0 &&
    a.h > 0 &&
    a.x + a.w <= 1 + eps &&
    a.y + a.h <= 1 + eps
  );
}
