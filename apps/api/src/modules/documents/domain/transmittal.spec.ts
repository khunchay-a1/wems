import type { TransmittalStatus } from '../../../generated/prisma/enums';
import {
  assertTransmittalTransition,
  canTransmittal,
  effectiveDelivery,
  itemProblem,
  linkUsable,
  publicToken,
  rolesFor,
  type TransmittalAction,
} from './transmittal';

const ALL: TransmittalStatus[] = ['DRAFT', 'SENT', 'ACKNOWLEDGED', 'CANCELLED'];

describe('transmittal state machine (docs/05-workflows.md §4)', () => {
  const table: [TransmittalAction, TransmittalStatus, TransmittalStatus][] = [
    ['send', 'DRAFT', 'SENT'],
    ['cancel', 'DRAFT', 'CANCELLED'],
    ['acknowledge', 'SENT', 'ACKNOWLEDGED'],
  ];
  it.each(table)('%s: %s → %s', (action, from, to) => {
    expect(assertTransmittalTransition(from, action)).toBe(to);
  });
  it('BR-DOC-066 every other transition is refused', () => {
    for (const [action, from] of table) {
      for (const s of ALL.filter((x) => x !== from)) expect(canTransmittal(s, action)).toBe(false);
    }
    expect(() => assertTransmittalTransition('SENT', 'cancel')).toThrow();
  });
});

describe('transmittal rules', () => {
  const ok = {
    status: 'APPROVED' as const,
    projectId: 'p',
    confidentiality: 'CLIENT_SHAREABLE' as const,
  };
  it('BR-DOC-060 approved/issued, shareable, same project', () => {
    expect(itemProblem(ok, 'p')).toBeNull();
    expect(itemProblem({ ...ok, status: 'ISSUED' }, 'p')).toBeNull();
    expect(itemProblem({ ...ok, status: 'IN_REVIEW' }, 'p')).toBe('TRN_ITEM_NOT_APPROVED');
    expect(itemProblem({ ...ok, confidentiality: 'INTERNAL' }, 'p')).toBe('DOC_NOT_SHAREABLE');
    expect(itemProblem(ok, 'other')).toBe('NOT_FOUND');
  });
  it('BR-DOC-062 attachments over the limit switch to a link', () => {
    const mb = 1024 * 1024;
    expect(effectiveDelivery('EMAIL_ATTACHMENT', 20 * mb, 20)).toBe('EMAIL_ATTACHMENT');
    expect(effectiveDelivery('EMAIL_ATTACHMENT', 20 * mb + 1, 20)).toBe('EMAIL_LINK');
    expect(effectiveDelivery('HARD_COPY', 500 * mb, 20)).toBe('HARD_COPY');
  });
  it('BR-DOC-065 links work until revoked or expired', () => {
    const now = new Date('2026-10-03T00:00:00Z');
    const base = {
      status: 'SENT' as const,
      linkRevokedAt: null,
      linkExpiresAt: new Date('2026-11-01T00:00:00Z'),
    };
    expect(linkUsable(base, now)).toBe(true);
    expect(linkUsable({ ...base, linkRevokedAt: now }, now)).toBe(false);
    expect(linkUsable({ ...base, linkExpiresAt: now }, now)).toBe(false);
    expect(linkUsable({ ...base, status: 'CANCELLED' }, now)).toBe(false);
  });
  it('public tokens are stable per send and differ between transmittals', () => {
    const key = Buffer.alloc(32, 1).toString('base64');
    expect(publicToken(key, 'a', 't')).toBe(publicToken(key, 'a', 't'));
    expect(publicToken(key, 'a', 't')).not.toBe(publicToken(key, 'b', 't'));
  });
  it('formats map to file roles', () => {
    expect(rolesFor('PDF_AND_NATIVE')).toEqual(['PDF_RENDITION', 'NATIVE']);
    expect(rolesFor('HARD_COPY')).toEqual([]);
  });
});
