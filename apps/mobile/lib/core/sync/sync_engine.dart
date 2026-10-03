import 'dart:async';

import 'package:clock/clock.dart';

import '../api/problem.dart';
import '../files/offline_store.dart';
import 'drift_stores.dart';
import 'outbox.dart';
import 'pull_sync.dart';

class SyncStatus {
  const SyncStatus({
    this.running = false,
    this.lastSyncedAt,
    this.offline = false,
    this.clockSkew = false,
    this.error,
  });

  final bool running;
  final DateTime? lastSyncedAt;
  final bool offline;

  /// Device clock differs from the server by more than 10 minutes (docs/08-mobile.md §5.4).
  final bool clockSkew;
  final String? error;

  SyncStatus copyWith({
    bool? running,
    DateTime? lastSyncedAt,
    bool? offline,
    bool? clockSkew,
    String? error,
    bool clearError = false,
  }) =>
      SyncStatus(
        running: running ?? this.running,
        lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
        offline: offline ?? this.offline,
        clockSkew: clockSkew ?? this.clockSkew,
        error: clearError ? null : (error ?? this.error),
      );
}

/// One sync round: push the outbox, pull every followed scope, then reconcile offline pins.
/// Triggers (docs/08-mobile.md §5.2): app start, back online, after a save (debounced 2 s),
/// pull-to-refresh and the 15-minute background task.
class SyncEngine {
  SyncEngine({
    required this.pull,
    required this.outbox,
    required this.outboxStore,
    required this.offline,
    required this.scopes,
    required this.mayDownload,
  });

  final PullSync pull;
  final OutboxProcessor outbox;
  final DriftOutboxStore outboxStore;
  final OfflineStore offline;
  /// Scopes to pull; null while nobody is signed in (then nothing is sent or pulled).
  final Future<List<String>?> Function() scopes;
  final Future<bool> Function() mayDownload;

  final _controller = StreamController<SyncStatus>.broadcast();
  SyncStatus _status = const SyncStatus();
  Future<void>? _running;
  Timer? _debounce;

  SyncStatus get current => _status;
  Stream<SyncStatus> get status => _controller.stream;

  void _emit(SyncStatus s) {
    _status = s;
    _controller.add(s);
  }

  Future<void> syncNow() => _running ??= _run().whenComplete(() => _running = null);

  /// After a local save: coalesce bursts into one sync.
  void requestSoon() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(seconds: 2), () => unawaited(syncNow()));
  }

  Future<void> _run() async {
    final wanted = await scopes();
    if (wanted == null) return;
    _emit(_status.copyWith(running: true, clearError: true));
    try {
      final pushed = await outbox.run();
      await outboxStore.prune();
      final outcomes = await pull.pullAll(wanted);
      final serverTime = outcomes.values
          .map((o) => o.serverTime)
          .whereType<DateTime>()
          .fold<DateTime?>(null, (a, b) => a == null || b.isAfter(a) ? b : a);
      await offline.reconcile(mayDownload: await mayDownload());
      _emit(_status.copyWith(
        running: false,
        offline: pushed.offline,
        lastSyncedAt: clock.now().toUtc(),
        clockSkew: serverTime != null && clockSkewed(serverTime, clock.now().toUtc()),
      ));
    } on ApiProblem catch (p) {
      _emit(_status.copyWith(running: false, offline: p.isNetwork, error: p.isNetwork ? null : p.code));
    } on SyncCursorExpired {
      _emit(_status.copyWith(running: false, error: 'SYNC_CURSOR_EXPIRED'));
    }
  }

  void dispose() {
    _debounce?.cancel();
    unawaited(_controller.close());
  }
}
