import { Injectable } from '@nestjs/common';
import { NotificationDispatchService } from '../../common/notifications/notification-dispatch.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { bangkokDate } from '../../common/time/business-calendar';
import { ClockService } from '../../common/time/clock';
import { ScheduledTask, type ScheduledTaskHandler } from '../handlers';

/** BR-PLT-031: send digests of deferred notification emails every 10 minutes. */
@Injectable()
@ScheduledTask({ id: 'email-digest', cron: '*/10 * * * *' })
export class EmailDigestTask implements ScheduledTaskHandler {
  constructor(private readonly dispatch: NotificationDispatchService) {}

  async run(): Promise<void> {
    await this.dispatch.sendDigests();
  }
}

const WARN_DAYS = [60, 30, 7];

/** 08:00 daily: licenses expiring in 60/30/7 days (docs/02-architecture.md §6). */
@Injectable()
@ScheduledTask({ id: 'license-expiry', cron: '0 8 * * *' })
export class LicenseExpiryTask implements ScheduledTaskHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly clock: ClockService,
  ) {}

  async run(): Promise<number> {
    const today = bangkokDate(this.clock.now());
    let published = 0;
    for (const days of WARN_DAYS) {
      const target = new Date(`${today}T00:00:00.000Z`);
      target.setUTCDate(target.getUTCDate() + days);
      const licenses = await this.prisma.professionalLicense.findMany({
        where: { isActive: true, expiresAt: target, user: { isActive: true, deletedAt: null } },
      });
      for (const lic of licenses) {
        const dup = await this.prisma.outboxEvent.findFirst({
          where: {
            type: 'license.expiring',
            aggregateId: lic.id,
            payload: { path: ['daysLeft'], equals: days },
          },
        });
        if (dup) continue;
        await this.prisma.$transaction((tx) =>
          this.outbox.publish(
            tx,
            'license.expiring',
            { licenseId: lic.id, userId: lic.userId, daysLeft: days, actorId: null },
            lic.id,
          ),
        );
        published += 1;
      }
    }
    return published;
  }
}
