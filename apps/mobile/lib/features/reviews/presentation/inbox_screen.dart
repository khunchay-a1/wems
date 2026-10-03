import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../../../l10n/enum_labels.dart';
import '../data/reviews_repository.dart';

/// My ACTIVE review steps, due first (docs/08-mobile.md §7) — readable offline.
class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l;
    return Scaffold(
      appBar: AppBar(title: Text(l.reviewsTitle)),
      body: RefreshIndicator(
        onRefresh: () => ref.read(syncEngineProvider).syncNow(),
        child: AsyncBody<List<ReviewTask>>(
          value: ref.watch(inboxProvider),
          data: (tasks) => tasks.isEmpty
              ? ListView(children: [EmptyView(l.reviewsEmpty, icon: Icons.task_alt)])
              : ListView.separated(
                  itemCount: tasks.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) => ReviewTile(task: tasks[i]),
                ),
        ),
      ),
    );
  }
}

class ReviewTile extends ConsumerWidget {
  const ReviewTile({required this.task, super.key});

  final ReviewTask task;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l;
    final dates = ref.watch(datesProvider);
    final error = Theme.of(context).colorScheme.error;
    return ListTile(
      title: Text('${task.documentNumber} Rev.${task.revLabel}'),
      subtitle: Text(
        [
          task.documentTitle,
          '${task.projectCode} · ${task.name} · ${enumLabel(l, 'ReviewStepKind', task.kind)}',
          if (task.dueAt != null) l.reviewsDue(dates.date(task.dueAt)),
        ].join('\n'),
        maxLines: 3,
        overflow: TextOverflow.ellipsis,
      ),
      isThreeLine: true,
      trailing: task.isOverdue
          ? Text(l.reviewsOverdue, style: TextStyle(color: error, fontWeight: FontWeight.w600))
          : const Icon(Icons.chevron_right),
      onTap: () => context.push('/reviews/${task.id}'),
    );
  }
}
