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
import { FilesCoreModule } from './common/files/files.module';
import { NumberingModule } from './common/numbering/numbering.module';
import { PdfModule } from './common/pdf/pdf.module';
import { NotificationsCoreModule } from './common/notifications/notifications-core.module';
import { RealtimeApiModule } from './common/realtime/realtime.module';
import { AdminModule } from './modules/platform/admin/admin.module';
import { AuthModule } from './modules/platform/auth/auth.module';
import { FilesModule } from './modules/platform/files/files.module';
import { NotificationsModule } from './modules/platform/notifications/notifications.module';
import { UsersModule } from './modules/platform/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { DocumentsModule } from './modules/documents/documents.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CoreModule,
    PrismaModule,
    AuditModule,
    SettingsModule,
    QueueModule,
    NumberingModule,
    RealtimeApiModule,
    FilesCoreModule,
    NotificationsCoreModule,
    PdfModule,
    AuthCoreModule,
    // General API limit: 300/min per user (docs/04-api-conventions.md §11); auth routes override per-route
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    HealthModule,
    AuthModule,
    UsersModule,
    AdminModule,
    FilesModule,
    NotificationsModule,
    ClientsModule,
    ProjectsModule,
    DocumentsModule,
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
