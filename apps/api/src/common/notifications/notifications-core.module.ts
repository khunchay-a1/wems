import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { registerPlatformNotifications } from './platform.notifications';
import { PushService } from './push.service';

registerPlatformNotifications();

@Global()
@Module({
  providers: [MailerService, PushService, NotificationDispatchService],
  exports: [MailerService, PushService, NotificationDispatchService],
})
export class NotificationsCoreModule {}
