import 'dart:convert';
import 'dart:io';

import '../api/api_client.dart';
import '../api/problem.dart';
import '../api/wems_api.dart';
import '../db/database.dart';
import 'token_store.dart';

/// The signed-in user (subset of MeDto).
class Me {
  const Me(this.json);

  final Map<String, dynamic> json;

  String get id => json['id'] as String;
  String get email => json['email'] as String;
  String get displayNameTh => (json['displayNameTh'] as String?) ?? email;
  String? get displayNameEn => json['displayNameEn'] as String?;
  String get calendar => (json['calendar'] as String?) ?? 'BUDDHIST';
  String get locale => (json['locale'] as String?) ?? 'th';
  bool get hasSigningPin => json['hasSigningPin'] == true;
  bool get mustChangePassword => json['mustChangePassword'] == true;
  bool get mfaSetupRequired => json['mfaSetupRequired'] == true;
  Set<String> get permissions =>
      ((json['permissions'] as List<dynamic>?) ?? const []).map((e) => e.toString()).toSet();

  /// Active memberships `{id, code, name, role}`.
  List<Map<String, dynamic>> get projects => ((json['projects'] as List<dynamic>?) ?? const [])
      .map((p) => Map<String, dynamic>.from(p as Map))
      .toList();

  String displayName(String locale) =>
      locale == 'en' && (displayNameEn?.isNotEmpty ?? false) ? displayNameEn! : displayNameTh;
}

enum SignOutReason { none, revoked, completeOnWeb }

sealed class SessionState {
  const SessionState();
}

class SessionLoading extends SessionState {
  const SessionLoading();
}

class SignedOut extends SessionState {
  const SignedOut([this.reason = SignOutReason.none]);
  final SignOutReason reason;
}

class MfaRequired extends SessionState {
  const MfaRequired(this.mfaToken);
  final String mfaToken;
}

class SignedIn extends SessionState {
  const SignedIn(this.me, {this.offline = false});
  final Me me;

  /// Restored from the device while the server could not be reached.
  final bool offline;
}

/// Login, restore, logout (docs/08-mobile.md §4). UI-independent so it can be driven by tests.
class SessionService {
  SessionService({required this.api, required this.client, required this.tokens, required this.db});

  final WemsApi api;
  final ApiClient client;
  final TokenStore tokens;
  final AppDatabase db;

  static const _meKey = 'session.me';

  Future<SessionState> restore() async {
    if (await tokens.refreshToken() == null) return const SignedOut();
    final cached = await db.getValue(_meKey);
    if (await client.refresh()) {
      try {
        final me = Me(await api.me());
        await db.setValue(_meKey, jsonEncode(me.json));
        return SignedIn(me);
      } on ApiProblem catch (p) {
        if (!p.isNetwork) rethrow;
      }
    }
    // refresh failed: revoked → token was cleared; offline → keep working from the device
    if (await tokens.refreshToken() != null && cached != null) {
      return SignedIn(Me(Map<String, dynamic>.from(jsonDecode(cached) as Map)), offline: true);
    }
    return const SignedOut();
  }

  Future<SessionState> login(String email, String password) async {
    final body = await api.login(
      email: email,
      password: password,
      deviceId: await tokens.deviceId(),
      deviceName: '${Platform.operatingSystem} ${Platform.localHostname}',
    );
    if (body['mfaRequired'] == true) return MfaRequired(body['mfaToken'] as String);
    return _accept(body);
  }

  Future<SessionState> verifyMfa(String mfaToken, String code) async =>
      _accept(await api.mfaVerify(mfaToken, code));

  Future<SessionState> _accept(Map<String, dynamic> body) async {
    tokens.accessToken = body['accessToken'] as String?;
    await tokens.saveRefreshToken(body['refreshToken'] as String?);
    final me = Me(Map<String, dynamic>.from(body['user'] as Map));
    // first-run steps (temporary password, mandatory MFA) are done on the web
    if (me.mustChangePassword || me.mfaSetupRequired) {
      await _endServerSession();
      return const SignedOut(SignOutReason.completeOnWeb);
    }
    // another user on this device → nothing of the previous user stays (docs/08-mobile.md §4)
    final previous = await tokens.lastUserId();
    if (previous != null && previous != me.id) await db.wipeAll();
    await tokens.saveUserId(me.id);
    await db.setValue(_meKey, jsonEncode(me.json));
    return SignedIn(me);
  }

  Future<void> _endServerSession() async {
    try {
      await api.logout(await tokens.refreshToken());
    } on ApiProblem {
      // already invalid or offline — the local session is dropped anyway
    }
    await tokens.clearSession();
  }

  /// Normal logout: server session, then every local row and file.
  Future<SessionState> logout() async {
    await _endServerSession();
    await db.wipeAll();
    return const SignedOut();
  }

  /// Session revoked elsewhere: drop cache and pins, keep the outbox for the same user.
  Future<SessionState> revoked() async {
    await db.wipeCache();
    return const SignedOut(SignOutReason.revoked);
  }
}
