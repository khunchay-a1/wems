import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../queue/queue.module';

export const REALTIME_CHANNEL = 'wems:realtime';

/** Message fanned out to API instances over Redis pub/sub, then to SSE clients (docs/04-api-conventions.md §10). */
export interface RealtimeMessage {
  /** Deliver to these users… */
  userIds?: string[];
  /** …or to everyone who can see this project */
  projectId?: string;
  event: 'notification.created' | 'review.updated' | 'document.updated' | 'file.processed';
  data: Record<string, unknown>;
}

@Injectable()
export class RealtimePublisher {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async publish(message: RealtimeMessage): Promise<void> {
    await this.redis.publish(REALTIME_CHANNEL, JSON.stringify(message)).catch(() => 0);
  }

  toUser(
    userId: string,
    event: RealtimeMessage['event'],
    data: Record<string, unknown>,
  ): Promise<void> {
    return this.publish({ userIds: [userId], event, data });
  }

  toProject(
    projectId: string,
    event: RealtimeMessage['event'],
    data: Record<string, unknown>,
  ): Promise<void> {
    return this.publish({ projectId, event, data });
  }
}
