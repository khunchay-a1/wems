import type { CommentStatus } from '../../../generated/prisma/enums';
import { Problem } from '../../../common/errors/problem';

export type CommentAction = 'respond' | 'close' | 'reopen' | 'carryOver';

/** Review comment transitions — docs/05-workflows.md §3 (NONE has no workflow). */
export const COMMENT_TRANSITIONS: Record<
  CommentAction,
  { from: CommentStatus[]; to: CommentStatus }
> = {
  respond: { from: ['OPEN'], to: 'RESPONDED' },
  close: { from: ['OPEN', 'RESPONDED'], to: 'CLOSED' },
  reopen: { from: ['RESPONDED'], to: 'OPEN' },
  /** BR-DOC-034: the old comment closes when copied into a new revision */
  carryOver: { from: ['OPEN', 'RESPONDED'], to: 'CLOSED' },
};

export function canComment(status: CommentStatus, action: CommentAction): boolean {
  return COMMENT_TRANSITIONS[action].from.includes(status);
}

export function assertCommentTransition(
  status: CommentStatus,
  action: CommentAction,
): CommentStatus {
  if (!canComment(status, action)) {
    throw new Problem('INVALID_STATE_TRANSITION', { extra: { status, action } });
  }
  return COMMENT_TRANSITIONS[action].to;
}
