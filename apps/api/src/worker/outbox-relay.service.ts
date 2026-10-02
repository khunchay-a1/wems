import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { type OutboxJobData, queueForEvent } from '../common/queue/queues';
import { QueueService } from '../common/queue/queue.module';
import { ClockService } from '../common/time/clock';

const BATCH = 100;
const INTERVAL_MS = 1_000;
const MAX_BACKOFF_MS = 10 * 60_000;

interface Row {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  aggregate_id: string | null;
  attempts: number;
  created_at: Date;
}

/**
 * Transactional outbox relay (ADR-0006, docs/02-architecture.md §6): every second, claim up to 100
 * unprocessed events with FOR UPDATE SKIP LOCKED, enqueue each with jobId = event id (BullMQ dedupes),
 * then mark processed. Safe with several worker instances.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  enabled = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly clock: ClockService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while ((await this.relayOnce()) === BATCH) {
        /* drain backlog */
      }
    } catch (err) {
      this.logger.error({ err }, 'outbox relay failed');
    } finally {
      this.running = false;
    }
  }

  /** Relays one batch; returns how many events were claimed. */
  async relayOnce(): Promise<number> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Row[]>`
        SELECT id, type, payload, aggregate_id, attempts, created_at
        FROM outbox_events
        WHERE processed_at IS NULL AND available_at <= ${now}
        ORDER BY created_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED`;
      for (const row of rows) {
        const data: OutboxJobData = {
          eventId: row.id,
          type: row.type,
          payload: row.payload,
          aggregateId: row.aggregate_id,
          createdAt: row.created_at.toISOString(),
        };
        try {
          await this.queues.add(queueForEvent(row.type), row.type, data, { jobId: row.id });
          await tx.outboxEvent.update({ where: { id: row.id }, data: { processedAt: now } });
        } catch (err) {
          const attempts = row.attempts + 1;
          const delay = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempts);
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: {
              attempts,
              lastError: String(err instanceof Error ? err.message : err).slice(0, 2000),
              availableAt: new Date(now.getTime() + delay),
            },
          });
        }
      }
      return rows.length;
    });
  }
}
