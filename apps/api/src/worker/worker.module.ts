import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AuditModule } from '../common/audit/audit.module';
import { ConfigModule } from '../common/config/config.module';
import { HealthModule } from '../common/health/health.module';
import { CoreModule } from '../common/ids/ids.module';
import { LoggerModule } from '../common/logging/logger.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { FilesCoreModule } from '../common/files/files.module';
import { NotificationsCoreModule } from '../common/notifications/notifications-core.module';
import { QueueModule } from '../common/queue/queue.module';
import { RealtimeModule } from '../common/realtime/realtime.module';
import { SettingsModule } from '../common/settings/settings.module';
import { EventDispatcher } from './event-dispatcher.service';
import { OutboxRelayService } from './outbox-relay.service';
import { QueueWorkersService } from './queue-workers.service';
import { FileProcessingHandler } from './handlers/file-processing.handler';
import { NotificationHandler } from './handlers/notification.handler';
import { EmailDigestTask, LicenseExpiryTask } from './tasks/notification.tasks';
import { CleanupTask } from './tasks/cleanup.task';

/** Background process: outbox relay, BullMQ consumers and scheduled jobs (docs/02-architecture.md §6). */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CoreModule,
    PrismaModule,
    AuditModule,
    SettingsModule,
    HealthModule,
    QueueModule,
    RealtimeModule,
    FilesCoreModule,
    NotificationsCoreModule,
    DiscoveryModule,
  ],
  providers: [
    EventDispatcher,
    OutboxRelayService,
    QueueWorkersService,
    NotificationHandler,
    CleanupTask,
    EmailDigestTask,
    LicenseExpiryTask,
    FileProcessingHandler,
  ],
  exports: [EventDispatcher, OutboxRelayService, NotificationHandler],
})
export class WorkerModule {}
