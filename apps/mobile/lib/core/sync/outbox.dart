import 'dart:convert';

import 'package:clock/clock.dart';

/// Push sync (device → server) through the outbox, docs/08-mobile.md §5.2. Pure Dart.

enum OutboxStatus {
  pending,
  inFlight,
  done,
  failed,
  conflict;

  String get db => switch (this) {
        pending => 'PENDING',
        inFlight => 'IN_FLIGHT',
        done => 'DONE',
        failed => 'FAILED',
        conflict => 'CONFLICT',
      };

  static OutboxStatus fromDb(String v) => switch (v) {
        'IN_FLIGHT' => inFlight,
        'DONE' => done,
        'FAILED' => failed,
        'CONFLICT' => conflict,
        _ => pending,
      };
}

class OutboxEntry {
  const OutboxEntry({
    required this.seq,
    required this.method,
    required this.path,
    required this.idempotencyKey,
    required this.createdAt,
    this.body,
    this.entityType,
    this.entityId,
    this.dependsOnSeq,
    this.status = OutboxStatus.pending,
    this.attempts = 0,
    this.nextAttemptAt,
    this.lastError,
  });

  final int seq;
  final String method;
  final String path;

  /// JSON text; may contain `"$upload:<uploadId>"` placeholders.
  final String? body;
  final String idempotencyKey;
  final String? entityType;
  final String? entityId;
  final int? dependsOnSeq;
  final OutboxStatus status;
  final int attempts;
  final DateTime? nextAttemptAt;
  final String? lastError;
  final DateTime createdAt;

  OutboxEntry copyWith({
    OutboxStatus? status,
    int? attempts,
    DateTime? nextAttemptAt,
    bool clearNextAttempt = false,
    String? lastError,
    bool clearError = false,
  }) =>
      OutboxEntry(
        seq: seq,
        method: method,
        path: path,
        body: body,
        idempotencyKey: idempotencyKey,
        entityType: entityType,
        entityId: entityId,
        dependsOnSeq: dependsOnSeq,
        createdAt: createdAt,
        status: status ?? this.status,
        attempts: attempts ?? this.attempts,
        nextAttemptAt: clearNextAttempt ? null : (nextAttemptAt ?? this.nextAttemptAt),
        lastError: clearError ? null : (lastError ?? this.lastError),
      );
}

abstract interface class OutboxStore {
  /// PENDING and IN_FLIGHT entries ordered by seq.
  Future<List<OutboxEntry>> open();
  Future<OutboxStatus?> statusOf(int seq);
  Future<void> save(OutboxEntry entry);
}

class TransportResult {
  const TransportResult(this.status, [this.body]);

  /// HTTP status; 0 = no response (offline, timeout).
  final int status;
  final Object? body;
}

abstract interface class OutboxTransport {
  /// Sends with the `Idempotency-Key` header of [entry]; never throws for HTTP errors.
  Future<TransportResult> send(OutboxEntry entry, Object? body);
}

/// 5 s, 30 s, 2 min, 10 min, then hourly.
Duration backoffFor(int attempts) {
  const steps = [
    Duration(seconds: 5),
    Duration(seconds: 30),
    Duration(minutes: 2),
    Duration(minutes: 10),
  ];
  if (attempts <= 0) return Duration.zero;
  return attempts <= steps.length ? steps[attempts - 1] : const Duration(hours: 1);
}

class _Unresolved implements Exception {
  const _Unresolved();
}

/// Replaces `"$upload:<id>"` strings with real file ids; throws [_Unresolved] when one is not
/// uploaded yet.
Object? resolvePlaceholders(Object? node, String? Function(String uploadId) lookup) {
  if (node is String && node.startsWith(r'$upload:')) {
    final id = lookup(node.substring(8));
    if (id == null) throw const _Unresolved();
    return id;
  }
  if (node is List) return node.map((x) => resolvePlaceholders(x, lookup)).toList();
  if (node is Map) {
    return node.map((k, v) => MapEntry(k, resolvePlaceholders(v, lookup)));
  }
  return node;
}

class OutboxRunResult {
  int done = 0;
  int failed = 0;
  int conflicts = 0;
  int retried = 0;
  int skipped = 0;
  bool offline = false;
}

typedef OnOutboxDone = Future<void> Function(OutboxEntry entry, Object? responseBody);

class OutboxProcessor {
  OutboxProcessor({
    required this.store,
    required this.transport,
    String? Function(String uploadId)? uploads,
    this.onDone,
  }) : _uploads = uploads ?? ((_) => null);

  final OutboxStore store;
  final OutboxTransport transport;
  final String? Function(String uploadId) _uploads;
  final OnOutboxDone? onDone;
  bool _running = false;

  /// One pass over the queue. Rules (docs/08-mobile.md §5.2):
  /// order by seq; skip entries whose dependency is not DONE, whose upload is pending or whose
  /// backoff has not elapsed; 2xx → DONE; 409 → CONFLICT; other 4xx → FAILED; 5xx/429 → retry
  /// with backoff; no response → retry with backoff and stop the pass (offline).
  Future<OutboxRunResult> run() async {
    final result = OutboxRunResult();
    if (_running) return result;
    _running = true;
    try {
      for (final original in await store.open()) {
        final now = clock.now();
        var e = original;
        if (e.nextAttemptAt != null && e.nextAttemptAt!.isAfter(now)) {
          result.skipped++;
          continue;
        }
        if (e.dependsOnSeq != null && await store.statusOf(e.dependsOnSeq!) != OutboxStatus.done) {
          result.skipped++;
          continue;
        }
        Object? body;
        try {
          body = e.body == null ? null : resolvePlaceholders(jsonDecode(e.body!), _uploads);
        } on _Unresolved {
          result.skipped++;
          continue;
        }
        // IN_FLIGHT left over from a crash is simply sent again with the same Idempotency-Key
        e = e.copyWith(status: OutboxStatus.inFlight);
        await store.save(e);
        final res = await transport.send(e, body);
        if (res.status >= 200 && res.status < 300) {
          e = e.copyWith(status: OutboxStatus.done, clearError: true, clearNextAttempt: true);
          await store.save(e);
          await onDone?.call(e, res.body);
          result.done++;
        } else if (res.status == 409) {
          await store.save(e.copyWith(status: OutboxStatus.conflict, lastError: _message(res)));
          result.conflicts++;
        } else if (res.status >= 400 && res.status < 500 && res.status != 429) {
          await store.save(e.copyWith(status: OutboxStatus.failed, lastError: _message(res)));
          result.failed++;
        } else {
          final attempts = e.attempts + 1;
          await store.save(e.copyWith(
            status: OutboxStatus.pending,
            attempts: attempts,
            nextAttemptAt: now.add(backoffFor(attempts)),
            lastError: res.status == 0 ? 'NETWORK' : _message(res),
          ));
          result.retried++;
          if (res.status == 0) {
            result.offline = true;
            break;
          }
        }
      }
    } finally {
      _running = false;
    }
    return result;
  }

  static String _message(TransportResult r) {
    final b = r.body;
    if (b is Map) {
      final detail = b['detail'] ?? b['title'] ?? b['code'];
      if (detail is String) return detail;
    }
    return 'HTTP ${r.status}';
  }
}
