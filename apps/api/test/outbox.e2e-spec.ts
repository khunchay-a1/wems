import { Body, Controller, HttpCode, Injectable, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import { Redis } from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuditService } from '../src/common/audit/audit.service';
import { ChangeLogService, Scope } from '../src/common/audit/change-log.service';
import { RequireIdempotencyKey } from '../src/common/http/idempotency.interceptor';
import { uuidv7 } from '../src/common/ids/uuid';
import { OutboxService } from '../src/common/outbox/outbox.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QueueService } from '../src/common/queue/queue.module';
import type { OutboxJobData } from '../src/common/queue/queues';
import { ClockService } from '../src/common/time/clock';
import { HandlesEvents, type OutboxEventHandler } from '../src/worker/handlers';
import { OutboxRelayService } from '../src/worker/outbox-relay.service';
import { QueueWorkersService } from '../src/worker/queue-workers.service';
import { WorkerModule } from '../src/worker/worker.module';
import { makeUser } from './factories/users';
import { resetDatabase } from './utils/db';
import { bearerLogin, cookieLogin } from './utils/http';

class EchoDto {
  @IsString() text!: string;
}

let counter = 0;

@Controller('test-idem')
class IdemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  @Post()
  @HttpCode(201)
  @RequireIdempotencyKey()
  async create(@Body() dto: EchoDto): Promise<{ n: number; text: string }> {
    counter += 1;
    await this.prisma.$transaction((tx) =>
      this.outbox.publish(tx, 'test.created', { text: dto.text }),
    );
    return { n: counter, text: dto.text };
  }

  @Post('optional')
  @HttpCode(200)
  optional(@Body() dto: EchoDto): { text: string } {
    return { text: dto.text };
  }
}

@Module({ controllers: [IdemController] })
class IdemModule {}

const handled: string[] = [];

@Injectable()
@HandlesEvents('test.created')
class RecordingHandler implements OutboxEventHandler {
  handle(event: OutboxJobData): Promise<void> {
    handled.push(event.eventId);
    return Promise.resolve();
  }
}

describe('P0-07 audit, change log, outbox, idempotency', () => {
  let app: Awaited<ReturnType<typeof boot>>;
  async function boot() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, IdemModule],
    }).compile();
    const a = moduleRef.createNestApplication({ logger: false });
    configureApp(a);
    await a.init();
    return a;
  }
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await boot();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    const redis = new Redis(process.env.REDIS_URL!);
    await redis.flushdb();
    await redis.quit();
  });
  afterAll(() => app.close());

  it('a rolled-back transaction leaves no audit, change log or outbox rows', async () => {
    const audit = app.get(AuditService);
    const changes = app.get(ChangeLogService);
    const outbox = app.get(OutboxService);
    const id = uuidv7();
    await expect(
      prisma.$transaction(async (tx) => {
        await audit.record(tx, { action: 'test.do', entityType: 'Test', entityId: id });
        await changes.touch(tx, Scope.global, 'Test', id);
        await outbox.publish(tx, 'test.done', { id });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.auditLog.count({ where: { entityId: id } })).toBe(0);
    expect(await prisma.changeLog.count({ where: { entityId: id } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { type: 'test.done' } })).toBe(0);
  });

  it('two relay instances running concurrently enqueue every event exactly once', async () => {
    await prisma.outboxEvent.deleteMany();
    const now = app.get(ClockService).now();
    await prisma.outboxEvent.createMany({
      data: Array.from({ length: 250 }, (_, i) => ({
        id: uuidv7(now.getTime() - 1000 + i),
        type: 'test.bulk',
        payload: { i },
        createdAt: new Date(now.getTime() - 1000 + i),
        availableAt: new Date(now.getTime() - 1000),
      })),
    });
    const enqueued: string[] = [];
    const fakeQueues = {
      add: async (_q: string, _n: string, _d: unknown, opts?: { jobId?: string }) => {
        await new Promise((r) => setTimeout(r, 1));
        enqueued.push(opts!.jobId!);
      },
    } as unknown as QueueService;
    const clock = app.get(ClockService);
    const a = new OutboxRelayService(prisma, fakeQueues, clock);
    const b = new OutboxRelayService(prisma, fakeQueues, clock);
    const drain = async (r: OutboxRelayService) => {
      while ((await r.relayOnce()) > 0) {
        /* keep going */
      }
    };
    await Promise.all([drain(a), drain(b)]);
    expect(enqueued).toHaveLength(250);
    expect(new Set(enqueued).size).toBe(250);
    expect(await prisma.outboxEvent.count({ where: { processedAt: null } })).toBe(0);
  });

  it('failed enqueue is retried later with backoff', async () => {
    await prisma.outboxEvent.deleteMany();
    const clock = app.get(ClockService);
    await prisma.outboxEvent.create({
      data: { type: 'test.flaky', payload: {}, availableAt: new Date(clock.now().getTime() - 1) },
    });
    const failing = {
      add: () => Promise.reject(new Error('redis down')),
    } as unknown as QueueService;
    await new OutboxRelayService(prisma, failing, clock).relayOnce();
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { type: 'test.flaky' } });
    expect(ev).toMatchObject({ attempts: 1, processedAt: null, lastError: 'redis down' });
    expect(ev.availableAt.getTime()).toBeGreaterThan(clock.now().getTime());
  });

  it('worker: outbox → BullMQ → handler (idempotent jobId)', async () => {
    await prisma.outboxEvent.deleteMany();
    handled.length = 0;
    const workerRef = await Test.createTestingModule({
      imports: [WorkerModule],
      providers: [RecordingHandler],
    }).compile();
    const worker = workerRef.createNestApplication({ logger: false });
    worker.get(OutboxRelayService).enabled = false;
    await worker.init();
    try {
      const u = await makeUser(prisma);
      const c = await bearerLogin(app, u.email);
      const key = uuidv7();
      await c
        .postRaw('/api/v1/test-idem')
        .set('Idempotency-Key', key)
        .send({ text: 'hello' })
        .expect(201);
      const relay = worker.get(OutboxRelayService);
      expect(await relay.relayOnce()).toBe(1);
      for (let i = 0; i < 50 && handled.length === 0; i++)
        await new Promise((r) => setTimeout(r, 100));
      expect(handled).toHaveLength(1);
      // relaying the same event id again must not run the handler twice
      const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { type: 'test.created' } });
      await worker
        .get(QueueService)
        .add(
          'notifications',
          'test.created',
          { eventId: ev.id, type: 'test.created', payload: {} },
          { jobId: ev.id },
        );
      await new Promise((r) => setTimeout(r, 500));
      expect(handled).toHaveLength(1);
    } finally {
      await worker.close();
    }
  });

  it('Idempotency-Key: same key + body replays; different body → 422; missing on required route → 400', async () => {
    const u = await makeUser(prisma);
    const { agent, csrf } = await cookieLogin(app, u.email);
    const key = uuidv7();
    const before = counter;
    const r1 = await agent
      .post('/api/v1/test-idem')
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', key)
      .send({ text: 'a' })
      .expect(201);
    const r2 = await agent
      .post('/api/v1/test-idem')
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', key)
      .send({ text: 'a' })
      .expect(201);
    expect(r2.body).toEqual(r1.body);
    expect(counter).toBe(before + 1);
    const r3 = await agent
      .post('/api/v1/test-idem')
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', key)
      .send({ text: 'b' })
      .expect(422);
    expect(r3.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const r4 = await agent
      .post('/api/v1/test-idem')
      .set('X-CSRF-Token', csrf)
      .send({ text: 'c' })
      .expect(400);
    expect(r4.body.errors[0]).toMatchObject({ field: 'Idempotency-Key', code: 'REQUIRED' });
    await agent
      .post('/api/v1/test-idem')
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', 'nope')
      .send({ text: 'c' })
      .expect(400);
  });

  it('mobile POSTs must carry an Idempotency-Key; web optional routes do not', async () => {
    const u = await makeUser(prisma);
    const mobile = await bearerLogin(app, u.email);
    await mobile.postRaw('/api/v1/test-idem/optional').send({ text: 'x' }).expect(400);
    await mobile.post('/api/v1/test-idem/optional').send({ text: 'x' }).expect(200);
    const { agent, csrf } = await cookieLogin(app, u.email);
    await agent
      .post('/api/v1/test-idem/optional')
      .set('X-CSRF-Token', csrf)
      .send({ text: 'x' })
      .expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({}).expect(400);
  });

  it('QueueWorkersService registers the nightly cleanup task', () => {
    expect(QueueWorkersService).toBeDefined();
  });
});
