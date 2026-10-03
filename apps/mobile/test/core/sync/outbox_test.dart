import 'dart:convert';

import 'package:clock/clock.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wems_mobile/core/sync/outbox.dart';

class MemoryOutbox implements OutboxStore {
  final entries = <int, OutboxEntry>{};

  void add(int seq, {String path = '/x', Object? body, int? dependsOn, DateTime? nextAttemptAt}) {
    entries[seq] = OutboxEntry(
      seq: seq,
      method: 'POST',
      path: path,
      body: body == null ? null : jsonEncode(body),
      idempotencyKey: 'key-$seq',
      createdAt: DateTime.utc(2026),
      dependsOnSeq: dependsOn,
      nextAttemptAt: nextAttemptAt,
    );
  }

  @override
  Future<List<OutboxEntry>> open() async => (entries.values
          .where((e) => e.status == OutboxStatus.pending || e.status == OutboxStatus.inFlight)
          .toList()
        ..sort((a, b) => a.seq.compareTo(b.seq)));

  @override
  Future<OutboxStatus?> statusOf(int seq) async => entries[seq]?.status;

  @override
  Future<void> save(OutboxEntry e) async {
    entries[e.seq] = e;
  }
}

class ScriptedTransport implements OutboxTransport {
  ScriptedTransport(this.byPath);
  final Map<String, List<TransportResult>> byPath;
  final sent = <({int seq, String key, Object? body})>[];

  @override
  Future<TransportResult> send(OutboxEntry e, Object? body) async {
    sent.add((seq: e.seq, key: e.idempotencyKey, body: body));
    final q = byPath[e.path]!;
    return q.length > 1 ? q.removeAt(0) : q.first;
  }
}

void main() {
  final t0 = DateTime.utc(2026, 10, 3, 9);

  test('backoff: 5 s, 30 s, 2 min, 10 min, then hourly', () {
    expect([for (var i = 1; i <= 6; i++) backoffFor(i)], const [
      Duration(seconds: 5),
      Duration(seconds: 30),
      Duration(minutes: 2),
      Duration(minutes: 10),
      Duration(hours: 1),
      Duration(hours: 1),
    ]);
  });

  test('sends in seq order with the stored Idempotency-Key; 2xx → DONE and onDone gets the body', () async {
    final store = MemoryOutbox()
      ..add(2, path: '/b')
      ..add(1, path: '/a');
    final transport = ScriptedTransport({
      '/a': [const TransportResult(200, {'ok': 1})],
      '/b': [const TransportResult(204)],
    });
    final done = <int>[];
    final r = await OutboxProcessor(
      store: store,
      transport: transport,
      onDone: (e, body) async => done.add(e.seq),
    ).run();
    expect(transport.sent.map((s) => s.seq), [1, 2]);
    expect(transport.sent.first.key, 'key-1');
    expect(done, [1, 2]);
    expect(r.done, 2);
    expect(store.entries[1]!.status, OutboxStatus.done);
  });

  test('dependsOnSeq: skipped until the dependency is DONE', () async {
    final store = MemoryOutbox()
      ..add(1, path: '/fail')
      ..add(2, path: '/b', dependsOn: 1);
    final transport = ScriptedTransport({
      '/fail': [const TransportResult(503)],
      '/b': [const TransportResult(201)],
    });
    final p = OutboxProcessor(store: store, transport: transport);
    await withClock(Clock.fixed(t0), p.run);
    expect(transport.sent.map((s) => s.seq), [1]);
    expect(store.entries[2]!.status, OutboxStatus.pending);

    transport.byPath['/fail'] = [const TransportResult(200)];
    await withClock(Clock.fixed(t0.add(const Duration(minutes: 1))), p.run);
    expect(transport.sent.map((s) => s.seq), [1, 1, 2]);
    expect(store.entries[2]!.status, OutboxStatus.done);
  });

  test('upload placeholders are replaced; an unfinished upload keeps the entry waiting', () async {
    final store = MemoryOutbox()
      ..add(1, body: {
        'title': 'x',
        'photos': [r'$upload:u1', r'$upload:u2'],
      });
    final transport = ScriptedTransport({'/x': [const TransportResult(201)]});
    final uploaded = <String, String>{'u1': 'file-1'};
    final p = OutboxProcessor(store: store, transport: transport, uploads: (id) => uploaded[id]);

    final first = await p.run();
    expect(first.skipped, 1);
    expect(transport.sent, isEmpty);

    uploaded['u2'] = 'file-2';
    await p.run();
    expect(transport.sent.single.body, {
      'title': 'x',
      'photos': ['file-1', 'file-2'],
    });
  });

  test('409 → CONFLICT, other 4xx → FAILED with the problem detail', () async {
    final store = MemoryOutbox()
      ..add(1, path: '/conflict')
      ..add(2, path: '/invalid');
    final transport = ScriptedTransport({
      '/conflict': [const TransportResult(409, {'code': 'CONFLICT_STALE_VERSION', 'detail': 'changed'})],
      '/invalid': [const TransportResult(422, {'code': 'VALIDATION_FAILED', 'title': 'bad'})],
    });
    final r = await OutboxProcessor(store: store, transport: transport).run();
    expect(r.conflicts, 1);
    expect(r.failed, 1);
    expect(store.entries[1]!.status, OutboxStatus.conflict);
    expect(store.entries[1]!.lastError, 'changed');
    expect(store.entries[2]!.status, OutboxStatus.failed);
    expect(store.entries[2]!.lastError, 'bad');
  });

  test('5xx → retry later with backoff; entries waiting for their backoff are skipped', () async {
    final store = MemoryOutbox()..add(1);
    final transport = ScriptedTransport({'/x': [const TransportResult(500)]});
    final p = OutboxProcessor(store: store, transport: transport);
    await withClock(Clock.fixed(t0), p.run);
    expect(store.entries[1]!.attempts, 1);
    expect(store.entries[1]!.status, OutboxStatus.pending);
    expect(store.entries[1]!.nextAttemptAt, t0.add(const Duration(seconds: 5)));

    final early = await withClock(Clock.fixed(t0.add(const Duration(seconds: 3))), p.run);
    expect(early.skipped, 1);
    expect(transport.sent, hasLength(1));

    await withClock(Clock.fixed(t0.add(const Duration(seconds: 6))), p.run);
    expect(store.entries[1]!.attempts, 2);
    expect(store.entries[1]!.nextAttemptAt, t0.add(const Duration(seconds: 36)));
  });

  test('no response (offline) stops the pass so later entries keep their order', () async {
    final store = MemoryOutbox()
      ..add(1, path: '/a')
      ..add(2, path: '/b');
    final transport = ScriptedTransport({
      '/a': [const TransportResult(0)],
      '/b': [const TransportResult(200)],
    });
    final r = await withClock(Clock.fixed(t0), OutboxProcessor(store: store, transport: transport).run);
    expect(r.offline, isTrue);
    expect(transport.sent.map((s) => s.seq), [1]);
    expect(store.entries[1]!.lastError, 'NETWORK');
    expect(store.entries[2]!.status, OutboxStatus.pending);
  });

  test('IN_FLIGHT left by a crash is sent again with the same key', () async {
    final store = MemoryOutbox()..add(1);
    store.entries[1] = store.entries[1]!.copyWith(status: OutboxStatus.inFlight);
    final transport = ScriptedTransport({'/x': [const TransportResult(200)]});
    await OutboxProcessor(store: store, transport: transport).run();
    expect(transport.sent.single.key, 'key-1');
    expect(store.entries[1]!.status, OutboxStatus.done);
  });
}
