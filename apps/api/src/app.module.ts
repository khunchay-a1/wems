import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './common/config/config.module';
import { ProblemFilter } from './common/errors/problem.filter';
import { HealthModule } from './common/health/health.module';
import { CoreModule } from './common/ids/ids.module';
import { LoggerModule } from './common/logging/logger.module';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CoreModule,
    PrismaModule,
    // General API limit: 300/min (docs/04-api-conventions.md §11); auth routes override per-route
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
