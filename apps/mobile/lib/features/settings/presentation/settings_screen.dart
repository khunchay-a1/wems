import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../app/env.dart';
import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../../../core/auth/session.dart';
import '../../../core/util/thai_date.dart';
import '../../../core/util/version.dart';

final packageInfoProvider = FutureProvider<PackageInfo>((ref) => PackageInfo.fromPlatform());

/// Settings (docs/08-mobile.md §7).
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  static const _cacheSizes = [512, 1024, 2048, 5120]; // MB

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final l = context.l;
    final pending = await ref.read(outboxStoreProvider).pendingCount();
    if (pending > 0 && context.mounted) {
      final go = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(l.logoutPendingTitle),
          content: Text(l.logoutPendingBody(pending)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: Text(l.logoutSyncFirst)),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(l.logoutAnyway)),
          ],
        ),
      );
      if (go != true) {
        await ref.read(syncEngineProvider).syncNow();
        return;
      }
    }
    await ref.read(sessionProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l;
    final s = ref.watch(settingsProvider);
    final ctl = ref.read(settingsProvider.notifier);
    final session = ref.watch(sessionProvider);
    final me = session is SignedIn ? session.me : null;
    final info = ref.watch(packageInfoProvider).value;

    return Scaffold(
      appBar: AppBar(title: Text(l.settingsTitle)),
      body: ListView(children: [
        if (me != null)
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: Text(me.displayName(s.locale)),
            subtitle: Text(me.email),
          ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.translate),
          title: Text(l.settingsLanguage),
          trailing: SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'th', label: Text(l.settingsLanguageTh)),
              ButtonSegment(value: 'en', label: Text(l.settingsLanguageEn)),
            ],
            selected: {s.locale},
            onSelectionChanged: (v) => ctl.set(s.copyWith(locale: v.first)),
          ),
        ),
        ListTile(
          leading: const Icon(Icons.calendar_month_outlined),
          title: Text(l.settingsCalendar),
          subtitle: Text(s.calendar == CalendarPref.buddhist ? l.settingsBuddhist : l.settingsGregorian),
          onTap: () => ctl.set(s.copyWith(
              calendar: s.calendar == CalendarPref.buddhist ? CalendarPref.gregorian : CalendarPref.buddhist)),
        ),
        SwitchListTile(
          secondary: const Icon(Icons.wifi),
          title: Text(l.settingsWifiOnly),
          value: s.wifiOnly,
          onChanged: (v) => ctl.set(s.copyWith(wifiOnly: v)),
        ),
        ListTile(
          leading: const Icon(Icons.sd_storage_outlined),
          title: Text(l.settingsCacheSize),
          trailing: DropdownButton<int>(
            value: _cacheSizes.contains(s.cacheLimitBytes ~/ (1024 * 1024))
                ? s.cacheLimitBytes ~/ (1024 * 1024)
                : 2048,
            items: [
              for (final mb in _cacheSizes)
                DropdownMenuItem(value: mb, child: Text(formatBytes(mb * 1024 * 1024))),
            ],
            onChanged: (mb) {
              if (mb != null) ctl.set(s.copyWith(cacheLimitBytes: mb * 1024 * 1024));
            },
          ),
        ),
        SwitchListTile(
          secondary: const Icon(Icons.fingerprint),
          title: Text(l.settingsAppLock),
          value: s.appLock,
          onChanged: (v) => ctl.set(s.copyWith(appLock: v)),
        ),
        ListTile(
          leading: const Icon(Icons.pin_outlined),
          title: Text(l.settingsSigningPin),
          subtitle: Text(me?.hasSigningPin ?? false ? l.settingsPinSet : l.settingsPinNotSet),
        ),
        ListTile(
          leading: const Icon(Icons.folder_open_outlined),
          title: Text(l.settingsStorage),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.go('/settings/storage'),
        ),
        ListTile(
          leading: const Icon(Icons.info_outline),
          title: Text(l.settingsVersion),
          subtitle: Text(info == null ? '' : '${info.version}+${info.buildNumber} (${Env.flavor})'),
        ),
        const Divider(),
        ListTile(
          leading: Icon(Icons.logout, color: Theme.of(context).colorScheme.error),
          title: Text(l.settingsLogout, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          onTap: () => _logout(context, ref),
        ),
      ]),
    );
  }
}
