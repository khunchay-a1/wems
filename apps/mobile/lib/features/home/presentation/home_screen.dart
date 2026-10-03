import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../../../core/auth/session.dart';
import '../../notifications/data/notifications_repository.dart';
import '../../reviews/data/reviews_repository.dart';
import '../../reviews/presentation/inbox_screen.dart';
import '../../settings/presentation/storage_screen.dart';

/// Home (docs/08-mobile.md §7): reviews due first, pinned documents with "old" flags,
/// latest notifications and the sync status.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l;
    final settings = ref.watch(settingsProvider);
    final session = ref.watch(sessionProvider);
    final me = session is SignedIn ? session.me : null;
    final inbox = ref.watch(inboxProvider).value ?? const <ReviewTask>[];
    final pins = ref.watch(pinnedFilesProvider).value ?? const [];
    final notifications = ref.watch(notificationsProvider).value ?? const <NotificationItem>[];
    final sync = ref.watch(syncStatusProvider).value;
    final outbox = ref.watch(outboxCountsProvider).value;
    final dates = ref.watch(datesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(me == null ? l.appTitle : l.homeGreeting(me.displayName(settings.locale)))),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(syncEngineProvider).syncNow();
          await ref.read(notificationsRepositoryProvider).refresh();
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            if (session is SignedIn && session.offline || (sync?.offline ?? false))
              MaterialBanner(
                content: Text(l.commonOffline),
                leading: const Icon(Icons.cloud_off_outlined),
                actions: [const SizedBox.shrink()],
              ),
            if (sync?.clockSkew ?? false)
              MaterialBanner(
                content: Text(l.homeClockSkew),
                leading: const Icon(Icons.schedule),
                actions: [const SizedBox.shrink()],
              ),
            _Section(
              title: l.homePendingReviews,
              trailing: inbox.isEmpty
                  ? null
                  : TextButton(onPressed: () => context.go('/reviews'), child: Text(l.homeSeeAll)),
              children: inbox.isEmpty
                  ? [ListTile(title: Text(l.homeNoReviews))]
                  : inbox.take(3).map((t) => ReviewTile(task: t)).toList(),
            ),
            _Section(
              title: l.homePinned,
              children: pins.isEmpty
                  ? [ListTile(subtitle: Text(l.homeNoPinned))]
                  : pins.map((p) => PinnedTile(file: p)).toList(),
            ),
            _Section(
              title: l.homeLatestNotifications,
              children: notifications.isEmpty
                  ? [ListTile(title: Text(l.notificationsEmpty))]
                  : notifications
                      .take(3)
                      .map((n) => ListTile(
                            leading: Icon(n.isRead ? Icons.notifications_none : Icons.notifications_active,
                                color: n.isRead ? null : Theme.of(context).colorScheme.primary),
                            title: Text(n.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                            subtitle: Text(dates.dateTime(n.createdAt)),
                            onTap: () {
                              ref.read(notificationsRepositoryProvider).markRead(n);
                              context.push(n.route);
                            },
                          ))
                      .toList(),
            ),
            _Section(
              title: l.homeSync,
              children: [
                ListTile(
                  leading: sync?.running ?? false
                      ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.sync),
                  title: Text(sync?.running ?? false
                      ? l.homeSyncing
                      : sync?.lastSyncedAt == null
                          ? l.homeNeverSynced
                          : l.homeLastSynced(dates.dateTime(sync!.lastSyncedAt))),
                  subtitle: outbox == null || (outbox.pending == 0 && outbox.needsAttention == 0)
                      ? null
                      : Text([
                          if (outbox.pending > 0) l.homeOutboxPending(outbox.pending),
                          if (outbox.needsAttention > 0) l.homeOutboxAttention(outbox.needsAttention),
                        ].join(' · ')),
                  trailing: TextButton(
                    onPressed: () => ref.read(syncEngineProvider).syncNow(),
                    child: Text(l.homeSyncNow),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children, this.trailing});

  final String title;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
        child: Card(
          clipBehavior: Clip.antiAlias,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
              child: Row(children: [
                Expanded(child: Text(title, style: Theme.of(context).textTheme.titleSmall)),
                ?trailing,
              ]),
            ),
            ...children,
          ]),
        ),
      );
}
