import {
  type Candidate,
  checkLicense,
  eligibilityError,
  type LicenseInfo,
  needsLicense,
  separationErrors,
} from './approver-eligibility';

const lic = (p: Partial<LicenseInfo>): LicenseInfo => ({
  id: 'l1',
  type: 'ENGINEER',
  branch: 'CIVIL',
  level: 'PROFESSIONAL',
  expiresAt: '2027-01-01',
  isActive: true,
  verified: true,
  ...p,
});
const rule = {
  requiresLicensedApprover: true,
  allowedLicenseBranches: [],
  minLicenseLevel: null,
} as const;

describe('BR-DOC-040 licensed approver', () => {
  it('applies to APPROVE steps that require a licence on licensed document types', () => {
    expect(
      needsLicense({ requiresLicensedApprover: true }, { kind: 'APPROVE', requiresLicense: true }),
    ).toBe(true);
    expect(
      needsLicense({ requiresLicensedApprover: true }, { kind: 'CHECK', requiresLicense: true }),
    ).toBe(false);
    expect(
      needsLicense({ requiresLicensedApprover: false }, { kind: 'APPROVE', requiresLicense: true }),
    ).toBe(false);
  });

  it('accepts a verified, valid licence', () => {
    expect(checkLicense(rule, [lic({})], '2026-10-03')).toMatchObject({
      ok: true,
      license: { id: 'l1' },
    });
  });

  it('AT-DOC-08 a licence that expired yesterday → DOC_LICENSE_EXPIRED', () => {
    expect(checkLicense(rule, [lic({ expiresAt: '2026-10-02' })], '2026-10-03')).toMatchObject({
      ok: false,
      code: 'DOC_LICENSE_EXPIRED',
    });
    // still valid on the expiry day itself
    expect(checkLicense(rule, [lic({ expiresAt: '2026-10-03' })], '2026-10-03').ok).toBe(true);
  });

  it('unverified, inactive or non-engineer licences do not count (BR-PLT-004)', () => {
    for (const l of [
      lic({ verified: false }),
      lic({ isActive: false }),
      lic({ type: 'ARCHITECT' }),
    ]) {
      expect(checkLicense(rule, [l], '2026-10-03')).toMatchObject({
        ok: false,
        code: 'DOC_LICENSE_REQUIRED',
      });
    }
  });

  it('branch and minimum level (ASSOCIATE = ASSOCIATE_SPECIAL < PROFESSIONAL < SENIOR)', () => {
    const r = {
      requiresLicensedApprover: true,
      allowedLicenseBranches: ['ENVIRONMENTAL' as const],
      minLicenseLevel: 'PROFESSIONAL' as const,
    };
    expect(checkLicense(r, [lic({ branch: 'CIVIL' })], '2026-10-03').ok).toBe(false);
    expect(
      checkLicense(r, [lic({ branch: 'ENVIRONMENTAL', level: 'ASSOCIATE_SPECIAL' })], '2026-10-03')
        .ok,
    ).toBe(false);
    expect(
      checkLicense(r, [lic({ branch: 'ENVIRONMENTAL', level: 'SENIOR' })], '2026-10-03').ok,
    ).toBe(true);
    const assoc = { ...r, minLicenseLevel: 'ASSOCIATE_SPECIAL' as const };
    expect(
      checkLicense(assoc, [lic({ branch: 'ENVIRONMENTAL', level: 'ASSOCIATE' })], '2026-10-03').ok,
    ).toBe(true);
  });
});

describe('BR-DOC-041 assignee eligibility', () => {
  const c = (p: Partial<Candidate>): Candidate => ({
    userId: 'u',
    isActive: true,
    permissions: new Set(['document.review', 'document.approve']),
    projectRole: 'ENGINEER',
    canAccessProject: true,
    ...p,
  });
  it('needs access, the permission of the step kind and an allowed project role', () => {
    const check = { kind: 'CHECK' as const, allowedProjectRoles: ['ENGINEER' as const] };
    expect(eligibilityError(c({}), check)).toBeNull();
    expect(eligibilityError(c({ isActive: false }), check)).toBe('DOC_ASSIGNEE_NOT_ELIGIBLE');
    expect(eligibilityError(c({ canAccessProject: false }), check)).toBe(
      'DOC_ASSIGNEE_NOT_ELIGIBLE',
    );
    expect(eligibilityError(c({ projectRole: 'DRAFTER' }), check)).toBe(
      'DOC_ASSIGNEE_NOT_ELIGIBLE',
    );
    expect(
      eligibilityError(c({ permissions: new Set(['document.review']) }), {
        kind: 'APPROVE',
        allowedProjectRoles: [],
      }),
    ).toBe('DOC_ASSIGNEE_NOT_ELIGIBLE');
    expect(
      eligibilityError(c({ projectRole: null }), { kind: 'REVIEW', allowedProjectRoles: [] }),
    ).toBeNull();
  });
});

describe('BR-DOC-042 separation of duties', () => {
  it('AT-DOC-04 the preparer cannot check or approve; one person cannot check and approve', () => {
    expect(
      separationErrors(
        [
          { key: 's1', kind: 'CHECK', assigneeId: 'author' },
          { key: 's2', kind: 'REVIEW', assigneeId: 'author' },
          { key: 's3', kind: 'APPROVE', assigneeId: 'x' },
        ],
        ['author'],
      ),
    ).toEqual(['s1']);
    expect(
      separationErrors(
        [
          { key: 's1', kind: 'CHECK', assigneeId: 'x' },
          { key: 's2', kind: 'APPROVE', assigneeId: 'x' },
        ],
        ['author'],
      ),
    ).toEqual(['s2']);
  });
});
