import { Injectable } from '@nestjs/common';
import type { Notification, Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { Problem } from '../../../common/errors/problem';
import { notificationDef, notificationTypes } from '../../../common/notifications/catalog';
import { iso } from '../../../common/prisma/helpers';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ClockService } from '../../../common/time/clock';
import type {
  NotificationDto,
  NotificationListDto,
  NotificationPreferenceDto,
  NotificationQueryDto,
  PutPreferencesDto,
  RegisterPushDeviceDto,
} from './dto/notifications.dto';

function toDto(n: Notification): NotificationDto {
  const data = (n.data ?? {}) as { link?: string | null };
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    projectId: n.projectId,
    link: data.link ?? null,
    readAt: iso(n.readAt),
    createdAt: n.createdAt.toISOString(),
  };
}

/** Bell list only contains in-app notifications (email-only rows are stored for digest/audit). */
const inAppOnly: Prisma.NotificationWhereInput = {
  NOT: { data: { path: ['inApp'], equals: false } },
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async list(user: AuthUser, q: NotificationQueryDto): Promise<NotificationListDto> {
    const limit = q.limit ?? 30;
    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...inAppOnly,
      ...(q.unreadOnly ? { readAt: null } : {}),
      ...(q.cursor ? { id: { lt: Buffer.from(q.cursor, 'base64url').toString('utf8') } } : {}),
    };
    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      data: page.map(toDto),
      meta: {
        nextCursor:
          rows.length > limit ? Buffer.from(page[page.length - 1]!.id).toString('base64url') : null,
        unreadCount: await this.unreadCount(user),
      },
    };
  }

  unreadCount(user: AuthUser): Promise<number> {
    return this.prisma.notification.count({
      where: { userId: user.id, readAt: null, ...inAppOnly },
    });
  }

  async markRead(user: AuthUser, id: string): Promise<void> {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: this.clock.now() },
    });
    if (
      !res.count &&
      !(await this.prisma.notification.findFirst({ where: { id, userId: user.id } }))
    ) {
      throw new Problem('NOT_FOUND');
    }
  }

  async markAllRead(user: AuthUser): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: this.clock.now() },
    });
  }

  async preferences(user: AuthUser): Promise<NotificationPreferenceDto[]> {
    const saved = await this.prisma.notificationPreference.findMany({ where: { userId: user.id } });
    return notificationTypes().map((type) => {
      const def = notificationDef(type)!;
      const own = saved.find((p) => p.type === type);
      return {
        type,
        channels: own?.channels ?? def.channels,
        defaultChannels: def.channels,
        mandatoryInApp: !!def.mandatoryInApp,
      };
    });
  }

  async putPreferences(
    user: AuthUser,
    dto: PutPreferencesDto,
  ): Promise<NotificationPreferenceDto[]> {
    for (const p of dto.preferences) {
      const def = notificationDef(p.type);
      if (!def)
        throw new Problem('VALIDATION_FAILED', {
          errors: [{ field: 'preferences.type', code: 'UNKNOWN', message: p.type }],
        });
      const channels = [
        ...new Set(def.mandatoryInApp ? [...p.channels, 'IN_APP' as const] : p.channels),
      ];
      await this.prisma.notificationPreference.upsert({
        where: { userId_type: { userId: user.id, type: p.type } },
        update: { channels },
        create: { userId: user.id, type: p.type, channels },
      });
    }
    return this.preferences(user);
  }

  async registerDevice(user: AuthUser, dto: RegisterPushDeviceDto): Promise<void> {
    const now = this.clock.now();
    await this.prisma.pushDevice.upsert({
      where: { fcmToken: dto.fcmToken },
      update: {
        userId: user.id,
        platform: dto.platform,
        appVersion: dto.appVersion ?? null,
        deviceModel: dto.deviceModel ?? null,
        lastSeenAt: now,
        disabledAt: null,
      },
      create: {
        userId: user.id,
        fcmToken: dto.fcmToken,
        platform: dto.platform,
        appVersion: dto.appVersion ?? null,
        deviceModel: dto.deviceModel ?? null,
        lastSeenAt: now,
        createdAt: now,
      },
    });
  }

  async removeDevice(user: AuthUser, token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { fcmToken: token, userId: user.id } });
  }
}
