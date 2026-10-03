import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../app/settings.dart';
import '../../../core/api/problem.dart';
import '../../../core/api/wems_api.dart';
import '../../../core/db/database.dart';

/// ProjectSyncDto (synced) or ProjectDto (online list) — the fields both share.
class ProjectItem {
  const ProjectItem(this.j);
  final Map<String, dynamic> j;

  String get id => j['id'] as String;
  String get code => j['code'] as String;
  String get name => j['name'] as String;
  String? get nameEn => j['nameEn'] as String?;
  String get status => j['status'] as String;
  String get clientName {
    final c = j['clientName'] ?? (j['client'] is Map ? (j['client'] as Map)['nameTh'] : null);
    return c?.toString() ?? '';
  }

  String nameFor(String locale) => locale == 'en' && (nameEn?.isNotEmpty ?? false) ? nameEn! : name;
}

class ProjectsRepository {
  ProjectsRepository({required this.db, required this.api, required this.followed});

  final AppDatabase db;
  final WemsApi api;
  final FollowedProjects followed;

  static const _cacheKey = 'projects.mine';

  /// Followed projects that are on the device.
  Stream<List<ProjectItem>> watchSynced() => (db.select(db.entities)
        ..where((t) => t.entityType.equals('Project'))
        ..orderBy([(t) => OrderingTerm.asc(t.sortKey)]))
      .watch()
      .map((rows) => rows
          .map((r) => ProjectItem(Map<String, dynamic>.from(jsonDecode(r.data) as Map)))
          .toList());

  /// My projects from the server (cached for offline use).
  Future<List<ProjectItem>> mine() async {
    try {
      final list = await api.myProjects();
      await db.setValue(_cacheKey, jsonEncode(list));
      return list.map(ProjectItem.new).toList();
    } on ApiProblem catch (p) {
      if (!p.isNetwork) rethrow;
      final raw = await db.getValue(_cacheKey);
      if (raw == null) rethrow;
      return (jsonDecode(raw) as List<dynamic>)
          .map((e) => ProjectItem(Map<String, dynamic>.from(e as Map)))
          .toList();
    }
  }

  Future<void> setFollowed(String projectId, bool follow) async {
    final ids = await followed.load() ?? <String>{};
    if (follow) {
      ids.add(projectId);
    } else {
      ids.remove(projectId);
    }
    await followed.save(ids);
  }
}

final projectsRepositoryProvider = Provider<ProjectsRepository>((ref) => ProjectsRepository(
      db: ref.watch(databaseProvider),
      api: ref.watch(apiProvider),
      followed: ref.watch(followedProjectsProvider),
    ));

final syncedProjectsProvider =
    StreamProvider<List<ProjectItem>>((ref) => ref.watch(projectsRepositoryProvider).watchSynced());

final myProjectsProvider =
    FutureProvider<List<ProjectItem>>((ref) => ref.watch(projectsRepositoryProvider).mine());

final followedIdsProvider =
    StreamProvider<Set<String>>((ref) => ref.watch(followedProjectsProvider).watch());
