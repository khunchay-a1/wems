/** BullMQ queues (docs/02-architecture.md §6). */
export const QUEUES = {
  notifications: 'notifications',
  mail: 'mail',
  files: 'files',
  pdf: 'pdf',
  scheduled: 'scheduled',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Which queue processes an outbox event type. Everything not listed fans out as notifications. */
export function queueForEvent(type: string): QueueName {
  if (type === 'file.uploaded') return QUEUES.files;
  if (
    type.startsWith('transmittal.') &&
    (type === 'transmittal.sent' || type === 'transmittal.resend_requested')
  ) {
    return QUEUES.pdf;
  }
  return QUEUES.notifications;
}

export interface OutboxJobData {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
  aggregateId: string | null;
  createdAt: string;
}
