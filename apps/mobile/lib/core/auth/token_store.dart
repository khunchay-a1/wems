import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../util/ids.dart';

/// Refresh token, device id and last user live in secure storage; the access token stays in
/// memory only (docs/08-mobile.md §4).
class TokenStore {
  TokenStore([FlutterSecureStorage? storage]) : _s = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _s;
  String? accessToken;

  static const _refreshKey = 'wems.refreshToken';
  static const _deviceKey = 'wems.deviceId';
  static const _userKey = 'wems.userId';

  Future<String?> refreshToken() => _s.read(key: _refreshKey);

  Future<void> saveRefreshToken(String? token) async {
    if (token == null) {
      await _s.delete(key: _refreshKey);
    } else {
      await _s.write(key: _refreshKey, value: token);
    }
  }

  /// Random once per installation, sent at login so sessions can be listed/revoked per device.
  Future<String> deviceId() async {
    final existing = await _s.read(key: _deviceKey);
    if (existing != null) return existing;
    final id = newId();
    await _s.write(key: _deviceKey, value: id);
    return id;
  }

  Future<String?> lastUserId() => _s.read(key: _userKey);
  Future<void> saveUserId(String id) => _s.write(key: _userKey, value: id);

  Future<void> clearSession() async {
    accessToken = null;
    await _s.delete(key: _refreshKey);
  }
}
