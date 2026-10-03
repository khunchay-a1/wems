import 'dart:convert';

import 'package:clock/clock.dart';
import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/api/wems_api.dart';
import '../../../core/db/database.dart';
import '../../../core/util/ids.dart';

/// My open review step (MyReviewStepDto, synced in scope `user:<me>`).
class ReviewTask {
  const ReviewTask(this.j);
  final Map<String, dynamic> j;

  String get id => j['id'] as String;
  String get cycleId => j['cycleId'] as String;
  String get kind => j['kind'] as String;
  String get name => j['name'] as String;
  DateTime? get dueAt => DateTime.tryParse((j['dueAt'] as String?) ?? '');
  bool get requiresSignature => j['requiresSignature'] == true;
  String get revisionId => j['revisionId'] as String;
  String get revLabel => j['revLabel'] as String;
  String get purposeCode => j['purposeCode'] as String;
  String get documentId => j['documentId'] as String;
  String get documentNumber => j['documentNumber'] as String;
  String get documentTitle => j['documentTitle'] as String;
  String get projectId => j['projectId'] as String;
  String get projectCode => j['projectCode'] as String;
  String get submittedByName =>
      ((j['submittedBy'] as Map?)?['displayName'] as String?) ?? '';
  int get version => (j['version'] as num).toInt();

  /// Evaluated now (the synced flag may be hours old).
  bool get isOverdue => dueAt != null && dueAt!.isBefore(clock.now());
}

/// Inbox from drift (offline); the review itself is online only (docs/08-mobile.md §1).
class ReviewsRepository {
  ReviewsRepository({required this.db, required this.api});

  final AppDatabase db;
  final WemsApi api;

  Stream<List<ReviewTask>> watchInbox() => (db.select(db.entities)
        ..where((t) => t.entityType.equals('ReviewStep'))
        ..orderBy([(t) => OrderingTerm.asc(t.sortKey)]))
      .watch()
      .map((rows) => rows
          .map((r) => ReviewTask(Map<String, dynamic>.from(jsonDecode(r.data) as Map)))
          .toList());

  Future<ReviewTask?> task(String stepId) async {
    final row = await (db.select(db.entities)
          ..where((t) => t.entityType.equals('ReviewStep') & t.id.equals(stepId))
          ..limit(1))
        .getSingleOrNull();
    return row == null ? null : ReviewTask(Map<String, dynamic>.from(jsonDecode(row.data) as Map));
  }

  /// The step as the server sees it now, with `allowedActions` (rule 1: the API decides).
  Future<Json?> liveStep(String cycleId, String stepId) async {
    final cycle = await api.reviewCycle(cycleId);
    for (final s in (cycle['steps'] as List<dynamic>)) {
      final m = Map<String, dynamic>.from(s as Map);
      if (m['id'] == stepId) return m;
    }
    return null;
  }

  Future<List<Json>> comments(String revisionId) => api.comments(revisionId);

  /// PIN anchor in page coordinates 0..1 from the top-left, as the web viewer uses.
  Future<Json> addComment({
    required String revisionId,
    required String stepId,
    required String body,
    int? page,
    double? x,
    double? y,
  }) =>
      api.createComment({
        'ownerType': 'DOCUMENT_REVISION',
        'ownerId': revisionId,
        'body': body,
        'reviewStepId': stepId,
        if (page != null && x != null && y != null)
          'anchor': {'kind': 'PIN', 'page': page, 'x': x, 'y': y},
      });

  /// Decision with optional signature; one Idempotency-Key per decision sheet.
  Future<Json> decide({
    required String stepId,
    required int version,
    required String decision,
    String? note,
    Map<String, String>? signature,
    String? idempotencyKey,
  }) =>
      api.decide(
        stepId,
        {
          'version': version,
          'decision': decision,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
          'signature': ?signature,
        },
        idempotencyKey: idempotencyKey ?? newId(),
      );
}

final reviewsRepositoryProvider = Provider<ReviewsRepository>((ref) =>
    ReviewsRepository(db: ref.watch(databaseProvider), api: ref.watch(apiProvider)));

final inboxProvider =
    StreamProvider<List<ReviewTask>>((ref) => ref.watch(reviewsRepositoryProvider).watchInbox());
