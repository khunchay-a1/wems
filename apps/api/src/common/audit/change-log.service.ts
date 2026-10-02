import { Injectable } from '@nestjs/common';
import type { ChangeOp } from '../../generated/prisma/client';
import type { Tx } from '../prisma/helpers';
import { ClockService } from '../time/clock';

/** scopeKey builders (docs/03-data-model.md §8). */
export const Scope = {
  project: (projectId: string) => `project:${projectId}`,
  user: (userId: string) => `user:${userId}`,
  global: 'global',
} as const;

/** Change feed for mobile pull sync — written in the same transaction as the data (ADR-0004). */
@Injectable()
export class ChangeLogService {
  constructor(private readonly clock: ClockService) {}

  async touch(
    tx: Tx,
    scopeKey: string,
    entityType: string,
    entityId: string,
    op: ChangeOp = 'UPSERT',
  ): Promise<void> {
    await tx.changeLog.create({
      data: { scopeKey, entityType, entityId, op, changedAt: this.clock.now() },
    });
  }
}
