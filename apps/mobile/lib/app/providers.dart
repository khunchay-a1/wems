import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../core/api/problem.dart';
import '../core/api/wems_api.dart';
import '../core/auth/session.dart';
import '../core/auth/token_store.dart';
import '../core/db/database.dart';
import '../core/files/offline_store.dart';
import '../core/push/push_service.dart';
import '../core/sync/drift_stores.dart';
import '../core/sync/outbox.dart';
import '../core/sync/pull_sync.dart';
import '../core/sync/sync_engine.dart';
import '../core/util/thai_date.dart';
import 'env.dart';
import 'settings.dart';

/// Overridden in main() with the opened database / directories / stored settings.
final databaseProvider = Provider<AppDatabase>((ref) => throw UnimplementedError('databaseProvider'));
final supportDirProvider = Provider<Directory>((ref) => throw UnimplementedError('supportDir'));
final initialSettingsProvider = Provider<AppSettings>((ref) => const AppSettings());

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

class SettingsController extends Notifier<AppSettings> {
  @override
  AppSettings build() => ref.read(initialSettingsProvider);

  Future<void> set(AppSettings next) async {
    state = next;
    await next.save(ref.read(databaseProvider));
  }
}

final settingsProvider = NotifierProvider<SettingsController, AppSettings>(SettingsController.new);

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(
      baseUrl: Env.apiBaseUrl,
      tokens: ref.watch(tokenStoreProvider),
      locale: () => ref.read(settingsProvider).locale,
    ));

final apiProvider = Provider<WemsApi>((ref) => WemsApi(ref.watch(apiClientProvider)));

final offlineStoreProvider = Provider<OfflineStore>((ref) => OfflineStore(
      db: ref.watch(databaseProvider),
      api: ref.watch(apiProvider),
      root: ref.watch(supportDirProvider),
    ));

final followedProjectsProvider =
    Provider<FollowedProjects>((ref) => FollowedProjects(ref.watch(databaseProvider)));

final outboxStoreProvider = Provider<DriftOutboxStore>((ref) => DriftOutboxStore(ref.watch(databaseProvider)));

final pushServiceProvider = Provider<PushService>((ref) => PushService(ref.watch(apiProvider)));

final sessionServiceProvider = Provider<SessionService>((ref) => SessionService(
      api: ref.watch(apiProvider),
      client: ref.watch(apiClientProvider),
      tokens: ref.watch(tokenStoreProvider),
      db: ref.watch(databaseProvider),
    ));

final syncEngineProvider = Provider<SyncEngine>((ref) {
  final db = ref.watch(databaseProvider);
  final outboxStore = ref.watch(outboxStoreProvider);
  final engine = SyncEngine(
    pull: PullSync(api: ref.watch(apiProvider), store: DriftSyncStore(db)),
    outbox: OutboxProcessor(
      store: outboxStore,
      transport: DioOutboxTransport(ref.watch(apiClientProvider).dio),
    ),
    outboxStore: outboxStore,
    offline: ref.watch(offlineStoreProvider),
    scopes: () async {
      final s = ref.read(sessionProvider);
      if (s is! SignedIn) return null;
      final followed = await ref.read(followedProjectsProvider).load() ?? <String>{};
      return ['global', 'user:${s.me.id}', ...followed.map((id) => 'project:$id')];
    },
    mayDownload: () async {
      if (!ref.read(settingsProvider).wifiOnly) return true;
      final r = await Connectivity().checkConnectivity();
      return r.contains(ConnectivityResult.wifi) || r.contains(ConnectivityResult.ethernet);
    },
  );
  ref.onDispose(engine.dispose);
  return engine;
});

final syncStatusProvider = StreamProvider<SyncStatus>((ref) async* {
  final engine = ref.watch(syncEngineProvider);
  yield engine.current;
  yield* engine.status;
});

final outboxCountsProvider = StreamProvider<({int pending, int needsAttention})>(
    (ref) => ref.watch(outboxStoreProvider).watchCounts());

/// Date formatter following the user's language and calendar settings.
final datesProvider = Provider<ThaiDate>((ref) => ref.watch(settingsProvider).dates);

class SessionController extends Notifier<SessionState> {
  SessionService get _svc => ref.read(sessionServiceProvider);

  @override
  SessionState build() {
    ref.read(apiClientProvider).onSessionLost = (_) => unawaited(_revoked());
    Future.microtask(restore);
    return const SessionLoading();
  }

  Future<void> restore() async {
    try {
      state = await _svc.restore();
    } on ApiProblem {
      state = const SignedOut();
    }
    await _afterSignIn();
  }

  /// Returns the problem to show on the login screen, or null on success / MFA step.
  Future<ApiProblem?> login(String email, String password) async {
    try {
      state = await _svc.login(email, password);
      await _afterSignIn();
      return null;
    } on ApiProblem catch (p) {
      return p;
    }
  }

  Future<ApiProblem?> verifyMfa(String code) async {
    final s = state;
    if (s is! MfaRequired) return null;
    try {
      state = await _svc.verifyMfa(s.mfaToken, code);
      await _afterSignIn();
      return null;
    } on ApiProblem catch (p) {
      return p;
    }
  }

  void cancelMfa() => state = const SignedOut();

  Future<void> logout() async {
    await ref.read(pushServiceProvider).unregister();
    await ref.read(offlineStoreProvider).deleteAll();
    state = await _svc.logout();
  }

  Future<void> _revoked() async {
    if (state is! SignedIn) return;
    await ref.read(offlineStoreProvider).deleteAll();
    state = await _svc.revoked();
  }

  Future<void> _afterSignIn() async {
    final s = state;
    if (s is! SignedIn) return;
    final db = ref.read(databaseProvider);
    // first sign-in on this device: language and calendar from the profile
    if (await db.getValue('settings.app') == null) {
      await ref.read(settingsProvider.notifier).set(ref
          .read(settingsProvider)
          .copyWith(locale: s.me.locale, calendar: CalendarPref.fromApi(s.me.calendar)));
    }
    await ref.read(followedProjectsProvider).ensure(s.me.projects.map((p) => p['id'] as String));
    unawaited(ref.read(syncEngineProvider).syncNow());
    if (!s.offline) unawaited(ref.read(pushServiceProvider).register());
  }
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(SessionController.new);
