import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wems_mobile/core/api/api_client.dart';
import 'package:wems_mobile/core/api/wems_api.dart';
import 'package:wems_mobile/core/auth/token_store.dart';
import 'package:wems_mobile/core/db/database.dart';
import 'package:wems_mobile/core/files/offline_store.dart';
import 'package:wems_mobile/core/sync/drift_stores.dart';
import 'package:wems_mobile/core/sync/outbox.dart';
import 'package:wems_mobile/core/sync/pull_sync.dart';

/// drift in memory (docs/08-mobile.md §11): the real SQL behind the sync store and the outbox.
void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  SyncChange doc(String id, {String? title}) => SyncChange(
        entityType: 'Document',
        op: ChangeOp.upsert,
        id: id,
        data: {'id': id, 'projectId': 'p1', 'number': 'N-$id', 'title': title ?? id},
      );

  test('pages are applied with their cursor; snapshot completion prunes untouched rows', () async {
    final store = DriftSyncStore(db);
    await store.applyPage('project:p1', [doc('old')], nextCursor: 'c0', snapshotGen: null);
    await store.applyPage('project:p1', [doc('a'), doc('b')], nextCursor: 's1', snapshotGen: 7);
    await store.finishSnapshot('project:p1', 7);

    final rows = await db.select(db.entities).get();
    expect(rows.map((r) => r.id).toSet(), {'a', 'b'});
    expect(rows.first.parentId, 'p1');
    final st = await store.state('project:p1');
    expect(st.cursor, 's1');
    expect(st.snapshotGen, isNull);

    await store.applyPage(
      'project:p1',
      [doc('a', title: 'renamed'), const SyncChange(entityType: 'Document', op: ChangeOp.delete, id: 'b')],
      nextCursor: 'c2',
      snapshotGen: null,
    );
    final after = await db.select(db.entities).get();
    expect(after.single.id, 'a');
    expect((jsonDecode(after.single.data) as Map)['title'], 'renamed');

    await store.clearScope('project:p1');
    expect(await db.select(db.entities).get(), isEmpty);
    expect(await store.knownScopes(), isEmpty);
  });

  test('outbox rows round-trip through the processor', () async {
    final store = DriftOutboxStore(db);
    final first = await store.enqueue(method: 'POST', path: '/notifications/n1/read', idempotencyKey: 'k1');
    await store.enqueue(
      method: 'POST',
      path: '/x',
      idempotencyKey: 'k2',
      body: {'a': 1},
      dependsOnSeq: first,
    );
    final open = await store.open();
    expect(open.map((e) => e.idempotencyKey), ['k1', 'k2']);
    expect(open.last.dependsOnSeq, first);

    await store.save(open.first.copyWith(status: OutboxStatus.done));
    expect(await store.statusOf(first), OutboxStatus.done);
    expect((await store.open()).single.idempotencyKey, 'k2');
  });

  test('offline pins become "old" when the working revision changes', () async {
    await db.into(db.entities).insert(EntitiesCompanion.insert(
          entityType: 'Document',
          id: 'd1',
          scope: 'project:p1',
          data: jsonEncode({'id': 'd1', 'latestApprovedRevisionId': 'r2'}),
        ));
    final now = DateTime.utc(2026, 10, 3);
    await db.into(db.localFiles).insert(LocalFilesCompanion.insert(
          revisionId: 'r1',
          documentId: 'd1',
          revLabel: '0',
          path: '/nonexistent/r1.pdf',
          sha256: 'x',
          sizeBytes: 10,
          pinned: const Value(true),
          savedAt: now,
          lastOpenedAt: now,
        ));
    // reconcile without downloads never calls the API
    final api = WemsApi(ApiClient(baseUrl: 'http://127.0.0.1:9', tokens: TokenStore(), locale: () => 'th'));
    final store = OfflineStore(db: db, api: api, root: Directory.systemTemp);
    await store.reconcile(mayDownload: false);
    final pin = await db.select(db.localFiles).getSingle();
    expect(pin.stale, isTrue);
  });

  test('revision banner (docs/08-mobile.md §6)', () {
    expect(
      bannerFor(revisionId: 'r2', revisionStatus: 'APPROVED', latestApprovedRevisionId: 'r2'),
      RevisionBanner.working,
    );
    expect(
      bannerFor(revisionId: 'r1', revisionStatus: 'SUPERSEDED', latestApprovedRevisionId: 'r2'),
      RevisionBanner.old,
    );
    expect(
      bannerFor(revisionId: 'r1', revisionStatus: 'APPROVED', latestApprovedRevisionId: 'r2'),
      RevisionBanner.old,
    );
    expect(
      bannerFor(revisionId: 'r3', revisionStatus: 'IN_REVIEW', latestApprovedRevisionId: 'r2'),
      RevisionBanner.notApproved,
    );
    expect(
      bannerFor(revisionId: 'r1', revisionStatus: 'DRAFT', latestApprovedRevisionId: null),
      RevisionBanner.notApproved,
    );
  });
}
