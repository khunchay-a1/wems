import 'package:clock/clock.dart';

/// Pull sync (server → device), docs/08-mobile.md §5.1. Pure Dart: the API and the local store
/// are interfaces so the algorithm is unit-tested with fakes (docs/08-mobile.md §11).

enum ChangeOp { upsert, delete }

class SyncChange {
  const SyncChange({required this.entityType, required this.op, required this.id, this.data});

  factory SyncChange.fromJson(Map<String, dynamic> j) => SyncChange(
        entityType: j['entityType'] as String,
        op: j['op'] == 'DELETE' ? ChangeOp.delete : ChangeOp.upsert,
        id: j['id'] as String,
        data: j['data'] is Map ? Map<String, dynamic>.from(j['data'] as Map) : null,
      );

  final String entityType;
  final ChangeOp op;
  final String id;
  final Map<String, dynamic>? data;
}

class PullPage {
  const PullPage({
    required this.scope,
    required this.changes,
    required this.nextCursor,
    required this.hasMore,
    required this.serverTime,
  });

  factory PullPage.fromJson(Map<String, dynamic> j) => PullPage(
        scope: j['scope'] as String,
        changes: (j['changes'] as List<dynamic>)
            .map((c) => SyncChange.fromJson(Map<String, dynamic>.from(c as Map)))
            .toList(),
        nextCursor: j['nextCursor'] as String,
        hasMore: j['hasMore'] as bool,
        serverTime: DateTime.parse(j['serverTime'] as String).toUtc(),
      );

  final String scope;
  final List<SyncChange> changes;
  final String nextCursor;
  final bool hasMore;
  final DateTime serverTime;
}

/// 410 SYNC_CURSOR_EXPIRED — drop the scope's data and take a new snapshot.
class SyncCursorExpired implements Exception {
  const SyncCursorExpired();
}

/// 403 SYNC_SCOPE_FORBIDDEN — the user lost access; drop the scope's data.
class SyncScopeForbidden implements Exception {
  const SyncScopeForbidden();
}

abstract interface class SyncApi {
  Future<PullPage> pull(String scope, {String? cursor, int limit});
}

class ScopeState {
  const ScopeState({this.cursor, this.snapshotGen});

  final String? cursor;

  /// Set while a snapshot is in progress (survives app restarts); rows of the scope that the
  /// snapshot did not touch are pruned when it completes.
  final int? snapshotGen;
}

abstract interface class SyncStore {
  Future<ScopeState> state(String scope);

  /// Applies one page and stores [nextCursor] in a single transaction.
  Future<void> applyPage(
    String scope,
    List<SyncChange> changes, {
    required String nextCursor,
    required int? snapshotGen,
  });

  /// Deletes rows of [scope] not written by snapshot [gen] and ends the snapshot.
  Future<void> finishSnapshot(String scope, int gen);

  /// Deletes every row and the cursor of [scope].
  Future<void> clearScope(String scope);

  /// Scopes that have data or a cursor on the device.
  Future<Set<String>> knownScopes();
}

enum PullStatus { ok, forbidden }

class PullOutcome {
  const PullOutcome(this.status, {this.changes = 0, this.pages = 0, this.serverTime});

  final PullStatus status;
  final int changes;
  final int pages;
  final DateTime? serverTime;
}

/// Device clock more than 10 minutes off the server → warn (docs/08-mobile.md §5.4).
bool clockSkewed(DateTime serverTime, DateTime deviceNow) =>
    serverTime.difference(deviceNow).abs() > const Duration(minutes: 10);

class PullSync {
  PullSync({required this.api, required this.store, this.limit = 500});

  final SyncApi api;
  final SyncStore store;
  final int limit;

  int _newGen() => clock.now().microsecondsSinceEpoch;

  /// Pulls [scope] until `hasMore` is false. A snapshot interrupted midway resumes from its
  /// cursor on the next call.
  Future<PullOutcome> pullScope(String scope) async {
    final st = await store.state(scope);
    var cursor = st.cursor;
    var gen = st.snapshotGen ?? (cursor == null ? _newGen() : null);
    var restarted = false;
    var changes = 0;
    var pages = 0;
    DateTime? serverTime;
    while (true) {
      final PullPage page;
      try {
        page = await api.pull(scope, cursor: cursor, limit: limit);
      } on SyncCursorExpired {
        if (restarted) rethrow;
        restarted = true;
        await store.clearScope(scope);
        cursor = null;
        gen = _newGen();
        continue;
      } on SyncScopeForbidden {
        await store.clearScope(scope);
        return const PullOutcome(PullStatus.forbidden);
      }
      await store.applyPage(scope, page.changes, nextCursor: page.nextCursor, snapshotGen: gen);
      changes += page.changes.length;
      pages += 1;
      serverTime = page.serverTime;
      cursor = page.nextCursor;
      if (!page.hasMore) break;
    }
    if (gen != null) await store.finishSnapshot(scope, gen);
    return PullOutcome(PullStatus.ok, changes: changes, pages: pages, serverTime: serverTime);
  }

  /// Pulls every wanted scope and forgets scopes the device no longer follows.
  Future<Map<String, PullOutcome>> pullAll(List<String> scopes) async {
    final out = <String, PullOutcome>{};
    for (final stale in (await store.knownScopes()).difference(scopes.toSet())) {
      await store.clearScope(stale);
    }
    for (final s in scopes) {
      out[s] = await pullScope(s);
    }
    return out;
  }
}
