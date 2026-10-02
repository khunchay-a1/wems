import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClockService } from '../../common/time/clock';
import { ScheduledTask, type ScheduledTaskHandler } from '../handlers';

const DAY = 24 * 60 * 60 * 1000;

/** Nightly cleanup 02:00 (docs/02-architecture.md §6): idempotency records, stale uploads, old change log. */
@Injectable()
@ScheduledTask({ id: 'cleanup', cron: '0 2 * * *' })
export class CleanupTask implements ScheduledTaskHandler {
  private readonly logger = new Logger(CleanupTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async run(): Promise<void> {
    const now = this.clock.now();
    const idem = await this.prisma.idempotencyRecord.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    // BR-PLT-021: PENDING_UPLOAD older than 24 h → DELETED
    const uploads = await this.prisma.fileObject.updateMany({
      where: { status: 'PENDING_UPLOAD', createdAt: { lt: new Date(now.getTime() - DAY) } },
      data: { status: 'DELETED', deletedAt: now },
    });
    const changes = await this.prisma.changeLog.deleteMany({
      where: { changedAt: { lt: new Date(now.getTime() - 90 * DAY) } },
    });
    this.logger.log(
      `cleanup: idempotency=${idem.count} pendingUploads=${uploads.count} changeLogs=${changes.count}`,
    );
  }
}
