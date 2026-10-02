import { Injectable } from '@nestjs/common';
import { RequestContext } from '../http/request-context';
import { IdGenerator } from '../ids/id-generator';
import type { Tx } from '../prisma/helpers';
import { ClockService } from '../time/clock';

export interface OutboxPayload {
  /** User who caused the event — never notified about their own action (BR-PLT-030) */
  actorId?: string | null;
  [key: string]: unknown;
}

/** Transactional outbox (ADR-0006): side effects are recorded here and executed by the worker. */
@Injectable()
export class OutboxService {
  constructor(
    private readonly clock: ClockService,
    private readonly ids: IdGenerator,
  ) {}

  async publish(
    tx: Tx,
    type: string,
    payload: OutboxPayload,
    aggregateId?: string | null,
  ): Promise<string> {
    const id = this.ids.next();
    await tx.outboxEvent.create({
      data: {
        id,
        type,
        payload: { actorId: RequestContext.get().userId ?? null, ...payload },
        aggregateId: aggregateId ?? null,
        availableAt: this.clock.now(),
        createdAt: this.clock.now(),
      },
    });
    return id;
  }
}
