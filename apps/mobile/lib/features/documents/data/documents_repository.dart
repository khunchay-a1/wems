import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/db/database.dart';

Map<String, dynamic> _json(EntityRow r) => Map<String, dynamic>.from(jsonDecode(r.data) as Map);

/// DocumentSyncDto
class DocumentItem {
  const DocumentItem(this.j);
  final Map<String, dynamic> j;

  String get id => j['id'] as String;
  String get projectId => j['projectId'] as String;
  String get number => j['number'] as String;
  String get title => j['title'] as String;
  String? get titleEn => j['titleEn'] as String?;
  String get status => j['status'] as String;
  String get disciplineId => j['disciplineId'] as String;
  String get documentTypeId => j['documentTypeId'] as String;
  String? get ownerName => j['ownerName'] as String?;
  String? get currentRevisionId => j['currentRevisionId'] as String?;
  String? get latestApprovedRevisionId => j['latestApprovedRevisionId'] as String?;

  String titleFor(String locale) =>
      locale == 'en' && (titleEn?.isNotEmpty ?? false) ? titleEn! : title;
}

/// DocumentRevisionSyncDto
class RevisionItem {
  const RevisionItem(this.j);
  final Map<String, dynamic> j;

  String get id => j['id'] as String;
  String get documentId => j['documentId'] as String;
  String get revLabel => j['revLabel'] as String;
  int get revIndex => (j['revIndex'] as num).toInt();
  String get purposeCode => j['purposeCode'] as String;
  String get status => j['status'] as String;
  String? get description => j['description'] as String?;
  String get preparedByName => (j['preparedByName'] as String?) ?? '';
  String? get approvedByName => j['approvedByName'] as String?;
  DateTime? get approvedAt => DateTime.tryParse((j['approvedAt'] as String?) ?? '');
  DateTime? get updatedAt => DateTime.tryParse((j['updatedAt'] as String?) ?? '');
  String? get clientReturnCode => j['clientReturnCode'] as String?;

  List<Map<String, dynamic>> get files => ((j['files'] as List<dynamic>?) ?? const [])
      .map((f) => Map<String, dynamic>.from(f as Map))
      .toList();

  bool get hasPdf => files.any((f) => f['role'] == 'PDF_RENDITION');
}

/// MasterItemSyncDto (Discipline, DocumentType)
class MasterItem {
  const MasterItem(this.j);
  final Map<String, dynamic> j;

  String get id => j['id'] as String;
  String get code => j['code'] as String;
  bool get isActive => j['isActive'] == true;
  String name(String locale) => (locale == 'en' ? j['nameEn'] : j['nameTh']) as String;
}

/// Reads the register from drift only — works offline (docs/08-mobile.md §7).
class DocumentsRepository {
  DocumentsRepository(this.db);
  final AppDatabase db;

  SimpleSelectStatement<$EntitiesTable, EntityRow> _q(String type) =>
      db.select(db.entities)..where((t) => t.entityType.equals(type));

  Stream<List<DocumentItem>> watchDocuments(String projectId) => (_q('Document')
        ..where((t) => t.parentId.equals(projectId))
        ..orderBy([(t) => OrderingTerm.asc(t.sortKey)]))
      .watch()
      .map((rows) => rows.map((r) => DocumentItem(_json(r))).toList());

  Stream<DocumentItem?> watchDocument(String id) => (_q('Document')
        ..where((t) => t.id.equals(id))
        ..limit(1))
      .watch()
      .map((rows) => rows.isEmpty ? null : DocumentItem(_json(rows.first)));

  Stream<List<RevisionItem>> watchRevisions(String documentId) => (_q('DocumentRevision')
        ..where((t) => t.parentId.equals(documentId))
        ..orderBy([(t) => OrderingTerm.desc(t.sortKey)]))
      .watch()
      .map((rows) => rows.map((r) => RevisionItem(_json(r))).toList());

  /// All revisions of a followed project, by id (register shows the current label).
  Stream<Map<String, RevisionItem>> watchProjectRevisions(String projectId) =>
      (_q('DocumentRevision')..where((t) => t.scope.equals('project:$projectId')))
          .watch()
          .map((rows) => {for (final r in rows) r.id: RevisionItem(_json(r))});

  Future<RevisionItem?> revision(String id) async {
    final row = await (_q('DocumentRevision')
          ..where((t) => t.id.equals(id))
          ..limit(1))
        .getSingleOrNull();
    return row == null ? null : RevisionItem(_json(row));
  }

  Future<DocumentItem?> document(String id) async {
    final row = await (_q('Document')
          ..where((t) => t.id.equals(id))
          ..limit(1))
        .getSingleOrNull();
    return row == null ? null : DocumentItem(_json(row));
  }

  Stream<List<MasterItem>> watchMaster(String type) =>
      (_q(type)..orderBy([(t) => OrderingTerm.asc(t.sortKey)]))
          .watch()
          .map((rows) => rows.map((r) => MasterItem(_json(r))).toList());
}

final documentsRepositoryProvider =
    Provider<DocumentsRepository>((ref) => DocumentsRepository(ref.watch(databaseProvider)));

final documentsProvider = StreamProvider.family<List<DocumentItem>, String>(
    (ref, projectId) => ref.watch(documentsRepositoryProvider).watchDocuments(projectId));

final documentProvider = StreamProvider.family<DocumentItem?, String>(
    (ref, id) => ref.watch(documentsRepositoryProvider).watchDocument(id));

final revisionsProvider = StreamProvider.family<List<RevisionItem>, String>(
    (ref, documentId) => ref.watch(documentsRepositoryProvider).watchRevisions(documentId));

final projectRevisionsProvider = StreamProvider.family<Map<String, RevisionItem>, String>(
    (ref, projectId) => ref.watch(documentsRepositoryProvider).watchProjectRevisions(projectId));

final disciplinesProvider = StreamProvider<List<MasterItem>>(
    (ref) => ref.watch(documentsRepositoryProvider).watchMaster('Discipline'));

final documentTypesProvider = StreamProvider<List<MasterItem>>(
    (ref) => ref.watch(documentsRepositoryProvider).watchMaster('DocumentType'));

/// Register filter (docs/08-mobile.md §7): text search on number/title + discipline/type/status.
List<DocumentItem> filterDocuments(
  List<DocumentItem> docs, {
  String query = '',
  String? disciplineId,
  String? documentTypeId,
  String? status,
}) {
  final q = query.trim().toLowerCase();
  return docs.where((d) {
    if (disciplineId != null && d.disciplineId != disciplineId) return false;
    if (documentTypeId != null && d.documentTypeId != documentTypeId) return false;
    if (status != null && d.status != status) return false;
    if (q.isEmpty) return true;
    return d.number.toLowerCase().contains(q) ||
        d.title.toLowerCase().contains(q) ||
        (d.titleEn?.toLowerCase().contains(q) ?? false);
  }).toList();
}
