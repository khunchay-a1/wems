import 'dart:convert';

import 'package:clock/clock.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/api/problem.dart';
import '../../../core/api/wems_api.dart';
import '../../../core/db/database.dart';
import '../../../core/push/deep_links.dart';
import '../../../core/sync/drift_stores.dart';
import '../../../core/sync/sync_engine.dart';
import '../../../core/util/ids.dart';

class NotificationItem {
  const NotificationItem(this.j);
  final Map<String, dynamic> j;

  String get id => j['id'] as String;
  String get type => j['type'] as String;
  String get title => j['title'] as String;
  String get body => (j['body'] as String?) ?? '';
  DateTime? get createdAt => DateTime.tryParse((j['createdAt'] as String?) ?? '');
  bool get isRead => j['readAt'] != null;

  String get route => routeForNotification(
        type: type,
        entityType: j['entityType'] as String?,
        entityId: j['entityId'] as String?,
        projectId: j['projectId'] as String?,
        link: j['link'] as String?,
      );
}

/// Notifications are read online and the first page is cached (docs/08-mobile.md §5.1);
/// "mark as read" goes through the outbox so it works offline.
class NotificationsRepository {
  NotificationsRepository({
    required this.db,
    required this.api,
    required this.outbox,
    required this.sync,
  });

  final AppDatabase db;
  final WemsApi api;
  final DriftOutboxStore outbox;
  final SyncEngine sync;

  static const _key = 'notifications.cache';

  List<NotificationItem> _decode(String? raw) => raw == null
      ? const []
      : (jsonDecode(raw) as List<dynamic>)
          .map((e) => NotificationItem(Map<String, dynamic>.from(e as Map)))
          .toList();

  Stream<List<NotificationItem>> watch() => db.watchValue(_key).map(_decode);

  /// Refreshes the cache; returns false when offline.
  Future<bool> refresh() async {
    try {
      final body = await api.notifications();
      await db.setValue(_key, jsonEncode(body['data']));
      return true;
    } on ApiProblem catch (p) {
      if (p.isNetwork) return false;
      rethrow;
    }
  }

  Future<void> markRead(NotificationItem n) async {
    if (n.isRead) return;
    final list = _decode(await db.getValue(_key))
        .map((x) => x.id == n.id ? {...x.j, 'readAt': clock.now().toUtc().toIso8601String()} : x.j)
        .toList();
    await db.setValue(_key, jsonEncode(list));
    await outbox.enqueue(
      method: 'POST',
      path: '/notifications/${n.id}/read',
      idempotencyKey: newId(),
      entityType: 'Notification',
      entityId: n.id,
    );
    sync.requestSoon();
  }
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) =>
    NotificationsRepository(
      db: ref.watch(databaseProvider),
      api: ref.watch(apiProvider),
      outbox: ref.watch(outboxStoreProvider),
      sync: ref.watch(syncEngineProvider),
    ));

final notificationsProvider = StreamProvider<List<NotificationItem>>(
    (ref) => ref.watch(notificationsRepositoryProvider).watch());
