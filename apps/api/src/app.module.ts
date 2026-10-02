import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './common/audit/audit.module';
import { AuthGuard } from './common/auth/auth.guard';
import { AuthCoreModule } from './common/auth/auth.module';
import { AppThrottlerGuard } from './common/auth/throttler.guard';
import { ConfigModule } from './common/config/config.module';
import { ProblemFilter } from './common/errors/problem.filter';
import { HealthModule } from './common/health/health.module';
import { IdempotencyInterceptor } from './common/http/idempotency.interceptor';
import { RequestContextMiddleware } from './common/http/request-context.middleware';
import { CoreModule } from './common/ids/ids.module';
import { LoggerModule } from './common/logging/logger.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { QueueModule } from './common/queue/queue.module';
import { SettingsModule } from './common/settings/settings.module';
import { AuthModule } from './modules/platform/auth/auth.module';
import { UsersModule } from './modules/platform/users/users.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CoreModule,
    PrismaModule,
    AuditModule,
    SettingsModule,
    QueueModule,
    AuthCoreModule,
    // General API limit: 300/min per user (docs/04-api-conventions.md §11); auth routes override per-route
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    HealthModule,
    AuthModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemFilter },
    // Order matters: authenticate first so the throttler can key by user
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
