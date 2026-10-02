import { Injectable } from '@nestjs/common';
import type { ActorType, Prisma } from '../../generated/prisma/client';
import { RequestContext } from '../http/request-context';
import type { Tx } from '../prisma/helpers';
import { ClockService } from '../time/clock';

export interface AuditEntry {
  /** "<entity>.<verb>", e.g. "document.revision.submit", "auth.login_failed" */
  action: string;
  entityType: string;
  entityId?: string | null;
  projectId?: string | null;
  summary?: string;
  changes?: { before: Record<string, unknown>; after: Record<string, unknown> };
  reason?: string | null;
  actorId?: string | null;
  actorType?: ActorType;
}

/** Append-only audit trail written inside the same transaction as the change (CLAUDE.md rule 3). */
@Injectable()
export class AuditService {
  constructor(private readonly clock: ClockService) {}

  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    const ctx = RequestContext.get();
    await tx.auditLog.create({
      data: {
        occurredAt: this.clock.now(),
        actorType: entry.actorType ?? ((entry.actorId ?? ctx.userId) ? 'USER' : 'SYSTEM'),
        actorId: entry.actorId ?? ctx.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        projectId: entry.projectId ?? null,
        summary: entry.summary ?? null,
        changes: (entry.changes as Prisma.InputJsonValue | undefined) ?? undefined,
        reason: entry.reason ?? null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        requestId: ctx.requestId ?? null,
      },
    });
  }
}

/** Shallow diff of the fields that changed — AuditLog.changes (docs/03-data-model.md §4). */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | undefined {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const av = normalize(after[key]);
    const bv = normalize(before[key]);
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      b[key] = bv;
      a[key] = av;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : undefined;
}

function normalize(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (
    v &&
    typeof v === 'object' &&
    'toFixed' in v &&
    typeof (v as { toString: () => string }).toString === 'function'
  ) {
    return (v as { toString: () => string }).toString();
  }
  return v ?? null;
}
