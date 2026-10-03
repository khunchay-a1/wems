import type { ReviewStepStatus } from '../../../generated/prisma/enums';
import { Problem } from '../../../common/errors/problem';

export type Decision = 'APPROVED' | 'APPROVED_WITH_COMMENTS' | 'REJECTED';
export type StepAction = 'activate' | 'decide' | 'skip' | 'cancel' | 'reassign';

/** Review step transitions — docs/05-workflows.md §2. */
export const STEP_FROM: Record<StepAction, ReviewStepStatus[]> = {
  activate: ['PENDING'],
  decide: ['ACTIVE'],
  skip: ['PENDING', 'ACTIVE'],
  cancel: ['PENDING', 'ACTIVE'],
  reassign: ['PENDING', 'ACTIVE'],
};

export function canStep(status: ReviewStepStatus, action: StepAction): boolean {
  return STEP_FROM[action].includes(status);
}

export function assertStepTransition(
  step: { status: ReviewStepStatus; isOptional: boolean },
  action: StepAction,
  decision?: Decision,
): ReviewStepStatus {
  if (!canStep(step.status, action)) {
    throw new Problem('DOC_STEP_NOT_ACTIVE', { extra: { status: step.status, action } });
  }
  switch (action) {
    case 'activate':
      return 'ACTIVE';
    case 'decide':
      return decision!;
    case 'skip':
      if (!step.isOptional) throw new Problem('DOC_STEP_NOT_OPTIONAL');
      return 'SKIPPED';
    case 'cancel':
      return 'CANCELLED';
    case 'reassign':
      return step.status;
  }
}

const DONE: ReviewStepStatus[] = ['APPROVED', 'APPROVED_WITH_COMMENTS', 'SKIPPED'];

export interface CycleStep {
  id: string;
  stepOrder: number;
  status: ReviewStepStatus;
}

/**
 * BR-DOC-031/032 cycle progression: any REJECTED → cycle REJECTED; the lowest group that is not
 * done is the current one and its PENDING steps become ACTIVE; no such group → cycle APPROVED.
 */
export function advanceCycle(steps: CycleStep[]): {
  outcome: 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';
  activate: string[];
  cancel: string[];
} {
  const open = steps.filter((s) => s.status === 'PENDING' || s.status === 'ACTIVE');
  if (steps.some((s) => s.status === 'REJECTED')) {
    return { outcome: 'REJECTED', activate: [], cancel: open.map((s) => s.id) };
  }
  const groups = [...new Set(steps.map((s) => s.stepOrder))].sort((a, b) => a - b);
  for (const g of groups) {
    const inGroup = steps.filter((s) => s.stepOrder === g);
    if (inGroup.every((s) => DONE.includes(s.status))) continue;
    return {
      outcome: 'IN_PROGRESS',
      activate: inGroup.filter((s) => s.status === 'PENDING').map((s) => s.id),
      cancel: [],
    };
  }
  return { outcome: 'APPROVED', activate: [], cancel: [] };
}
