import { Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel, Prisma } from '../../generated/prisma/client';
import { AppConfig } from '../config/app-config';
import type { Locale } from '../i18n/locale';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.module';
import { QUEUES, type OutboxJobData } from '../queue/queues';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { SettingsService } from '../settings/settings.service';
import { ClockService } from '../time/clock';
import { notificationDef } from './catalog';
import type { MailJob } from './mailer.service';
import { MailerService } from './mailer.service';
import { PushService } from './push.service';

const DIGEST_WINDOW_MS = 10 * 60_000;
const DIGEST_THRESHOLD = 5;

/**
 * Turns an outbox event into notifications (BR-PLT-030/031): resolve recipients (never the actor),
 * apply preferences, create in-app rows, queue email (digest when > 5 in 10 min) and push.
 * Idempotent per (eventId, user).
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly push: PushService,
    private readonly queues: QueueService,
    private readonly realtime: RealtimePublisher,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
    private readonly clock: ClockService,
  ) {}

  async handle(event: OutboxJobData): Promise<void> {
    const def = notificationDef(event.type);
    if (!def) return;
    const ctx = { prisma: this.prisma };
    const actorId = typeof event.payload.actorId === 'string' ? event.payload.actorId : null;
    const recipientIds = [...new Set(await def.recipients(event.payload, ctx))].filter(
      (id) => id && (def.notifyActor || id !== actorId),
    );
    if (!recipientIds.length) return;
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: recipientIds },
        deletedAt: null,
        ...(def.notifyActor ? {} : { isActive: true }),
      },
      include: { notificationPreferences: { where: { type: event.type } } },
    });
    const company = await this.settings.get('company.profile');
    for (const user of users) {
      const locale: Locale = user.locale === 'en' ? 'en' : 'th';
      const pref = user.notificationPreferences[0]?.channels;
      const channels = new Set<NotificationChannel>(pref ?? def.channels);
      if (def.mandatoryInApp) channels.add('IN_APP');
      const content = await def.render(event.payload, locale, ctx);
      const already = await this.prisma.notification.findFirst({
        where: {
          userId: user.id,
          type: event.type,
          data: { path: ['eventId'], equals: event.eventId },
        },
      });
      if (already) continue;
      const now = this.clock.now();
      const emailRecent =
        channels.has('EMAIL') &&
        (await this.prisma.notification.count({
          where: {
            userId: user.id,
            type: event.type,
            createdAt: { gte: new Date(now.getTime() - DIGEST_WINDOW_MS) },
            data: { path: ['email'], equals: 'SENT' },
          },
        }));
      const emailState = !channels.has('EMAIL')
        ? 'NONE'
        : (emailRecent || 0) >= DIGEST_THRESHOLD
          ? 'DEFERRED'
          : 'SENT';
      const data: Prisma.InputJsonValue = {
        eventId: event.eventId,
        link: content.link ?? null,
        inApp: channels.has('IN_APP'),
        email: emailState,
      };
      const n = await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: event.type,
          title: content.title,
          body: content.body,
          data,
          entityType: content.entityType ?? null,
          entityId:
            content.entityId && /^[0-9a-f-]{36}$/i.test(content.entityId) ? content.entityId : null,
          projectId: content.projectId ?? null,
          // email-only notifications do not appear in the bell
          readAt: channels.has('IN_APP') ? null : now,
          createdAt: now,
        },
      });
      if (channels.has('IN_APP')) {
        await this.realtime.toUser(user.id, 'notification.created', {
          id: n.id,
          type: n.type,
          title: n.title,
        });
      }
      if (emailState === 'SENT') {
        const { html, text } = this.mailer.render({
          locale,
          title: content.title,
          lines: [content.body, ...(content.emailLines ?? [])],
          actionUrl: content.link ? `${this.config.env.PUBLIC_BASE_URL}${content.link}` : undefined,
          actionLabel: locale === 'en' ? 'Open in WEMS' : 'เปิดในระบบ',
          companyName: locale === 'en' ? company.nameEn : company.nameTh,
        });
        const job: MailJob = { to: [user.email], subject: content.title, html, text };
        await this.queues.add(QUEUES.mail, 'send', job, {
          jobId: `${event.eventId}:${user.id}:mail`,
        });
      }
      if (channels.has('PUSH')) {
        await this.push.sendToUser(user.id, {
          title: content.title,
          body: content.body,
          data: {
            type: event.type,
            entityType: content.entityType ?? '',
            entityId: content.entityId ?? '',
            projectId: content.projectId ?? '',
            notificationId: n.id,
          },
        });
      }
    }
  }

  /** BR-PLT-031: one digest email per user for deferred notifications. */
  async sendDigests(): Promise<number> {
    const deferred = await this.prisma.notification.findMany({
      where: { data: { path: ['email'], equals: 'DEFERRED' } },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    });
    const byUser = new Map<string, typeof deferred>();
    for (const n of deferred) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
    const company = await this.settings.get('company.profile');
    for (const [userId, list] of byUser) {
      const user = list[0]!.user;
      const locale: Locale = user.locale === 'en' ? 'en' : 'th';
      const title =
        locale === 'en'
          ? `${list.length} updates in WEMS`
          : `มีความเคลื่อนไหว ${list.length} รายการในระบบ WEMS`;
      const { html, text } = this.mailer.render({
        locale,
        title,
        lines: list.map((n) => `• ${n.title} — ${n.body}`),
        actionUrl: `${this.config.env.PUBLIC_BASE_URL}/notifications`,
        actionLabel: locale === 'en' ? 'Open notifications' : 'ดูการแจ้งเตือน',
        companyName: locale === 'en' ? company.nameEn : company.nameTh,
      });
      await this.queues.add(
        QUEUES.mail,
        'send',
        { to: [user.email], subject: title, html, text } satisfies MailJob,
        {
          jobId: `digest:${userId}:${list[list.length - 1]!.id}`,
        },
      );
      for (const n of list) {
        await this.prisma.notification.update({
          where: { id: n.id },
          data: { data: { ...(n.data as Record<string, unknown>), email: 'DIGESTED' } },
        });
      }
    }
    if (byUser.size) this.logger.log(`digests queued for ${byUser.size} user(s)`);
    return byUser.size;
  }
}
