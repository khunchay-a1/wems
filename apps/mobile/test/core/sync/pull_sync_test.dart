import 'package:clock/clock.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wems_mobile/core/sync/pull_sync.dart';

/// Scripted server: each call returns the next response (a page or an exception).
class FakeApi implements SyncApi {
  FakeApi(this.script);
  final List<Object> script;
  final calls = <({String scope, String? cursor})>[];

  @override
  Future<PullPage> pull(String scope, {String? cursor, int limit = 500}) async {
    calls.add((scope: scope, cursor: cursor));
    final next = script.removeAt(0);
    if (next is Exception) throw next;
    return next as PullPage;
  }
}

class MemoryStore implements SyncStore {
  final rows = <String, Map<String, ({Map<String, dynamic>? data, int? gen})>>{};
  final cursors = <String, ScopeState>{};

  String _key(SyncChange c) => '${c.entityType}:${c.id}';

  @override
  Future<ScopeState> state(String scope) async => cursors[scope] ?? const ScopeState();

  @override
  Future<void> applyPage(String scope, List<SyncChange> changes,
      {required String nextCursor, required int? snapshotGen}) async {
    final m = rows.putIfAbsent(scope, () => {});
    for (final c in changes) {
      if (c.op == ChangeOp.delete) {
        m.remove(_key(c));
      } else {
        m[_key(c)] = (data: c.data, gen: snapshotGen);
      }
    }
    cursors[scope] = ScopeState(cursor: nextCursor, snapshotGen: snapshotGen);
  }

  @override
  Future<void> finishSnapshot(String scope, int gen) async {
    rows[scope]?.removeWhere((_, v) => v.gen != gen);
    cursors[scope] = ScopeState(cursor: cursors[scope]?.cursor);
  }

  @override
  Future<void> clearScope(String scope) async {
    rows.remove(scope);
    cursors.remove(scope);
  }

  @override
  Future<Set<String>> knownScopes() async => cursors.keys.toSet();

  Set<String> ids(String scope) => rows[scope]?.keys.toSet() ?? {};
}

PullPage page(List<SyncChange> changes, String cursor, {bool hasMore = false, DateTime? at}) =>
    PullPage(
      scope: 'project:p1',
      changes: changes,
      nextCursor: cursor,
      hasMore: hasMore,
      serverTime: at ?? DateTime.utc(2026, 10, 3, 10),
    );

SyncChange up(String type, String id, [Map<String, dynamic>? data]) =>
    SyncChange(entityType: type, op: ChangeOp.upsert, id: id, data: data ?? {'id': id});
SyncChange del(String type, String id) => SyncChange(entityType: type, op: ChangeOp.delete, id: id);

void main() {
  const scope = 'project:p1';

  test('snapshot pages until hasMore is false, then follows the change log from its cursor', () async {
    final store = MemoryStore();
    final api = FakeApi([
      page([up('Project', 'p1'), up('Document', 'd1')], 's1', hasMore: true),
      page([up('Document', 'd2')], 'c10'),
      page([up('Document', 'd1', {'title': 'new'}), del('Document', 'd2')], 'c12'),
    ]);
    final sync = PullSync(api: api, store: store);

    final first = await sync.pullScope(scope);
    expect(first.status, PullStatus.ok);
    expect(first.pages, 2);
    expect(api.calls.map((c) => c.cursor), [null, 's1']);
    expect(store.ids(scope), {'Project:p1', 'Document:d1', 'Document:d2'});
    expect(store.cursors[scope]!.snapshotGen, isNull);

    await sync.pullScope(scope);
    expect(api.calls.last.cursor, 'c10');
    expect(store.ids(scope), {'Project:p1', 'Document:d1'});
    expect(store.rows[scope]!['Document:d1']!.data, {'title': 'new'});
  });

  test('an interrupted snapshot resumes from its cursor and still prunes rows it did not send', () async {
    final store = MemoryStore();
    // stale row from an earlier life of the scope
    await store.applyPage(scope, [up('Document', 'old')], nextCursor: 'x', snapshotGen: null);
    store.cursors[scope] = const ScopeState(); // e.g. after a reset: no cursor → snapshot
    final api = FakeApi([
      page([up('Document', 'd1')], 's1', hasMore: true),
      Exception('connection reset'),
    ]);
    final sync = PullSync(api: api, store: store);
    await expectLater(sync.pullScope(scope), throwsException);
    expect(store.cursors[scope]!.cursor, 's1');
    expect(store.cursors[scope]!.snapshotGen, isNotNull);

    api.script.add(page([up('Document', 'd2')], 'c5'));
    await sync.pullScope(scope);
    expect(api.calls.last.cursor, 's1');
    expect(store.ids(scope), {'Document:d1', 'Document:d2'});
  });

  test('410 SYNC_CURSOR_EXPIRED drops the scope and takes a new snapshot', () async {
    final store = MemoryStore();
    await store.applyPage(scope, [up('Document', 'gone')], nextCursor: 'c1', snapshotGen: null);
    final api = FakeApi([
      const SyncCursorExpired(),
      page([up('Document', 'd1')], 'c9'),
    ]);
    final out = await PullSync(api: api, store: store).pullScope(scope);
    expect(out.status, PullStatus.ok);
    expect(api.calls.map((c) => c.cursor), ['c1', null]);
    expect(store.ids(scope), {'Document:d1'});
  });

  test('403 SYNC_SCOPE_FORBIDDEN removes the scope data', () async {
    final store = MemoryStore();
    await store.applyPage(scope, [up('Document', 'd1')], nextCursor: 'c1', snapshotGen: null);
    final out = await PullSync(api: FakeApi([const SyncScopeForbidden()]), store: store).pullScope(scope);
    expect(out.status, PullStatus.forbidden);
    expect(store.ids(scope), isEmpty);
    expect(store.cursors.containsKey(scope), isFalse);
  });

  test('pullAll forgets scopes that are no longer followed', () async {
    final store = MemoryStore();
    await store.applyPage('project:old', [up('Document', 'x')], nextCursor: 'c', snapshotGen: null);
    final api = FakeApi([page(const [], 'g1')]);
    await PullSync(api: api, store: store).pullAll(['global']);
    expect(store.knownScopes(), completion({'global'}));
    expect(store.ids('project:old'), isEmpty);
  });

  test('clock skew above 10 minutes is reported (docs/08-mobile.md §5.4)', () {
    final server = DateTime.utc(2026, 10, 3, 10);
    expect(clockSkewed(server, server.add(const Duration(minutes: 10))), isFalse);
    expect(clockSkewed(server, server.subtract(const Duration(minutes: 11))), isTrue);
  });

  test('PullPage parses the API shape', () {
    final p = PullPage.fromJson({
      'scope': 'global',
      'changes': [
        {'entityType': 'Discipline', 'op': 'UPSERT', 'id': 'a', 'data': {'code': 'PR'}},
        {'entityType': 'Discipline', 'op': 'DELETE', 'id': 'b'},
      ],
      'nextCursor': 'abc',
      'hasMore': false,
      'serverTime': '2026-10-03T10:00:00.000Z',
    });
    expect(p.changes.first.data, {'code': 'PR'});
    expect(p.changes.last.op, ChangeOp.delete);
    expect(p.serverTime, DateTime.utc(2026, 10, 3, 10));
  });

  test('snapshot generations come from the injected clock', () async {
    final store = MemoryStore();
    final api = FakeApi([page([up('Document', 'd1')], 'c1', hasMore: true), Exception('x')]);
    await withClock(Clock.fixed(DateTime.utc(2026, 1, 1)), () async {
      await expectLater(PullSync(api: api, store: store).pullScope(scope), throwsException);
    });
    expect(store.cursors[scope]!.snapshotGen, DateTime.utc(2026, 1, 1).microsecondsSinceEpoch);
  });
}
