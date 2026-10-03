/**
 * Pull-sync scopes and opaque cursors (docs/08-mobile.md §5.1, ADR-0004). Pure functions.
 *
 * A cursor is base64url(JSON):
 * - change-log mode `{ v: 1, s: "<seq>", t: <issuedAtMs> }` — read `change_logs.seq > s`
 * - snapshot mode `{ v: 1, m: "<maxSeq>", k: <kindIndex>, a: "<lastId>" | null, t }` — page through
 *   current entities of kind `k` with id > a; when every kind is done the cursor becomes `{ s: m }`.
 */

export type SyncScope =
  | { kind: 'global'; key: 'global' }
  | { kind: 'user'; key: string; id: string }
  | { kind: 'project'; key: string; id: string };

export type SyncCursor =
  | { mode: 'changes'; seq: bigint; issuedAt: number }
  | { mode: 'snapshot'; maxSeq: bigint; kind: number; after: string | null; issuedAt: number };

/** Change logs older than this are pruned (cleanup task) → older cursors get 410. */
export const CURSOR_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses `global` · `user:<uuid>` · `project:<uuid>`; null when malformed. */
export function parseScope(raw: string): SyncScope | null {
  if (raw === 'global') return { kind: 'global', key: 'global' };
  const m = /^(user|project):(.+)$/.exec(raw);
  if (!m || !UUID.test(m[2]!)) return null;
  const id = m[2]!.toLowerCase();
  return { kind: m[1] as 'user' | 'project', key: `${m[1]}:${id}`, id };
}

export function encodeCursor(c: SyncCursor): string {
  const body =
    c.mode === 'changes'
      ? { v: 1, s: c.seq.toString(), t: c.issuedAt }
      : { v: 1, m: c.maxSeq.toString(), k: c.kind, a: c.after, t: c.issuedAt };
  return Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
}

/** Decodes a cursor; null when it is not one we issued. */
export function decodeCursor(raw: string): SyncCursor | null {
  try {
    const o = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (o.v !== 1 || typeof o.t !== 'number') return null;
    if (typeof o.s === 'string' && /^\d+$/.test(o.s)) {
      return { mode: 'changes', seq: BigInt(o.s), issuedAt: o.t };
    }
    if (
      typeof o.m === 'string' &&
      /^\d+$/.test(o.m) &&
      typeof o.k === 'number' &&
      Number.isInteger(o.k) &&
      o.k >= 0 &&
      (o.a === null || (typeof o.a === 'string' && UUID.test(o.a)))
    ) {
      return { mode: 'snapshot', maxSeq: BigInt(o.m), kind: o.k, after: o.a, issuedAt: o.t };
    }
    return null;
  } catch {
    return null;
  }
}

/** 410 SYNC_CURSOR_EXPIRED when the device has not pulled within the change-log retention. */
export function cursorExpired(c: SyncCursor, nowMs: number): boolean {
  return nowMs - c.issuedAt > CURSOR_RETENTION_MS;
}

export interface ChangeRow {
  seq: bigint;
  entityType: string;
  entityId: string;
  op: 'UPSERT' | 'DELETE';
}

/**
 * Collapses repeated changes of one entity to its last op, ordered by the last occurrence, and
 * drops entity types the device does not store.
 */
export function collapseChanges(
  rows: ChangeRow[],
  synced: ReadonlySet<string>,
): { entityType: string; id: string; op: 'UPSERT' | 'DELETE' }[] {
  const last = new Map<string, { entityType: string; id: string; op: 'UPSERT' | 'DELETE' }>();
  for (const r of rows) {
    if (!synced.has(r.entityType)) continue;
    const k = `${r.entityType}:${r.entityId}`;
    last.delete(k);
    last.set(k, { entityType: r.entityType, id: r.entityId, op: r.op });
  }
  return [...last.values()];
}
