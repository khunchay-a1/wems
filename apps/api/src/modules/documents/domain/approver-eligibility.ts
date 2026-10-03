import type {
  LicenseBranch,
  LicenseLevel,
  ProjectRole,
  ReviewStepKind,
} from '../../../generated/prisma/enums';

const LEVEL_RANK: Record<LicenseLevel, number> = {
  ASSOCIATE: 1,
  ASSOCIATE_SPECIAL: 1,
  PROFESSIONAL: 2,
  SENIOR: 3,
};

export interface LicenseInfo {
  id: string;
  type: string;
  branch: LicenseBranch;
  level: LicenseLevel;
  /** YYYY-MM-DD */
  expiresAt: string;
  isActive: boolean;
  verified: boolean;
}

export interface LicenseRule {
  requiresLicensedApprover: boolean;
  allowedLicenseBranches: readonly LicenseBranch[];
  minLicenseLevel: LicenseLevel | null;
}

export type LicenseCheck =
  | { ok: true; license: LicenseInfo | null }
  | {
      ok: false;
      code: 'DOC_LICENSE_REQUIRED' | 'DOC_LICENSE_EXPIRED';
      license: LicenseInfo | null;
    };

/** Does this step need a licence check at all (BR-DOC-040)? */
export function needsLicense(
  docType: { requiresLicensedApprover: boolean },
  step: { kind: ReviewStepKind; requiresLicense: boolean },
): boolean {
  return docType.requiresLicensedApprover && step.kind === 'APPROVE' && step.requiresLicense;
}

/**
 * BR-DOC-040: an active, verified ENGINEER licence, not expired on `onDate`, branch allowed,
 * level ≥ minimum (ASSOCIATE = ASSOCIATE_SPECIAL < PROFESSIONAL < SENIOR). Picks the best
 * qualifying licence (latest expiry). When only expired ones qualify otherwise → DOC_LICENSE_EXPIRED.
 */
export function checkLicense(
  rule: LicenseRule,
  licenses: LicenseInfo[],
  onDate: string,
): LicenseCheck {
  const fitting = licenses.filter(
    (l) =>
      l.type === 'ENGINEER' &&
      l.isActive &&
      l.verified &&
      (rule.allowedLicenseBranches.length === 0 ||
        rule.allowedLicenseBranches.includes(l.branch)) &&
      (!rule.minLicenseLevel || LEVEL_RANK[l.level] >= LEVEL_RANK[rule.minLicenseLevel]),
  );
  const valid = fitting
    .filter((l) => l.expiresAt >= onDate)
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
  if (valid[0]) return { ok: true, license: valid[0] };
  if (fitting.length) {
    const latest = [...fitting].sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0]!;
    return { ok: false, code: 'DOC_LICENSE_EXPIRED', license: latest };
  }
  return { ok: false, code: 'DOC_LICENSE_REQUIRED', license: null };
}

export interface Candidate {
  userId: string;
  isActive: boolean;
  permissions: ReadonlySet<string>;
  /** active project role, null = not a member */
  projectRole: ProjectRole | null;
  /** can see the project (member or project.read_all) */
  canAccessProject: boolean;
}

/** BR-DOC-041: who may be the assignee of a step. Returns a reason code or null. */
export function eligibilityError(
  c: Candidate,
  step: { kind: ReviewStepKind; allowedProjectRoles: ProjectRole[] },
): string | null {
  if (!c.isActive || !c.canAccessProject) return 'DOC_ASSIGNEE_NOT_ELIGIBLE';
  const perm = step.kind === 'APPROVE' ? 'document.approve' : 'document.review';
  if (!c.permissions.has(perm)) return 'DOC_ASSIGNEE_NOT_ELIGIBLE';
  if (
    step.allowedProjectRoles.length &&
    (!c.projectRole || !step.allowedProjectRoles.includes(c.projectRole))
  ) {
    return 'DOC_ASSIGNEE_NOT_ELIGIBLE';
  }
  return null;
}

/**
 * BR-DOC-042 separation of duties: the preparer and the uploader of the reviewed PDF may not
 * CHECK or APPROVE; one person may not both CHECK and APPROVE in a cycle.
 */
export function separationErrors(
  assignments: { key: string; kind: ReviewStepKind; assigneeId: string }[],
  authors: string[],
): string[] {
  const bad = new Set<string>();
  for (const a of assignments) {
    if ((a.kind === 'CHECK' || a.kind === 'APPROVE') && authors.includes(a.assigneeId))
      bad.add(a.key);
  }
  const checkers = new Set(assignments.filter((a) => a.kind === 'CHECK').map((a) => a.assigneeId));
  for (const a of assignments) {
    if (a.kind === 'APPROVE' && checkers.has(a.assigneeId)) bad.add(a.key);
  }
  return [...bad];
}
