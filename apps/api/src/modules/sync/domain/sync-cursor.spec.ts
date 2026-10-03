import {
  collapseChanges,
  CURSOR_RETENTION_MS,
  cursorExpired,
  decodeCursor,
  encodeCursor,
  parseScope,
} from './sync-cursor';

const ID = '0192f0c4-0000-7000-8000-000000000001';

describe('sync cursor and scope (docs/08-mobile.md §5.1)', () => {
  it('parses the three phase-1 scopes and rejects anything else', () => {
    expect(parseScope('global')).toEqual({ kind: 'global', key: 'global' });
    expect(parseScope(`user:${ID}`)).toEqual({ kind: 'user', key: `user:${ID}`, id: ID });
    expect(parseScope(`project:${ID.toUpperCase()}`)).toEqual({
      kind: 'project',
      key: `project:${ID}`,
      id: ID,
    });
    for (const bad of ['', 'project:', 'project:x', `trip:${ID}`, `user:${ID}:x`, 'GLOBAL']) {
      expect(parseScope(bad)).toBeNull();
    }
  });

  it('round-trips change and snapshot cursors and rejects foreign strings', () => {
    const c = { mode: 'changes' as const, seq: 12345678901234n, issuedAt: 1 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    const s = { mode: 'snapshot' as const, maxSeq: 9n, kind: 2, after: ID, issuedAt: 5 };
    expect(decodeCursor(encodeCursor(s))).toEqual(s);
    expect(decodeCursor(encodeCursor({ ...s, after: null }))).toEqual({ ...s, after: null });
    for (const bad of ['', 'abc', Buffer.from('{"v":2,"s":"1","t":1}').toString('base64url')]) {
      expect(decodeCursor(bad)).toBeNull();
    }
    expect(
      decodeCursor(Buffer.from('{"v":1,"m":"1","k":0,"a":"x","t":1}').toString('base64url')),
    ).toBeNull();
  });

  it('a cursor older than the 90-day change-log retention is expired (SYNC_CURSOR_EXPIRED)', () => {
    const c = { mode: 'changes' as const, seq: 1n, issuedAt: 0 };
    expect(cursorExpired(c, CURSOR_RETENTION_MS)).toBe(false);
    expect(cursorExpired(c, CURSOR_RETENTION_MS + 1)).toBe(true);
  });

  it('collapses repeated changes to the last op in last-occurrence order, skipping unsynced types', () => {
    const rows = [
      { seq: 1n, entityType: 'Document', entityId: 'a', op: 'UPSERT' as const },
      { seq: 2n, entityType: 'Comment', entityId: 'c', op: 'UPSERT' as const },
      { seq: 3n, entityType: 'DocumentRevision', entityId: 'r', op: 'UPSERT' as const },
      { seq: 4n, entityType: 'Document', entityId: 'a', op: 'DELETE' as const },
    ];
    expect(collapseChanges(rows, new Set(['Document', 'DocumentRevision']))).toEqual([
      { entityType: 'DocumentRevision', id: 'r', op: 'UPSERT' },
      { entityType: 'Document', id: 'a', op: 'DELETE' },
    ]);
  });
});
