import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/ui.dart';
import '../../reviews/data/reviews_repository.dart';

/// Bottom navigation for the five phase-1 areas.
class HomeShell extends ConsumerWidget {
  const HomeShell({required this.location, required this.child, super.key});

  final String location;
  final Widget child;

  static const _tabs = ['/', '/projects', '/reviews', '/notifications', '/settings'];

  int get _index {
    for (var i = _tabs.length - 1; i > 0; i--) {
      if (location.startsWith(_tabs[i])) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l;
    final reviews = ref.watch(inboxProvider).value?.length ?? 0;
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => context.go(_tabs[i]),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), label: l.navHome),
          NavigationDestination(icon: const Icon(Icons.folder_outlined), label: l.navProjects),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: reviews > 0,
              label: Text('$reviews'),
              child: const Icon(Icons.fact_check_outlined),
            ),
            label: l.navReviews,
          ),
          NavigationDestination(
              icon: const Icon(Icons.notifications_outlined), label: l.navNotifications),
          NavigationDestination(icon: const Icon(Icons.settings_outlined), label: l.navSettings),
        ],
      ),
    );
  }
}
