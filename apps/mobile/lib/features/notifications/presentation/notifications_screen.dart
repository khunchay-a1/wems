import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../data/notifications_repository.dart';

/// Notification list; tap → related page (docs/08-mobile.md §7–8).
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    unawaited(_refresh());
  }

  Future<void> _refresh() async {
    try {
      final ok = await ref.read(notificationsRepositoryProvider).refresh();
      if (mounted) setState(() => _offline = !ok);
    } catch (e) {
      if (mounted) showSnack(context, problemText(context, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final dates = ref.watch(datesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l.notificationsTitle)),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: AsyncBody<List<NotificationItem>>(
          value: ref.watch(notificationsProvider),
          data: (items) => ListView(children: [
            if (_offline)
              MaterialBanner(
                content: Text(l.commonOffline),
                leading: const Icon(Icons.cloud_off_outlined),
                actions: [const SizedBox.shrink()],
              ),
            if (items.isEmpty) EmptyView(l.notificationsEmpty, icon: Icons.notifications_none),
            for (final n in items)
              ListTile(
                leading: Icon(
                  n.isRead ? Icons.notifications_none : Icons.notifications_active,
                  color: n.isRead ? null : Theme.of(context).colorScheme.primary,
                ),
                title: Text(n.title,
                    style: n.isRead ? null : const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('${n.body}\n${dates.dateTime(n.createdAt)}',
                    maxLines: 3, overflow: TextOverflow.ellipsis),
                isThreeLine: true,
                onTap: () {
                  unawaited(ref.read(notificationsRepositoryProvider).markRead(n));
                  context.push(n.route);
                },
              ),
          ]),
        ),
      ),
    );
  }
}
