import type { ProjectStatus } from '../../../generated/prisma/enums';
import { Problem } from '../../../common/errors/problem';

/** Project actions (docs/05-workflows.md §6). */
export type ProjectAction =
  'start' | 'hold' | 'resume' | 'complete' | 'close' | 'reopen' | 'cancel';

/** Allowed transitions — one row per arrow of the diagram in docs/05-workflows.md §6. */
export const PROJECT_TRANSITIONS: Record<
  ProjectAction,
  { from: ProjectStatus[]; to: ProjectStatus }
> = {
  start: { from: ['PLANNING'], to: 'ACTIVE' },
  hold: { from: ['ACTIVE'], to: 'ON_HOLD' },
  resume: { from: ['ON_HOLD'], to: 'ACTIVE' },
  complete: { from: ['ACTIVE'], to: 'COMPLETED' },
  close: { from: ['COMPLETED'], to: 'CLOSED' },
  reopen: { from: ['CLOSED'], to: 'ACTIVE' },
  cancel: { from: ['PLANNING', 'ACTIVE', 'ON_HOLD'], to: 'CANCELLED' },
};

export const PROJECT_ACTIONS = Object.keys(PROJECT_TRANSITIONS) as ProjectAction[];

/** reopen and cancel require a reason (docs/05-workflows.md §6). */
export const REASON_REQUIRED: ReadonlySet<ProjectAction> = new Set(['reopen', 'cancel']);

export function canTransition(status: ProjectStatus, action: ProjectAction): boolean {
  return PROJECT_TRANSITIONS[action].from.includes(status);
}

export function assertTransition(status: ProjectStatus, action: ProjectAction): ProjectStatus {
  if (!canTransition(status, action)) {
    throw new Problem('INVALID_STATE_TRANSITION', { extra: { status, action } });
  }
  return PROJECT_TRANSITIONS[action].to;
}

/**
 * BR-PRJ-020 effect of the project status on documents:
 * ON_HOLD/COMPLETED → no new revisions or submissions; CLOSED/CANCELLED → read-only.
 */
export function documentsEditable(status: ProjectStatus): boolean {
  return status === 'PLANNING' || status === 'ACTIVE';
}

export function projectReadOnly(status: ProjectStatus): boolean {
  return status === 'CLOSED' || status === 'CANCELLED';
}

/** As-built transmittals are still allowed in COMPLETED (BR-PRJ-020). */
export function transmittalsAllowed(status: ProjectStatus): boolean {
  return status === 'PLANNING' || status === 'ACTIVE' || status === 'COMPLETED';
}
