import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../core/auth/session.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/documents/presentation/document_screen.dart';
import '../features/documents/presentation/pdf_screen.dart';
import '../features/documents/presentation/register_screen.dart';
import '../features/documents/presentation/revision_link_screen.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/home/presentation/shell.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/projects/presentation/projects_screen.dart';
import '../features/reviews/presentation/inbox_screen.dart';
import '../features/reviews/presentation/review_screen.dart';
import '../features/settings/presentation/settings_screen.dart';
import '../features/settings/presentation/storage_screen.dart';
import 'providers.dart';

/// Routes (docs/08-mobile.md §7–8). Deep links from push use the same paths.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen<SessionState>(sessionProvider, (prev, next) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final s = ref.read(sessionProvider);
      final loc = state.matchedLocation;
      if (s is SessionLoading) return loc == '/splash' ? null : '/splash';
      if (s is SignedOut || s is MfaRequired) return loc == '/login' ? null : '/login';
      if (loc == '/login' || loc == '/splash') return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      ShellRoute(
        builder: (context, state, child) => HomeShell(location: state.uri.path, child: child),
        routes: [
          GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
          GoRoute(
            path: '/projects',
            builder: (context, state) => const ProjectsScreen(),
            routes: [
              GoRoute(
                path: ':projectId/documents',
                builder: (context, state) =>
                    RegisterScreen(projectId: state.pathParameters['projectId']!),
                routes: [
                  GoRoute(
                    path: ':documentId',
                    builder: (context, state) => DocumentScreen(
                      projectId: state.pathParameters['projectId']!,
                      documentId: state.pathParameters['documentId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/reviews',
            builder: (context, state) => const InboxScreen(),
            routes: [
              GoRoute(
                path: ':stepId',
                builder: (context, state) => ReviewScreen(stepId: state.pathParameters['stepId']!),
              ),
            ],
          ),
          GoRoute(path: '/notifications', builder: (context, state) => const NotificationsScreen()),
          GoRoute(
            path: '/settings',
            builder: (context, state) => const SettingsScreen(),
            routes: [
              GoRoute(path: 'storage', builder: (context, state) => const StorageScreen()),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/pdf/:revisionId',
        builder: (context, state) => PdfScreen(
          revisionId: state.pathParameters['revisionId']!,
          documentId: state.uri.queryParameters['documentId'] ?? '',
        ),
      ),
      GoRoute(
        path: '/revisions/:revisionId',
        builder: (context, state) =>
            RevisionLinkScreen(revisionId: state.pathParameters['revisionId']!),
      ),
    ],
  );
});

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}
