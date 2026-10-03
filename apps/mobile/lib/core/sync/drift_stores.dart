import 'dart:convert';

import 'package:clock/clock.dart';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart';

import '../api/problem.dart';
import '../db/database.dart';
import 'outbox.dart';
import 'pull_sync.dart';

/// Index columns per synced entity type (docs/08-mobile.md §5.1 table).
({String? parentId, String? sortKey}) indexFor(String entityType, Map<String, dynamic> d) {
  String pad(Object? n) => (n is num ? n.toInt() : 0).toString().padLeft(6, '0');
  return switch (entityType) {
    'Project' => (parentId: null, sortKey: d['code'] as String?),
    'ProjectMember' => (parentId: d['projectId'] as String?, sortKey: d['displayName'] as String?),
    'Document' => (parentId: d['projectId'] as String?, sortKey: d['number'] as String?),
    'DocumentRevision' => (parentId: d['documentId'] as String?, sortKey: pad(d['revIndex'])),
    'ReviewStep' => (parentId: d['projectId'] as String?, sortKey: (d['dueAt'] as String?) ?? '9999'),
    _ => (parentId: null, sortKey: pad(d['sortOrder'])),
  };
}

class DriftSyncStore implements SyncStore {
  DriftSyncStore(this.db);

  final AppDatabase db;

  @override
  Future<ScopeState> state(String scope) async {
    final row = await (db.select(db.syncCursors)..where((t) => t.scope.equals(scope)))
        .getSingleOrNull();
    return ScopeState(cursor: row?.cursor, snapshotGen: row?.snapshotGen);
  }

  @override
  Future<void> applyPage(
    String scope,
    List<SyncChange> changes, {
    required String nextCursor,
    required int? snapshotGen,
  }) =>
      db.transaction(() async {
        for (final c in changes) {
          if (c.op == ChangeOp.delete || c.data == null) {
            await (db.delete(db.entities)
                  ..where((t) =>
                      t.entityType.equals(c.entityType) & t.id.equals(c.id) & t.scope.equals(scope)))
                .go();
            continue;
          }
          final ix = indexFor(c.entityType, c.data!);
          await db.into(db.entities).insertOnConflictUpdate(EntitiesCompanion.insert(
                entityType: c.entityType,
                id: c.id,
                scope: scope,
                parentId: Value(ix.parentId),
                sortKey: Value(ix.sortKey),
                data: jsonEncode(c.data),
                gen: Value(snapshotGen),
              ));
        }
        await db.into(db.syncCursors).insertOnConflictUpdate(SyncCursorsCompanion.insert(
              scope: scope,
              cursor: Value(nextCursor),
              snapshotGen: Value(snapshotGen),
              syncedAt: Value(clock.now().toUtc()),
            ));
      });

  @override
  Future<void> finishSnapshot(String scope, int gen) => db.transaction(() async {
        await (db.delete(db.entities)
              ..where((t) => t.scope.equals(scope) & (t.gen.isNull() | t.gen.equals(gen).not())))
            .go();
        await (db.update(db.syncCursors)..where((t) => t.scope.equals(scope)))
            .write(const SyncCursorsCompanion(snapshotGen: Value(null)));
      });

  @override
  Future<void> clearScope(String scope) => db.transaction(() async {
        await (db.delete(db.entities)..where((t) => t.scope.equals(scope))).go();
        await (db.delete(db.syncCursors)..where((t) => t.scope.equals(scope))).go();
      });

  @override
  Future<Set<String>> knownScopes() async {
    final cursors = await db.select(db.syncCursors).get();
    return cursors.map((c) => c.scope).toSet();
  }
}

class DriftOutboxStore implements OutboxStore {
  DriftOutboxStore(this.db);

  final AppDatabase db;

  static OutboxEntry toEntry(OutboxRow r) => OutboxEntry(
        seq: r.seq,
        method: r.method,
        path: r.path,
        body: r.body,
        idempotencyKey: r.idempotencyKey,
        entityType: r.entityType,
        entityId: r.entityId,
        dependsOnSeq: r.dependsOnSeq,
        status: OutboxStatus.fromDb(r.status),
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt,
        lastError: r.lastError,
        createdAt: r.createdAt,
      );

  @override
  Future<List<OutboxEntry>> open() async {
    final rows = await (db.select(db.outboxItems)
          ..where((t) => t.status.isIn(['PENDING', 'IN_FLIGHT']))
          ..orderBy([(t) => OrderingTerm.asc(t.seq)]))
        .get();
    return rows.map(toEntry).toList();
  }

  @override
  Future<OutboxStatus?> statusOf(int seq) async {
    final r = await (db.select(db.outboxItems)..where((t) => t.seq.equals(seq))).getSingleOrNull();
    return r == null ? null : OutboxStatus.fromDb(r.status);
  }

  @override
  Future<void> save(OutboxEntry e) =>
      (db.update(db.outboxItems)..where((t) => t.seq.equals(e.seq))).write(OutboxItemsCompanion(
        status: Value(e.status.db),
        attempts: Value(e.attempts),
        nextAttemptAt: Value(e.nextAttemptAt),
        lastError: Value(e.lastError),
      ));

  /// Queues a request; returns its seq (docs/08-mobile.md §5.2).
  Future<int> enqueue({
    required String method,
    required String path,
    required String idempotencyKey,
    Object? body,
    String? entityType,
    String? entityId,
    int? dependsOnSeq,
  }) =>
      db.into(db.outboxItems).insert(OutboxItemsCompanion.insert(
            method: method,
            path: path,
            body: Value(body == null ? null : jsonEncode(body)),
            idempotencyKey: idempotencyKey,
            entityType: Value(entityType),
            entityId: Value(entityId),
            dependsOnSeq: Value(dependsOnSeq),
            createdAt: clock.now().toUtc(),
          ));

  /// Entries the user has to look at (FAILED / CONFLICT) plus those still waiting.
  Stream<({int pending, int needsAttention})> watchCounts() =>
      db.select(db.outboxItems).watch().map((rows) => (
            pending: rows.where((r) => r.status == 'PENDING' || r.status == 'IN_FLIGHT').length,
            needsAttention: rows.where((r) => r.status == 'FAILED' || r.status == 'CONFLICT').length,
          ));

  Future<int> pendingCount() async =>
      (await open()).length;

  /// DONE entries are kept a week for the sync status screen, then removed.
  Future<void> prune() => (db.delete(db.outboxItems)
        ..where((t) =>
            t.status.equals('DONE') &
            t.createdAt.isSmallerThanValue(clock.now().toUtc().subtract(const Duration(days: 7)))))
      .go();
}

/// Sends outbox entries through the authenticated Dio (Idempotency-Key from the entry).
class DioOutboxTransport implements OutboxTransport {
  DioOutboxTransport(this.dio);

  final Dio dio;

  @override
  Future<TransportResult> send(OutboxEntry e, Object? body) async {
    try {
      final res = await dio.request<dynamic>(
        e.path,
        data: body,
        options: Options(method: e.method, headers: {'Idempotency-Key': e.idempotencyKey}),
      );
      return TransportResult(res.statusCode ?? 200, res.data);
    } on DioException catch (err) {
      final p = ApiProblem.fromDio(err);
      return TransportResult(p.status, err.response?.data);
    }
  }
}
