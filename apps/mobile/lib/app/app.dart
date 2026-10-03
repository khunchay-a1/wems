import 'dart:async';
import 'dart:io';

import 'package:clock/clock.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:material_ui/material_ui.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../core/api/problem.dart';
import '../core/auth/session.dart';
import '../core/push/deep_links.dart';
import '../core/util/version.dart';
import '../l10n/gen/app_localizations.dart';
import 'providers.dart';
import 'router.dart';
import 'ui.dart';

class WemsApp extends ConsumerStatefulWidget {
  const WemsApp({super.key});

  @override
  ConsumerState<WemsApp> createState() => _WemsAppState();
}

class _WemsAppState extends ConsumerState<WemsApp> with WidgetsBindingObserver {
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  final _subs = <StreamSubscription<Object?>>[];
  DateTime? _backgroundSince;
  bool _locked = false;
  String? _updateTo;

  static const _lockAfter = Duration(minutes: 5);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // back online → sync (docs/08-mobile.md §5.2)
    _subs.add(Connectivity().onConnectivityChanged.listen((r) {
      if (!r.contains(ConnectivityResult.none)) unawaited(ref.read(syncEngineProvider).syncNow());
    }));
    final push = ref.read(pushServiceProvider);
    _subs.add(push.taps.listen(_openPush));
    _subs.add(push.foreground.listen((m) {
      // the messenger lives below MaterialApp's Localizations; this State's context does not
      final mctx = _messenger.currentContext;
      if (mctx == null || !mctx.mounted) return;
      _messenger.currentState?.showSnackBar(SnackBar(
        content: Text(m.title.isEmpty ? m.body : m.title),
        action: SnackBarAction(
          label: AppLocalizations.of(mctx).commonOpen,
          onPressed: () => _openPush(m.data),
        ),
      ));
    }));
    WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(_checkVersion()));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final s in _subs) {
      unawaited(s.cancel());
    }
    super.dispose();
  }

  void _openPush(Map<String, dynamic> data) {
    if (ref.read(sessionProvider) is! SignedIn) return;
    unawaited(ref.read(routerProvider).push(routeForPushData(data)));
  }

  /// Forced update below `minSupportedVersion` (docs/08-mobile.md §10).
  Future<void> _checkVersion() async {
    try {
      final cfg = await ref.read(apiProvider).appConfig();
      final min = (cfg['minSupportedVersion'] as Map?)?[Platform.isIOS ? 'ios' : 'android'];
      final info = await PackageInfo.fromPlatform();
      if (min is String && isVersionBelow(info.version, min)) {
        setState(() => _updateTo = min);
      }
      // planned maintenance notice from the admin settings (09-nfr §3)
      final notice = cfg['maintenanceMessage'];
      if (notice is String && notice.isNotEmpty) {
        _messenger.currentState?.showSnackBar(
          SnackBar(content: Text(notice), duration: const Duration(seconds: 10)),
        );
      }
    } on ApiProblem {
      // offline: checked again on the next start
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _backgroundSince ??= clock.now();
    } else if (state == AppLifecycleState.resumed) {
      final since = _backgroundSince;
      _backgroundSince = null;
      final signedIn = ref.read(sessionProvider) is SignedIn;
      if (signedIn && ref.read(settingsProvider).appLock && since != null &&
          clock.now().difference(since) > _lockAfter) {
        setState(() => _locked = true);
      }
      if (signedIn) unawaited(ref.read(syncEngineProvider).syncNow());
    }
  }

  Future<void> _unlock(String reason) async {
    try {
      final ok = await LocalAuthentication().authenticate(localizedReason: reason);
      if (ok && mounted) setState(() => _locked = false);
    } catch (_) {
      // no biometrics enrolled / plugin error: stay locked, the user can retry
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);
    final router = ref.watch(routerProvider);
    ref.listen<SessionState>(sessionProvider, (prev, next) {
      if (prev is! SignedIn && next is SignedIn) {
        final initial = ref.read(pushServiceProvider).takeInitial();
        if (initial != null) _openPush(initial);
      }
    });
    return MaterialApp.router(
      routerConfig: router,
      scaffoldMessengerKey: _messenger,
      onGenerateTitle: (c) => c.l.appTitle,
      locale: Locale(settings.locale),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      builder: (context, child) => Stack(children: [
        child ?? const SizedBox.shrink(),
        if (_locked) Positioned.fill(child: _LockOverlay(onUnlock: _unlock)),
        if (_updateTo != null) Positioned.fill(child: _UpdateOverlay(version: _updateTo!)),
      ]),
    );
  }
}

class _LockOverlay extends StatelessWidget {
  const _LockOverlay({required this.onUnlock});

  final Future<void> Function(String reason) onUnlock;

  @override
  Widget build(BuildContext context) => Material(
        child: SafeArea(
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.lock_outline, size: 48),
              const SizedBox(height: 12),
              Text(context.l.lockTitle, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () => onUnlock(context.l.lockReason),
                icon: const Icon(Icons.fingerprint),
                label: Text(context.l.lockUnlock),
              ),
            ]),
          ),
        ),
      );
}

class _UpdateOverlay extends StatelessWidget {
  const _UpdateOverlay({required this.version});

  final String version;

  @override
  Widget build(BuildContext context) => Material(
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.system_update, size: 48),
                const SizedBox(height: 12),
                Text(context.l.updateTitle, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text(context.l.updateBody(version), textAlign: TextAlign.center),
              ]),
            ),
          ),
        ),
      );
}
