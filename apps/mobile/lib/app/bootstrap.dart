import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:workmanager/workmanager.dart';

import '../core/auth/session.dart';
import '../core/db/database.dart';
import 'app.dart';
import 'providers.dart';
import 'settings.dart';

Future<({Directory dir, AppSettings settings})> _load(AppDatabase db) async =>
    (dir: await getApplicationSupportDirectory(), settings: await AppSettings.load(db));

/// Shared entry for every flavor (lib/main_<flavor>.dart → env/<flavor>.json).
Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  final db = AppDatabase.open();
  final v = await _load(db);
  await _registerBackgroundSync();
  runApp(ProviderScope(
    overrides: [
      databaseProvider.overrideWithValue(db),
      supportDirProvider.overrideWithValue(v.dir),
      initialSettingsProvider.overrideWithValue(v.settings),
    ],
    child: const WemsApp(),
  ));
}

const _syncTask = 'wems.sync';

/// Background sync every 15 minutes on Android; best effort on iOS (docs/08-mobile.md §2, §5.2).
Future<void> _registerBackgroundSync() async {
  try {
    await Workmanager().initialize(backgroundDispatcher);
    await Workmanager().registerPeriodicTask(
      _syncTask,
      _syncTask,
      frequency: const Duration(minutes: 15),
      constraints: Constraints(networkType: NetworkType.connected),
    );
  } catch (_) {
    // iOS without BGTaskScheduler identifiers configured: foreground sync only
  }
}

@pragma('vm:entry-point')
void backgroundDispatcher() {
  Workmanager().executeTask((task, input) async {
    final db = AppDatabase.open();
    final v = await _load(db);
    final container = ProviderContainer(overrides: [
      databaseProvider.overrideWithValue(db),
      supportDirProvider.overrideWithValue(v.dir),
      initialSettingsProvider.overrideWithValue(v.settings),
    ]);
    try {
      container.read(sessionProvider); // restores the session from secure storage
      var waited = 0;
      while (container.read(sessionProvider) is SessionLoading && waited < 150) {
        await Future<void>.delayed(const Duration(milliseconds: 200));
        waited++;
      }
      if (container.read(sessionProvider) is SignedIn) {
        await container.read(syncEngineProvider).syncNow();
      }
      return true;
    } catch (_) {
      return false;
    } finally {
      container.dispose();
      await db.close();
    }
  });
}
