import { templateStepErrors } from './workflow-template';

describe('BR-DOC-031 workflow template shape', () => {
  it('accepts parallel CHECK steps followed by APPROVE', () => {
    expect(
      templateStepErrors([
        { stepOrder: 1, kind: 'CHECK' },
        { stepOrder: 1, kind: 'CHECK' },
        { stepOrder: 2, kind: 'REVIEW' },
        { stepOrder: 3, kind: 'APPROVE', requiresLicense: true },
      ]),
    ).toEqual([]);
  });

  it('rejects gaps in the group numbers', () => {
    expect(
      templateStepErrors([
        { stepOrder: 1, kind: 'CHECK' },
        { stepOrder: 3, kind: 'APPROVE' },
      ]),
    ).toEqual([{ field: 'steps', code: 'STEP_ORDER_GAP' }]);
  });

  it('needs a mandatory APPROVE step and licence only on APPROVE', () => {
    expect(
      templateStepErrors([
        { stepOrder: 1, kind: 'CHECK', requiresLicense: true },
        { stepOrder: 2, kind: 'APPROVE', isOptional: true },
      ]),
    ).toEqual([
      { field: 'steps', code: 'APPROVE_STEP_REQUIRED' },
      { field: 'steps[0].requiresLicense', code: 'ONLY_FOR_APPROVE' },
    ]);
  });
});
