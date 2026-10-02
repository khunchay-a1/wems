import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { PushService } from '../../src/common/notifications/push.service';
import { ClockService, FixedClock } from '../../src/common/time/clock';
import { EventDispatcher } from '../../src/worker/event-dispatcher.service';
import { OutboxRelayService } from '../../src/worker/outbox-relay.service';
import { WorkerModule } from '../../src/worker/worker.module';

/** Boots the worker (BullMQ consumers) with the relay timer off; tests call relay() explicitly. */
export async function startWorker(clock: FixedClock) {
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
  const ref = await Test.createTestingModule({ imports: [WorkerModule] })
    .overrideProvider(ClockService)
    .useValue(clock)
    .compile();
  const app: INestApplication = ref.createNestApplication({ logger: false });
  app.get(OutboxRelayService).enabled = false;
  await app.init();
  const relay = app.get(OutboxRelayService);
  return {
    app,
    relay: async () => {
      let n = 0;
      while ((await relay.relayOnce()) > 0) n += 1;
      return n;
    },
    dispatcher: app.get(EventDispatcher),
    push: app.get(PushService),
    close: () => app.close(),
  };
}
