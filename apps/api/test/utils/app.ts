import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ClockService, FixedClock } from '../../src/common/time/clock';
import { resetDatabase } from './db';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  clock: FixedClock;
  close(): Promise<void>;
}

/** Boots the full AppModule against the test database with a controllable clock. */
export async function createTestApp(
  customize?: (b: TestingModuleBuilder) => TestingModuleBuilder,
  now = new Date('2026-09-28T02:00:00.000Z'),
): Promise<TestApp> {
  const clock = new FixedClock(now);
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ClockService)
    .useValue(clock);
  if (customize) builder = customize(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  return { app, prisma, clock, close: () => app.close() };
}
