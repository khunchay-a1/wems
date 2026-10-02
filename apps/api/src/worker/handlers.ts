import { SetMetadata } from '@nestjs/common';
import type { OutboxJobData } from '../common/queue/queues';

export const OUTBOX_EVENT_TYPES = 'wems:outboxEventTypes';
export const SCHEDULED_TASK = 'wems:scheduledTask';

/** Marks a provider as handling outbox events of the given types. Handlers must be idempotent. */
export const HandlesEvents = (...types: string[]): ClassDecorator =>
  SetMetadata(OUTBOX_EVENT_TYPES, types);

export interface OutboxEventHandler {
  handle(event: OutboxJobData): Promise<void>;
}

export interface ScheduledTaskMeta {
  /** Stable scheduler id, e.g. "cleanup" */
  id: string;
  /** Cron pattern in Asia/Bangkok, e.g. "0 2 * * *" */
  cron: string;
}

/** Marks a provider as a repeatable job (docs/02-architecture.md §6 table). */
export const ScheduledTask = (meta: ScheduledTaskMeta): ClassDecorator =>
  SetMetadata(SCHEDULED_TASK, meta);

export interface ScheduledTaskHandler {
  run(): Promise<unknown>;
}
