import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { registerPlatformNotifications } from './platform.notifications';
import { registerProjectNotifications } from '../../modules/projects/projects.notifications';
import { registerDocumentNotifications } from '../../modules/documents/documents.notifications';
import { PushService } from './push.service';

// every module's notification catalog is registered here so the worker knows them too
registerPlatformNotifications();
registerProjectNotifications();
registerDocumentNotifications();

@Global()
@Module({
  providers: [MailerService, PushService, NotificationDispatchService],
  exports: [MailerService, PushService, NotificationDispatchService],
})
export class NotificationsCoreModule {}
