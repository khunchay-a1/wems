import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { map, type Observable } from 'rxjs';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/auth/decorators';
import { Op } from '../../../common/openapi/op.decorator';
import { RealtimeHub } from '../../../common/realtime/realtime.hub';
import {
  NotificationListDto,
  NotificationPreferenceDto,
  NotificationQueryDto,
  PutPreferencesDto,
  RegisterPushDeviceDto,
  UnreadCountDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

interface MessageEvent {
  data: string | object;
  type?: string;
}

@ApiTags('Notifications')
@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly hub: RealtimeHub,
  ) {}

  @Get('notifications')
  @Op('Notifications', 'listNotifications', 'Own notifications, newest first (cursor)')
  @ApiOkResponse({ type: NotificationListDto })
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: NotificationQueryDto,
  ): Promise<NotificationListDto> {
    return this.notifications.list(user, q);
  }

  @Get('notifications/unread-count')
  @Op('Notifications', 'getUnreadCount', 'Number for the bell')
  @ApiOkResponse({ type: UnreadCountDto })
  async unread(@CurrentUser() user: AuthUser): Promise<UnreadCountDto> {
    return { unreadCount: await this.notifications.unreadCount(user) };
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  @Op('Notifications', 'markNotificationRead', 'Mark one notification read')
  @ApiNoContentResponse()
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.notifications.markRead(user, id);
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  @Op('Notifications', 'markAllNotificationsRead', 'Mark everything read')
  @ApiNoContentResponse()
  readAll(@CurrentUser() user: AuthUser): Promise<void> {
    return this.notifications.markAllRead(user);
  }

  @Get('notification-preferences')
  @Op('Notifications', 'listPreferences', 'Channels per event type')
  @ApiOkResponse({ type: [NotificationPreferenceDto] })
  preferences(@CurrentUser() user: AuthUser): Promise<NotificationPreferenceDto[]> {
    return this.notifications.preferences(user);
  }

  @Put('notification-preferences')
  @Op(
    'Notifications',
    'putPreferences',
    'Change channels per event type (mandatory in-app stays on)',
  )
  @ApiOkResponse({ type: [NotificationPreferenceDto] })
  putPreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: PutPreferencesDto,
  ): Promise<NotificationPreferenceDto[]> {
    return this.notifications.putPreferences(user, dto);
  }

  @Post('push-devices')
  @HttpCode(204)
  @Op('Notifications', 'registerPushDevice', 'Register an FCM token for this user')
  @ApiNoContentResponse()
  registerDevice(@CurrentUser() user: AuthUser, @Body() dto: RegisterPushDeviceDto): Promise<void> {
    return this.notifications.registerDevice(user, dto);
  }

  @Delete('push-devices/:token')
  @HttpCode(204)
  @Op('Notifications', 'removePushDevice', 'Unregister an FCM token')
  @ApiNoContentResponse()
  removeDevice(@CurrentUser() user: AuthUser, @Param('token') token: string): Promise<void> {
    return this.notifications.removeDevice(user, token);
  }

  @Sse('events')
  @SkipThrottle()
  @Op(
    'Events',
    'streamEvents',
    'Server-Sent Events for the web app (docs/04-api-conventions.md §10)',
  )
  @ApiProduces('text/event-stream')
  async events(@CurrentUser() user: AuthUser): Promise<Observable<MessageEvent>> {
    return (await this.hub.connect(user)).pipe(map((e) => ({ type: e.type, data: e.data })));
  }
}
