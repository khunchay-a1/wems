import type { DesignBasisStatus, DesignValueSource } from '../../../generated/prisma/enums';
import { Problem } from '../../../common/errors/problem';
import type { FieldError } from '../../../common/errors/problem';

/** docs/05-workflows.md §5: DRAFT → APPROVED → SUPERSEDED (by the next approved revNo). */
export const DESIGN_BASIS_TRANSITIONS = {
  approve: { from: ['DRAFT'] as DesignBasisStatus[], to: 'APPROVED' as DesignBasisStatus },
  supersede: { from: ['APPROVED'] as DesignBasisStatus[], to: 'SUPERSEDED' as DesignBasisStatus },
};

export type DesignBasisAction = keyof typeof DESIGN_BASIS_TRANSITIONS;

export function assertDesignBasisTransition(
  status: DesignBasisStatus,
  action: DesignBasisAction,
): DesignBasisStatus {
  const t = DESIGN_BASIS_TRANSITIONS[action];
  if (!t.from.includes(status)) {
    throw new Problem('DBS_NOT_EDITABLE', { rule: 'BR-DOC-081', extra: { status, action } });
  }
  return t.to;
}

/** BR-DOC-081: only DRAFT revisions change. */
export function assertDraft(status: DesignBasisStatus): void {
  if (status !== 'DRAFT') throw new Problem('DBS_NOT_EDITABLE', { rule: 'BR-DOC-081' });
}

/** BR-DOC-082: MEASURED values must say where they come from (lab tests or a note). */
export function sourceErrors(
  items: { source: DesignValueSource; sourceNote?: string | null; sampleTestIds?: string[] }[],
): FieldError[] {
  return items.flatMap((i, n) =>
    i.source === 'MEASURED' && !i.sourceNote?.trim() && !i.sampleTestIds?.length
      ? [{ field: `items[${n}].sourceNote`, code: 'REQUIRED' }]
      : [],
  );
}

/** BR-DOC-083: the approver cannot approve the revision they created. */
export function assertNotSelfApproval(createdById: string | null, approverId: string): void {
  if (createdById && createdById === approverId) {
    throw new Problem('DBS_SELF_APPROVAL', { rule: 'BR-DOC-083' });
  }
}

const DECIMAL = /^-?\d{1,14}(\.\d{1,10})?$/;

/** Decimal strings only (CLAUDE.md rule 6) — no floats on the way in. */
export function isDecimalString(v: unknown): v is string {
  return typeof v === 'string' && DECIMAL.test(v.trim());
}
