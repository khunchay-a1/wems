import { Injectable } from '@nestjs/common';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../../common/settings/settings.service';
import { bangkokDate } from '../../common/time/business-calendar';
import { ClockService } from '../../common/time/clock';
import { reminderFor } from '../../modules/documents/domain/reminders';
import { ScheduledTask, type ScheduledTaskHandler } from '../handlers';

/** BR-DOC-038: 08:30 every day (working days only) — due-soon and overdue review reminders. */
@Injectable()
@ScheduledTask({ id: 'review-reminders', cron: '30 8 * * *' })
export class ReviewReminderTask implements ScheduledTaskHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
  ) {}

  async run(): Promise<number> {
    const now = this.clock.now();
    const today = bangkokDate(now);
    const holidays = await this.settings.get('calendar.holidays');
    const steps = await this.prisma.reviewStep.findMany({
      where: { status: 'ACTIVE', dueAt: { not: null }, cycle: { status: 'IN_PROGRESS' } },
      include: {
        cycle: {
          include: {
            revision: { select: { id: true, document: { select: { id: true, projectId: true } } } },
          },
        },
      },
    });
    let sent = 0;
    for (const s of steps) {
      const r = reminderFor({
        today,
        now,
        dueAt: s.dueAt!,
        dueDate: bangkokDate(s.dueAt!),
        lastRemindedDate: s.lastRemindedAt ? bangkokDate(s.lastRemindedAt) : null,
        holidays,
      });
      if (r.kind === 'none') continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.reviewStep.update({ where: { id: s.id }, data: { lastRemindedAt: now } });
        await this.outbox.publish(
          tx,
          r.kind === 'due_soon' ? 'review.step.due_soon' : 'review.step.overdue',
          {
            stepId: s.id,
            assigneeId: s.assigneeId,
            revisionId: s.cycle.revision.id,
            documentId: s.cycle.revision.document.id,
            projectId: s.cycle.revision.document.projectId,
            ...(r.kind === 'overdue'
              ? { workingDaysLate: r.workingDaysLate, notifyPm: r.notifyPm }
              : {}),
            actorId: null,
          },
          s.id,
        );
      });
      sent += 1;
    }
    return sent;
  }
}
