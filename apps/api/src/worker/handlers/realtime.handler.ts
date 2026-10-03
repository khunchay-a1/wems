import { Injectable } from '@nestjs/common';
import type { OutboxJobData } from '../../common/queue/queues';
import { RealtimePublisher } from '../../common/realtime/realtime.publisher';
import { HandlesEvents, type OutboxEventHandler } from '../handlers';

const DOCUMENT_EVENTS = [
  'document.created',
  'document.updated',
  'revision.created',
  'revision.discarded',
  'revision.voided',
  'revision.superseded',
] as const;
const REVIEW_EVENTS = [
  'revision.submitted',
  'revision.approved',
  'revision.rejected',
  'review.step.decided',
  'review.step.reassigned',
  'review.cycle.cancelled',
  'comment.changed',
] as const;

/** Server-Sent Events for open web pages (docs/04-api-conventions.md §10). */
@Injectable()
@HandlesEvents(...DOCUMENT_EVENTS, ...REVIEW_EVENTS)
export class RealtimeEventsHandler implements OutboxEventHandler {
  constructor(private readonly realtime: RealtimePublisher) {}

  async handle(event: OutboxJobData): Promise<void> {
    const p = event.payload;
    const projectId = typeof p.projectId === 'string' ? p.projectId : null;
    if (!projectId) return;
    if ((REVIEW_EVENTS as readonly string[]).includes(event.type)) {
      await this.realtime.toProject(projectId, 'review.updated', {
        revisionId: p.revisionId ?? null,
        cycleId: p.cycleId ?? null,
      });
    }
    await this.realtime.toProject(projectId, 'document.updated', {
      documentId: p.documentId ?? null,
      projectId,
    });
  }
}
