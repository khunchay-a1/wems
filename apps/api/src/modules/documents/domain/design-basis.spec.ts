import type { DesignBasisStatus } from '../../../generated/prisma/enums';
import {
  assertDesignBasisTransition,
  assertDraft,
  assertNotSelfApproval,
  isDecimalString,
  sourceErrors,
} from './design-basis';

describe('design basis (docs/05-workflows.md §5, BR-DOC-080..083)', () => {
  const ALL: DesignBasisStatus[] = ['DRAFT', 'APPROVED', 'SUPERSEDED'];
  it.each([
    ['approve', 'DRAFT', 'APPROVED'],
    ['supersede', 'APPROVED', 'SUPERSEDED'],
  ] as const)('%s: %s → %s', (action, from, to) => {
    expect(assertDesignBasisTransition(from, action)).toBe(to);
    for (const s of ALL.filter((x) => x !== from)) {
      expect(() => assertDesignBasisTransition(s, action)).toThrow('DBS_NOT_EDITABLE');
    }
  });
  it('BR-DOC-081 only drafts change', () => {
    expect(() => assertDraft('DRAFT')).not.toThrow();
    expect(() => assertDraft('APPROVED')).toThrow('DBS_NOT_EDITABLE');
  });
  it('BR-DOC-082 measured values need a note or lab tests', () => {
    expect(
      sourceErrors([
        { source: 'MEASURED' },
        { source: 'MEASURED', sourceNote: 'lab' },
        { source: 'MEASURED', sampleTestIds: ['x'] },
        { source: 'ASSUMED' },
      ]),
    ).toEqual([{ field: 'items[0].sourceNote', code: 'REQUIRED' }]);
  });
  it('BR-DOC-083 no self-approval', () => {
    expect(() => assertNotSelfApproval('u1', 'u1')).toThrow('DBS_SELF_APPROVAL');
    expect(() => assertNotSelfApproval('u1', 'u2')).not.toThrow();
  });
  it('decimal strings only', () => {
    expect(isDecimalString('250.5')).toBe(true);
    expect(isDecimalString('-0.001')).toBe(true);
    expect(isDecimalString('1e3')).toBe(false);
    expect(isDecimalString(250.5)).toBe(false);
  });
});
