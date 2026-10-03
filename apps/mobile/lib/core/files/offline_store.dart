import 'dart:convert';
import 'dart:io';

import 'package:clock/clock.dart';
import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';
import 'package:path/path.dart' as p;

import '../api/wems_api.dart';
import '../db/database.dart';

class PinVerifyFailed implements Exception {
  const PinVerifyFailed();
}

class NoWorkingRevision implements Exception {
  const NoWorkingRevision();
}

/// What the PDF screen shows for a revision (docs/08-mobile.md §6–7).
enum RevisionBanner {
  /// The document's working (latest approved) revision.
  working,

  /// Not approved (draft / in review / rejected) — not for construction.
  notApproved,

  /// A newer working revision exists — red banner on every page.
  old,
}

RevisionBanner bannerFor({
  required String revisionId,
  required String revisionStatus,
  required String? latestApprovedRevisionId,
}) {
  if (latestApprovedRevisionId == revisionId) return RevisionBanner.working;
  final approved = revisionStatus == 'APPROVED' || revisionStatus == 'ISSUED';
  if (revisionStatus == 'SUPERSEDED' || (approved && latestApprovedRevisionId != null)) {
    return RevisionBanner.old;
  }
  return approved ? RevisionBanner.working : RevisionBanner.notApproved;
}

Future<String> sha256OfFile(File f) async => (await sha256.bind(f.openRead()).first).toString();

/// Offline pins and the temporary PDF cache (docs/08-mobile.md §6).
class OfflineStore {
  OfflineStore({required this.db, required this.api, required this.root});

  final AppDatabase db;
  final WemsApi api;

  /// App support directory; files live in `<root>/pdf/`.
  final Directory root;

  Directory get _dir => Directory(p.join(root.path, 'pdf'));

  Future<FileRow?> local(String revisionId) async {
    final row = await (db.select(db.localFiles)..where((t) => t.revisionId.equals(revisionId)))
        .getSingleOrNull();
    if (row == null) return null;
    if (!File(row.path).existsSync()) {
      await (db.delete(db.localFiles)..where((t) => t.revisionId.equals(revisionId))).go();
      return null;
    }
    return row;
  }

  Stream<List<FileRow>> watchPinned() => (db.select(db.localFiles)
        ..where((t) => t.pinned.equals(true))
        ..orderBy([(t) => OrderingTerm.asc(t.revLabel)]))
      .watch();

  Stream<FileRow?> watchRevision(String revisionId) =>
      (db.select(db.localFiles)..where((t) => t.revisionId.equals(revisionId))).watchSingleOrNull();

  Stream<FileRow?> watchPinForDocument(String documentId) => (db.select(db.localFiles)
        ..where((t) => t.documentId.equals(documentId) & t.pinned.equals(true)))
      .watch()
      .map((rows) => rows.isEmpty ? null : rows.first);

  /// Downloads the stamped PDF and checks it against the sha256 the API reported.
  Future<FileRow> _download({
    required String documentId,
    required String revisionId,
    required String revLabel,
    required bool pinned,
  }) async {
    final info = await api.downloadUrl(revisionId);
    await _dir.create(recursive: true);
    final tmp = File(p.join(_dir.path, '$revisionId.part'));
    await api.fetchFile(info['url'] as String, tmp.path);
    final actual = await sha256OfFile(tmp);
    final expected = info['sha256'] as String?;
    if (expected != null && expected != actual) {
      await tmp.delete();
      throw const PinVerifyFailed();
    }
    final file = await tmp.rename(p.join(_dir.path, '$revisionId.pdf'));
    final now = clock.now().toUtc();
    final row = LocalFilesCompanion.insert(
      revisionId: revisionId,
      documentId: documentId,
      revLabel: revLabel,
      path: file.path,
      sha256: actual,
      sizeBytes: await file.length(),
      pinned: Value(pinned),
      savedAt: now,
      lastOpenedAt: now,
    );
    await db.into(db.localFiles).insertOnConflictUpdate(row);
    return (await local(revisionId))!;
  }

  /// Path to open: the pinned/cached copy, otherwise a fresh download into the cache (online).
  Future<String> open({
    required String documentId,
    required String revisionId,
    required String revLabel,
    required int cacheLimitBytes,
  }) async {
    final existing = await local(revisionId);
    if (existing != null) {
      await (db.update(db.localFiles)..where((t) => t.revisionId.equals(revisionId)))
          .write(LocalFilesCompanion(lastOpenedAt: Value(clock.now().toUtc())));
      return existing.path;
    }
    final row = await _download(
      documentId: documentId,
      revisionId: revisionId,
      revLabel: revLabel,
      pinned: false,
    );
    await evict(cacheLimitBytes, keep: revisionId);
    return row.path;
  }

  /// "ปักหมุดไว้ใช้ออฟไลน์" — always the working revision of the document.
  Future<void> pin({
    required String documentId,
    required String revisionId,
    required String revLabel,
  }) async {
    final existing = await local(revisionId);
    if (existing != null) {
      await (db.update(db.localFiles)..where((t) => t.revisionId.equals(revisionId)))
          .write(const LocalFilesCompanion(pinned: Value(true), stale: Value(false)));
      return;
    }
    await _download(documentId: documentId, revisionId: revisionId, revLabel: revLabel, pinned: true);
  }

  Future<void> remove(String revisionId) async {
    final row = await local(revisionId);
    if (row != null) {
      final f = File(row.path);
      if (f.existsSync()) await f.delete();
    }
    await (db.delete(db.localFiles)..where((t) => t.revisionId.equals(revisionId))).go();
  }

  /// LRU eviction of the temporary cache (pins are never evicted).
  Future<void> evict(int limitBytes, {String? keep}) async {
    final cached = await (db.select(db.localFiles)
          ..where((t) => t.pinned.equals(false))
          ..orderBy([(t) => OrderingTerm.asc(t.lastOpenedAt)]))
        .get();
    var total = cached.fold<int>(0, (s, r) => s + r.sizeBytes);
    for (final r in cached) {
      if (total <= limitBytes) break;
      if (r.revisionId == keep) continue;
      await remove(r.revisionId);
      total -= r.sizeBytes;
    }
  }

  Future<int> cacheBytes() async {
    final cached = await (db.select(db.localFiles)..where((t) => t.pinned.equals(false))).get();
    return cached.fold<int>(0, (s, r) => s + r.sizeBytes);
  }

  Future<void> clearCache() async {
    final cached = await (db.select(db.localFiles)..where((t) => t.pinned.equals(false))).get();
    for (final r in cached) {
      await remove(r.revisionId);
    }
  }

  /// Logout / revoked session: every PDF leaves the device.
  Future<void> deleteAll() async {
    if (_dir.existsSync()) await _dir.delete(recursive: true);
    await db.delete(db.localFiles).go();
  }

  /// After a sync: pins whose document has a newer working revision become "old"; with
  /// [mayDownload] (Wi-Fi or Wi-Fi-only off) the new revision is pinned and the old one removed.
  Future<int> reconcile({required bool mayDownload}) async {
    final pins = await (db.select(db.localFiles)..where((t) => t.pinned.equals(true))).get();
    var replaced = 0;
    for (final row in pins) {
      final doc = await (db.select(db.entities)
            ..where((t) => t.entityType.equals('Document') & t.id.equals(row.documentId))
            ..limit(1))
          .getSingleOrNull();
      if (doc == null) continue; // project not followed any more — keep the pin as it is
      final latest =
          (jsonDecode(doc.data) as Map<String, dynamic>)['latestApprovedRevisionId'] as String?;
      if (latest == null || latest == row.revisionId) continue;
      if (!row.stale) {
        await (db.update(db.localFiles)..where((t) => t.revisionId.equals(row.revisionId)))
            .write(const LocalFilesCompanion(stale: Value(true)));
      }
      if (!mayDownload) continue;
      final rev = await (db.select(db.entities)
            ..where((t) => t.entityType.equals('DocumentRevision') & t.id.equals(latest))
            ..limit(1))
          .getSingleOrNull();
      if (rev == null) continue;
      final label = (jsonDecode(rev.data) as Map<String, dynamic>)['revLabel'] as String;
      try {
        await pin(documentId: row.documentId, revisionId: latest, revLabel: label);
        await remove(row.revisionId);
        replaced++;
      } on Exception {
        // stays pinned and marked old; retried after the next sync
      }
    }
    return replaced;
  }
}
