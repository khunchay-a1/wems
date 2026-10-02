import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { OutboxJobData } from '../common/queue/queues';
import {
  OUTBOX_EVENT_TYPES,
  type OutboxEventHandler,
  SCHEDULED_TASK,
  type ScheduledTaskHandler,
  type ScheduledTaskMeta,
} from './handlers';

/** Finds @HandlesEvents / @ScheduledTask providers and routes jobs to them. */
@Injectable()
export class EventDispatcher implements OnModuleInit {
  private readonly logger = new Logger(EventDispatcher.name);
  private readonly handlers = new Map<string, OutboxEventHandler[]>();
  readonly tasks = new Map<string, { meta: ScheduledTaskMeta; handler: ScheduledTaskHandler }>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as unknown;
      const metatype = wrapper.metatype as
        (abstract new (...args: never[]) => unknown) | null | undefined;
      if (!instance || !metatype || typeof metatype !== 'function') continue;
      const types = this.reflector.get<string[] | undefined>(OUTBOX_EVENT_TYPES, metatype);
      for (const type of types ?? []) {
        const list = this.handlers.get(type) ?? [];
        list.push(instance as OutboxEventHandler);
        this.handlers.set(type, list);
      }
      const task = this.reflector.get<ScheduledTaskMeta | undefined>(SCHEDULED_TASK, metatype);
      if (task) this.tasks.set(task.id, { meta: task, handler: instance as ScheduledTaskHandler });
    }
  }

  handlerCount(type: string): number {
    return this.handlers.get(type)?.length ?? 0;
  }

  async dispatch(event: OutboxJobData): Promise<void> {
    const list = this.handlers.get(event.type) ?? [];
    if (!list.length) {
      this.logger.debug(`no handler for ${event.type}`);
      return;
    }
    for (const h of list) await h.handle(event);
  }

  async runTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`unknown scheduled task ${id}`);
    await task.handler.run();
  }
}
