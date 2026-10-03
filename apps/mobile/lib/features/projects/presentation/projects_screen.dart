import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../data/projects_repository.dart';

/// Projects I am a member of + "follow on mobile" switch (docs/08-mobile.md §7).
class ProjectsScreen extends ConsumerWidget {
  const ProjectsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l;
    final locale = ref.watch(settingsProvider).locale;
    final mine = ref.watch(myProjectsProvider);
    final followed = ref.watch(followedIdsProvider).value ?? const <String>{};
    final synced = {for (final p in ref.watch(syncedProjectsProvider).value ?? const <ProjectItem>[]) p.id};

    Future<void> toggle(ProjectItem p, bool on) async {
      await ref.read(projectsRepositoryProvider).setFollowed(p.id, on);
      unawaited(ref.read(syncEngineProvider).syncNow());
    }

    return Scaffold(
      appBar: AppBar(title: Text(l.projectsTitle)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myProjectsProvider);
          await ref.read(syncEngineProvider).syncNow();
        },
        child: AsyncBody<List<ProjectItem>>(
          value: mine,
          onRetry: () => ref.invalidate(myProjectsProvider),
          data: (projects) => projects.isEmpty
              ? ListView(children: [EmptyView(l.projectsEmpty)])
              : ListView(children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Text(l.projectsFollowHint, style: Theme.of(context).textTheme.bodySmall),
                  ),
                  for (final p in projects)
                    ListTile(
                      title: Text('${p.code} · ${p.nameFor(locale)}'),
                      subtitle: Row(children: [
                        StatusChip('ProjectStatus', p.status),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            followed.contains(p.id) && !synced.contains(p.id)
                                ? l.projectsNotSynced
                                : p.clientName,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ]),
                      onTap: synced.contains(p.id)
                          ? () => context.go('/projects/${p.id}/documents')
                          : null,
                      trailing: Switch(
                        value: followed.contains(p.id),
                        onChanged: (on) => toggle(p, on),
                      ),
                    ),
                ]),
        ),
      ),
    );
  }
}
