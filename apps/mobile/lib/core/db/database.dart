import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'database.g.dart';

/// Every synced entity as JSON (docs/08-mobile.md §5.1). One table keeps the sync store generic;
/// `parentId` (projectId / documentId) and `sortKey` are the only indexed fields the screens need.
@DataClassName('EntityRow')
class Entities extends Table {
  TextColumn get entityType => text()();
  TextColumn get id => text()();
  TextColumn get scope => text()();
  TextColumn get parentId => text().nullable()();
  TextColumn get sortKey => text().nullable()();
  TextColumn get data => text()();
  IntColumn get gen => integer().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {entityType, id, scope};
}

@DataClassName('SyncCursorRow')
class SyncCursors extends Table {
  TextColumn get scope => text()();
  TextColumn get cursor => text().nullable()();
  IntColumn get snapshotGen => integer().nullable()();
  DateTimeColumn get syncedAt => dateTime().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {scope};
}

/// docs/08-mobile.md §5.2
@DataClassName('OutboxRow')
class OutboxItems extends Table {
  IntColumn get seq => integer().autoIncrement()();
  TextColumn get method => text()();
  TextColumn get path => text()();
  TextColumn get body => text().nullable()();
  TextColumn get idempotencyKey => text()();
  TextColumn get entityType => text().nullable()();
  TextColumn get entityId => text().nullable()();
  IntColumn get dependsOnSeq => integer().nullable()();
  TextColumn get status => text().withDefault(const Constant('PENDING'))();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  DateTimeColumn get nextAttemptAt => dateTime().nullable()();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}

/// Offline pins (docs/08-mobile.md §6) and the temporary PDF cache (`pinned = false`).
@DataClassName('FileRow')
class LocalFiles extends Table {
  TextColumn get revisionId => text()();
  TextColumn get documentId => text()();
  TextColumn get revLabel => text()();
  TextColumn get path => text()();
  TextColumn get sha256 => text()();
  IntColumn get sizeBytes => integer()();
  BoolColumn get pinned => boolean().withDefault(const Constant(false))();

  /// The document now has a newer working revision — red banner on every page.
  BoolColumn get stale => boolean().withDefault(const Constant(false))();
  DateTimeColumn get savedAt => dateTime()();
  DateTimeColumn get lastOpenedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {revisionId};
}

@DataClassName('KeyValueRow')
class KeyValues extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

@DriftDatabase(tables: [Entities, SyncCursors, OutboxItems, LocalFiles, KeyValues])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  /// Database file in the app support directory.
  factory AppDatabase.open() => AppDatabase(driftDatabase(name: 'wems'));

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
          await customStatement(
            'CREATE INDEX IF NOT EXISTS entities_parent ON entities (entity_type, parent_id)',
          );
        },
        // schemaVersion 1: add `onUpgrade` steps here as `if (from < 2) { ... }`
      );

  // ───────────── key/value settings ─────────────

  Future<String?> getValue(String key) async =>
      (await (select(keyValues)..where((t) => t.key.equals(key))).getSingleOrNull())?.value;

  Stream<String?> watchValue(String key) => (select(keyValues)..where((t) => t.key.equals(key)))
      .watchSingleOrNull()
      .map((r) => r?.value);

  Future<void> setValue(String key, String? value) async {
    if (value == null) {
      await (delete(keyValues)..where((t) => t.key.equals(key))).go();
    } else {
      await into(keyValues).insertOnConflictUpdate(KeyValuesCompanion.insert(key: key, value: value));
    }
  }

  /// Logout / another user signs in: everything goes (docs/08-mobile.md §4).
  Future<void> wipeAll() => transaction(() async {
        await delete(entities).go();
        await delete(syncCursors).go();
        await delete(outboxItems).go();
        await delete(localFiles).go();
        // device settings (language, calendar, cache size) survive a logout
        await (delete(keyValues)..where((t) => t.key.like('settings.%').not())).go();
      });

  /// Session revoked: drop cached data and pins but keep the outbox for the same user.
  Future<void> wipeCache() => transaction(() async {
        await delete(entities).go();
        await delete(syncCursors).go();
        await delete(localFiles).go();
      });
}
