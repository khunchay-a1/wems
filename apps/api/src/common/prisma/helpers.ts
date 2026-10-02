import { Prisma } from '../../generated/prisma/client';
import { ConflictProblem, NotFoundProblem } from '../errors/problem';

/** Transaction client type passed between services inside one $transaction. */
export type Tx = Prisma.TransactionClient;

/** Soft-delete filter — every query on a model with deletedAt must use it (docs/03-data-model.md §5). */
export const notDeleted = { deletedAt: null } as const;

/**
 * Optimistic locking (docs/03-data-model.md §6): run `updateMany({ where: { id, version }, ... })`
 * and translate "0 rows" into 409 CONFLICT_STALE_VERSION (or 404 when the row is gone).
 */
export async function assertVersionedUpdate(
  result: Prisma.BatchPayload,
  exists: () => Promise<boolean>,
  current?: () => Promise<unknown>,
): Promise<void> {
  if (result.count > 0) return;
  if (!(await exists())) throw NotFoundProblem();
  throw ConflictProblem(
    'CONFLICT_STALE_VERSION',
    current ? { current: await current() } : undefined,
  );
}

/** Increment helper for the version column. */
export const bumpVersion = { version: { increment: 1 } } as const;

/** Date-only columns: serialize without timezone shifts ("YYYY-MM-DD"). */
export function toDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/** Parses "YYYY-MM-DD" into a UTC-midnight Date for @db.Date columns. */
export function fromDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

/** Decimal → string for JSON (CLAUDE.md rule 6). */
export function decimalToString(value: Prisma.Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}

/** ISO timestamp or null. */
export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
