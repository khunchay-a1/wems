/** Semantic colour per enum value (docs/07-web-ui.md §3). */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

const TONES: Record<string, Tone> = {
  DRAFT: 'neutral',
  PENDING: 'neutral',
  NOT_STARTED: 'neutral',
  PLANNING: 'neutral',
  PENDING_UPLOAD: 'neutral',
  NONE: 'neutral',
  IN_REVIEW: 'info',
  ACTIVE: 'info',
  IN_PROGRESS: 'info',
  SENT: 'info',
  SUBMITTED: 'info',
  PROCESSING: 'info',
  OPEN: 'warning',
  APPROVED: 'success',
  ISSUED: 'success',
  ACKNOWLEDGED: 'success',
  PASS: 'success',
  CLOSED: 'success',
  COMPLETED: 'success',
  AVAILABLE: 'success',
  CODE_1: 'success',
  APPROVED_WITH_COMMENTS: 'warning',
  ON_HOLD: 'warning',
  RESPONDED: 'warning',
  CODE_2: 'warning',
  REJECTED: 'danger',
  VOID: 'danger',
  CANCELLED: 'danger',
  FAIL: 'danger',
  CODE_3: 'danger',
  CODE_4: 'danger',
  SUPERSEDED: 'muted',
  SKIPPED: 'muted',
  INFO: 'neutral',
};

export function toneOf(value: string): Tone {
  return TONES[value] ?? 'neutral';
}

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-neutral-badge text-neutral-badge-fg',
  info: 'bg-info text-info-fg',
  success: 'bg-success text-success-fg',
  warning: 'bg-warning text-warning-fg',
  danger: 'bg-danger text-danger-fg',
  muted: 'bg-subtle text-muted line-through',
};
