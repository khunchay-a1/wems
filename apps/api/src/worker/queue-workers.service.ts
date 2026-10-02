import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppConfig } from '../common/config/app-config';
import { type OutboxJobData, QUEUES, type QueueName } from '../common/queue/queues';
import { QueueService } from '../common/queue/queue.module';
import { createRedis } from '../common/queue/redis';
import { EventDispatcher } from './event-dispatcher.service';

const CONCURRENCY: Record<QueueName, number> = {
  notifications: 10,
  mail: 5,
  files: 3,
  pdf: 2,
  scheduled: 1,
};

/** BullMQ consumers for every queue; scheduled tasks registered as repeatable jobs (Asia/Bangkok). */
@Injectable()
export class QueueWorkersService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(QueueWorkersService.name);
  private readonly workers: Worker[] = [];
  private readonly connections: Redis[] = [];

  constructor(
    private readonly config: AppConfig,
    private readonly dispatcher: EventDispatcher,
    private readonly queues: QueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const name of Object.values(QUEUES)) {
      const connection = createRedis(this.config.env.REDIS_URL);
      this.connections.push(connection);
      const worker = new Worker(
        name,
        async (job) => {
          if (name === QUEUES.scheduled) return this.dispatcher.runTask(job.name);
          return this.dispatcher.dispatch(job.data as OutboxJobData);
        },
        { connection, concurrency: CONCURRENCY[name] },
      );
      worker.on('failed', (job, err) =>
        this.logger.warn({ err, jobId: job?.id, name: job?.name }, 'job failed'),
      );
      this.workers.push(worker);
    }
    const scheduled = this.queues.queue(QUEUES.scheduled);
    for (const { meta } of this.dispatcher.tasks.values()) {
      await scheduled.upsertJobScheduler(
        meta.id,
        { pattern: meta.cron, tz: this.config.env.TZ_BUSINESS },
        { name: meta.id },
      );
    }
    this.logger.log(
      `workers started; scheduled tasks: ${[...this.dispatcher.tasks.keys()].join(', ') || 'none'}`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all(this.connections.map((c) => c.quit().catch(() => undefined)));
  }
}
