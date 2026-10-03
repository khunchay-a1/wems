import 'dart:convert';

import '../core/db/database.dart';
import '../core/util/thai_date.dart';

/// Device settings (docs/08-mobile.md §7 "ตั้งค่า"), kept in drift under `settings.*`.
class AppSettings {
  const AppSettings({
    this.locale = 'th',
    this.calendar = CalendarPref.buddhist,
    this.wifiOnly = true,
    this.cacheLimitBytes = 2 * 1024 * 1024 * 1024,
    this.appLock = false,
  });

  final String locale;
  final CalendarPref calendar;

  /// Download new working revisions of pinned documents automatically only on Wi-Fi.
  final bool wifiOnly;
  final int cacheLimitBytes;
  final bool appLock;

  ThaiDate get dates => ThaiDate(locale: locale, calendar: calendar);

  AppSettings copyWith({
    String? locale,
    CalendarPref? calendar,
    bool? wifiOnly,
    int? cacheLimitBytes,
    bool? appLock,
  }) =>
      AppSettings(
        locale: locale ?? this.locale,
        calendar: calendar ?? this.calendar,
        wifiOnly: wifiOnly ?? this.wifiOnly,
        cacheLimitBytes: cacheLimitBytes ?? this.cacheLimitBytes,
        appLock: appLock ?? this.appLock,
      );

  Map<String, Object> toJson() => {
        'locale': locale,
        'calendar': calendar.api,
        'wifiOnly': wifiOnly,
        'cacheLimitBytes': cacheLimitBytes,
        'appLock': appLock,
      };

  static AppSettings fromJson(Map<String, dynamic> j) {
    const d = AppSettings();
    return AppSettings(
      locale: j['locale'] == 'en' ? 'en' : 'th',
      calendar: CalendarPref.fromApi(j['calendar'] as String?),
      wifiOnly: (j['wifiOnly'] as bool?) ?? d.wifiOnly,
      cacheLimitBytes: (j['cacheLimitBytes'] as num?)?.toInt() ?? d.cacheLimitBytes,
      appLock: (j['appLock'] as bool?) ?? d.appLock,
    );
  }

  static const _key = 'settings.app';

  static Future<AppSettings> load(AppDatabase db) async {
    final raw = await db.getValue(_key);
    if (raw == null) return const AppSettings();
    return fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
  }

  Future<void> save(AppDatabase db) => db.setValue(_key, jsonEncode(toJson()));
}

/// Projects synced to the device ("ติดตามบนมือถือ", docs/08-mobile.md §5.1).
class FollowedProjects {
  const FollowedProjects(this.db);

  final AppDatabase db;
  static const _key = 'follow.projects';

  Future<Set<String>?> load() async {
    final raw = await db.getValue(_key);
    if (raw == null) return null;
    return (jsonDecode(raw) as List<dynamic>).map((e) => e.toString()).toSet();
  }

  Stream<Set<String>> watch() => db.watchValue(_key).map((raw) => raw == null
      ? <String>{}
      : (jsonDecode(raw) as List<dynamic>).map((e) => e.toString()).toSet());

  Future<void> save(Set<String> ids) => db.setValue(_key, jsonEncode(ids.toList()..sort()));

  /// Default on first sign-in: every project the user is an active member of.
  Future<Set<String>> ensure(Iterable<String> memberProjectIds) async {
    final current = await load();
    if (current != null) return current;
    final ids = memberProjectIds.toSet();
    await save(ids);
    return ids;
  }
}
