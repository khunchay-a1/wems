import 'dart:io';

import 'package:dio/dio.dart';

import '../sync/pull_sync.dart';
import 'api_client.dart';
import 'problem.dart';

typedef Json = Map<String, dynamic>;

/// The endpoints the phase-1 app uses (docs/08-mobile.md §7). Hand-written over Dio until the
/// swagger_parser client is generated in CI (see swagger_parser.yaml) — keep names equal to the
/// OpenAPI operationIds so the switch is mechanical.
class WemsApi implements SyncApi {
  WemsApi(this.client);

  final ApiClient client;
  Dio get _dio => client.dio;

  Future<T> _call<T>(Future<Response<dynamic>> Function() run) async {
    try {
      final res = await run();
      return res.data as T;
    } on DioException catch (e) {
      throw ApiProblem.fromDio(e);
    }
  }

  static Json _map(Object? o) => Map<String, dynamic>.from(o! as Map);
  static List<Json> _list(Object? o) => (o! as List).map(_map).toList();

  // ───────────── Auth ─────────────

  /// Auth_login — `mfaRequired` → [mfaVerify].
  Future<Json> login({
    required String email,
    required String password,
    required String deviceId,
    required String deviceName,
  }) async =>
      _map(await _call<Object?>(() => _dio.post('/auth/login', data: {
            'email': email,
            'password': password,
            'platform': Platform.isIOS ? 'IOS' : 'ANDROID',
            'deviceId': deviceId,
            'deviceName': deviceName,
          })));

  Future<Json> mfaVerify(String mfaToken, String code) async => _map(await _call<Object?>(
      () => _dio.post('/auth/mfa/verify', data: {'mfaToken': mfaToken, 'code': code})));

  Future<void> logout(String? refreshToken) =>
      _call<Object?>(() => _dio.post('/auth/logout', data: {'refreshToken': refreshToken}));

  Future<Json> me() async => _map(await _call<Object?>(() => _dio.get('/auth/me')));

  Future<Json> appConfig() async => _map(await _call<Object?>(() => _dio.get('/app/config')));

  // ───────────── Sync ─────────────

  @override
  Future<PullPage> pull(String scope, {String? cursor, int limit = 500}) async {
    try {
      final res = await _dio.get<dynamic>('/sync/pull', queryParameters: {
        'scope': scope,
        'cursor': ?cursor,
        'limit': limit,
      });
      return PullPage.fromJson(_map(res.data));
    } on DioException catch (e) {
      final p = ApiProblem.fromDio(e);
      if (p.code == 'SYNC_CURSOR_EXPIRED') throw const SyncCursorExpired();
      if (p.code == 'SYNC_SCOPE_FORBIDDEN') throw const SyncScopeForbidden();
      throw p;
    }
  }

  // ───────────── Projects / documents ─────────────

  /// Projects_listProjects?mine=true — candidates for "follow on mobile".
  Future<List<Json>> myProjects() async {
    final body = _map(await _call<Object?>(
        () => _dio.get('/projects', queryParameters: {'mine': 'true', 'pageSize': 100})));
    return _list(body['data']);
  }

  Future<Json> revision(String id) async =>
      _map(await _call<Object?>(() => _dio.get('/revisions/$id')));

  /// Documents_downloadRevisionFile — signed URL of the stamped PDF + its sha256.
  Future<Json> downloadUrl(String revisionId) async =>
      _map(await _call<Object?>(() => _dio.get('/revisions/$revisionId/download')));

  /// Fetches a signed storage URL to [savePath] (no auth headers — the URL is pre-signed).
  Future<void> fetchFile(String url, String savePath, {CancelToken? cancel}) async {
    try {
      await Dio().download(url, savePath, cancelToken: cancel);
    } on DioException catch (e) {
      throw ApiProblem.fromDio(e);
    }
  }

  // ───────────── Reviews / comments ─────────────

  Future<Json> reviewCycle(String id) async =>
      _map(await _call<Object?>(() => _dio.get('/review-cycles/$id')));

  Future<List<Json>> comments(String revisionId) async => _list(await _call<Object?>(() =>
      _dio.get('/comments', queryParameters: {'ownerType': 'DOCUMENT_REVISION', 'ownerId': revisionId})));

  Future<Json> createComment(Json body) async =>
      _map(await _call<Object?>(() => _dio.post('/comments', data: body)));

  /// Reviews_decideStep — needs `Idempotency-Key` (docs/04-api-conventions.md §6).
  Future<Json> decide(String stepId, Json body, {required String idempotencyKey}) async =>
      _map(await _call<Object?>(() => _dio.post(
            '/review-steps/$stepId/decision',
            data: body,
            options: Options(headers: {'Idempotency-Key': idempotencyKey}),
          )));

  // ───────────── Notifications / push ─────────────

  Future<Json> notifications({String? cursor, int limit = 50}) async =>
      _map(await _call<Object?>(() => _dio.get('/notifications', queryParameters: {
            'limit': limit,
            'cursor': ?cursor,
          })));

  Future<void> registerPush(String token, {String? appVersion, String? deviceModel}) =>
      _call<Object?>(() => _dio.post('/push-devices', data: {
            'fcmToken': token,
            'platform': Platform.isIOS ? 'IOS' : 'ANDROID',
            'appVersion': ?appVersion,
            'deviceModel': ?deviceModel,
          }));

  Future<void> unregisterPush(String token) =>
      _call<Object?>(() => _dio.delete('/push-devices/${Uri.encodeComponent(token)}'));
}
