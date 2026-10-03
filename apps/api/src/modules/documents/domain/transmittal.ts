import { createHmac } from 'node:crypto';
import type {
  Confidentiality,
  DeliveryMethod,
  RevisionStatus,
  TransmittalFormat,
  TransmittalStatus,
} from '../../../generated/prisma/enums';
import { Problem } from '../../../common/errors/problem';

export type TransmittalAction = 'send' | 'cancel' | 'acknowledge';

/** docs/05-workflows.md §4. */
export const TRANSMITTAL_TRANSITIONS: Record<
  TransmittalAction,
  { from: TransmittalStatus[]; to: TransmittalStatus }
> = {
  send: { from: ['DRAFT'], to: 'SENT' },
  cancel: { from: ['DRAFT'], to: 'CANCELLED' },
  acknowledge: { from: ['SENT'], to: 'ACKNOWLEDGED' },
};

export function canTransmittal(status: TransmittalStatus, action: TransmittalAction): boolean {
  return TRANSMITTAL_TRANSITIONS[action].from.includes(status);
}

export function assertTransmittalTransition(
  status: TransmittalStatus,
  action: TransmittalAction,
): TransmittalStatus {
  if (!canTransmittal(status, action)) {
    throw new Problem(status === 'DRAFT' ? 'INVALID_STATE_TRANSITION' : 'TRN_NOT_EDITABLE', {
      rule: 'BR-DOC-066',
      extra: { status, action },
    });
  }
  return TRANSMITTAL_TRANSITIONS[action].to;
}

/** SENT/ACKNOWLEDGED transmittals are frozen (BR-DOC-066). */
export function assertEditable(status: TransmittalStatus): void {
  if (status !== 'DRAFT') throw new Problem('TRN_NOT_EDITABLE', { rule: 'BR-DOC-066' });
}

/** BR-DOC-060: why a revision cannot be transmitted (null = it can). */
export function itemProblem(
  rev: { status: RevisionStatus; projectId: string; confidentiality: Confidentiality },
  projectId: string,
): 'TRN_ITEM_NOT_APPROVED' | 'DOC_NOT_SHAREABLE' | 'NOT_FOUND' | null {
  if (rev.projectId !== projectId) return 'NOT_FOUND';
  if (rev.status !== 'APPROVED' && rev.status !== 'ISSUED') return 'TRN_ITEM_NOT_APPROVED';
  if (rev.confidentiality !== 'CLIENT_SHAREABLE') return 'DOC_NOT_SHAREABLE';
  return null;
}

/** Which document file roles go out for a format. */
export function rolesFor(format: TransmittalFormat): ('PDF_RENDITION' | 'NATIVE')[] {
  switch (format) {
    case 'PDF':
      return ['PDF_RENDITION'];
    case 'NATIVE':
      return ['NATIVE'];
    case 'PDF_AND_NATIVE':
      return ['PDF_RENDITION', 'NATIVE'];
    case 'HARD_COPY':
      return [];
  }
}

/**
 * BR-DOC-062: attachments only while the total stays within the limit, otherwise a download link.
 * Returns the method actually used.
 */
export function effectiveDelivery(
  method: DeliveryMethod,
  totalBytes: number,
  maxAttachmentMb: number,
): DeliveryMethod {
  if (method === 'EMAIL_ATTACHMENT' && totalBytes > maxAttachmentMb * 1024 * 1024) {
    return 'EMAIL_LINK';
  }
  return method;
}

export const isEmail = (m: DeliveryMethod): boolean =>
  m === 'EMAIL_ATTACHMENT' || m === 'EMAIL_LINK';

/**
 * Public link token: HMAC of the transmittal id and send time with the server key, so staff can
 * show the link again while the database keeps only its SHA-256 (BR-DOC-065).
 */
export function publicToken(keyBase64: string, transmittalId: string, sentAtIso: string): string {
  return createHmac('sha256', Buffer.from(keyBase64, 'base64'))
    .update(`transmittal-link:${transmittalId}:${sentAtIso}`)
    .digest('base64url');
}

/** BR-DOC-065: a link works only while not revoked and not expired. */
export function linkUsable(
  t: { linkRevokedAt: Date | null; linkExpiresAt: Date | null; status: TransmittalStatus },
  now: Date,
): boolean {
  if (t.status !== 'SENT' && t.status !== 'ACKNOWLEDGED') return false;
  if (t.linkRevokedAt) return false;
  return !!t.linkExpiresAt && t.linkExpiresAt > now;
}
