import type { ReviewStepKind } from '../../../generated/prisma/enums';

export interface TemplateStepInput {
  stepOrder: number;
  kind: ReviewStepKind;
  requiresLicense?: boolean;
  isOptional?: boolean;
}

/**
 * Workflow template shape (M04 §5, BR-DOC-031): groups numbered 1..n without gaps (same
 * stepOrder = parallel), at least one non-optional APPROVE step, and licence checks only on
 * APPROVE steps.
 */
export function templateStepErrors(steps: TemplateStepInput[]): { field: string; code: string }[] {
  const errors: { field: string; code: string }[] = [];
  const orders = [...new Set(steps.map((s) => s.stepOrder))].sort((a, b) => a - b);
  if (orders.some((o, i) => o !== i + 1)) errors.push({ field: 'steps', code: 'STEP_ORDER_GAP' });
  if (!steps.some((s) => s.kind === 'APPROVE' && !s.isOptional)) {
    errors.push({ field: 'steps', code: 'APPROVE_STEP_REQUIRED' });
  }
  steps.forEach((s, i) => {
    if (s.requiresLicense && s.kind !== 'APPROVE') {
      errors.push({ field: `steps[${i}].requiresLicense`, code: 'ONLY_FOR_APPROVE' });
    }
  });
  return errors;
}
