import { Injectable } from '@nestjs/common';
import { notificationDef } from '../../common/notifications/catalog';
import { NotificationDispatchService } from '../../common/notifications/notification-dispatch.service';
import type { OutboxJobData } from '../../common/queue/queues';

/** Fallback handler: every outbox event with a notification definition fans out to recipients. */
@Injectable()
export class NotificationHandler {
  constructor(private readonly dispatch: NotificationDispatchService) {}

  handles(type: string): boolean {
    return !!notificationDef(type);
  }

  handle(event: OutboxJobData): Promise<void> {
    return this.dispatch.handle(event);
  }
}
