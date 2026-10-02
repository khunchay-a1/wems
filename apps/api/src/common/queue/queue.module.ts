import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { type JobsOptions, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config';
import { HealthIndicator, HealthService } from '../health/health.service';
import { QUEUES, type QueueName } from './queues';
import { createRedis } from './redis';

export const REDIS = Symbol('REDIS');

/** Thin producer facade over BullMQ queues (one shared Redis connection). */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.redis,
        defaultJobOptions: {
          attempts: 8,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { age: 24 * 3600, count: 5_000 },
          removeOnFail: { age: 14 * 24 * 3600 },
        },
      });
      this.queues.set(name, q);
    }
    return q;
  }

  async add(name: QueueName, jobName: string, data: unknown, opts?: JobsOptions): Promise<void> {
    await this.queue(name).add(jobName, data, opts);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}

class RedisHealth extends HealthIndicator {
  readonly name = 'redis';
  constructor(private readonly redis: Redis) {
    super();
  }
  async check(): Promise<boolean> {
    return (await this.redis.ping()) === 'PONG';
  }
}

@Injectable()
class RedisLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly health: HealthService,
  ) {}
  onModuleInit(): void {
    this.health.register(new RedisHealth(this.redis));
  }
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfig],
      useFactory: (c: AppConfig) => createRedis(c.env.REDIS_URL),
    },
    QueueService,
    RedisLifecycle,
  ],
  exports: [REDIS, QueueService],
})
export class QueueModule {}

export { QUEUES };
