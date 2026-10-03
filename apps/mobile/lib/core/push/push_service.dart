import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../app/env.dart';
import '../api/problem.dart';
import '../api/wems_api.dart';

class ForegroundPush {
  const ForegroundPush({required this.title, required this.body, required this.data});
  final String title;
  final String body;
  final Map<String, dynamic> data;
}

/// FCM registration and message streams (docs/08-mobile.md §8). Disabled unless the flavor sets
/// PUSH_ENABLED and the Firebase config files are present on the build machine.
class PushService {
  PushService(this.api);

  final WemsApi api;
  bool _ready = false;
  bool _tried = false;
  String? _token;
  Map<String, dynamic>? _initial;
  final _taps = StreamController<Map<String, dynamic>>.broadcast();
  final _foreground = StreamController<ForegroundPush>.broadcast();

  /// Notifications the user tapped while the app was in the background.
  Stream<Map<String, dynamic>> get taps => _taps.stream;

  /// Messages received while the app is open → in-app banner.
  Stream<ForegroundPush> get foreground => _foreground.stream;

  /// The notification that launched the app, consumed once.
  Map<String, dynamic>? takeInitial() {
    final d = _initial;
    _initial = null;
    return d;
  }

  Future<bool> init() async {
    if (_tried) return _ready;
    _tried = true;
    if (!Env.pushEnabled) return false;
    try {
      await Firebase.initializeApp();
    } catch (_) {
      return false; // no google-services.json / GoogleService-Info.plist in this build
    }
    final m = FirebaseMessaging.instance;
    await m.requestPermission();
    FirebaseMessaging.onMessage.listen((msg) => _foreground.add(ForegroundPush(
          title: msg.notification?.title ?? '',
          body: msg.notification?.body ?? '',
          data: msg.data,
        )));
    FirebaseMessaging.onMessageOpenedApp.listen((msg) => _taps.add(msg.data));
    _initial = (await m.getInitialMessage())?.data;
    m.onTokenRefresh.listen((t) {
      _token = t;
      unawaited(_send(t));
    });
    _ready = true;
    return true;
  }

  /// After sign-in and on token change (`POST /push-devices`).
  Future<void> register() async {
    if (!await init()) return;
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return;
    _token = token;
    await _send(token);
  }

  Future<void> _send(String token) async {
    try {
      final info = await PackageInfo.fromPlatform();
      await api.registerPush(
        token,
        appVersion: '${info.version}+${info.buildNumber}',
        deviceModel: Platform.operatingSystemVersion,
      );
    } on ApiProblem {
      // retried on the next sign-in / token refresh
    }
  }

  /// On logout (`DELETE /push-devices/:token`).
  Future<void> unregister() async {
    final token = _token;
    if (!_ready || token == null) return;
    try {
      await api.unregisterPush(token);
    } on ApiProblem {
      // offline: the server drops stale tokens when FCM reports them
    }
    _token = null;
  }
}
