import 'package:dio/dio.dart';

import '../auth/token_store.dart';
import '../util/ids.dart';

enum SessionLoss {
  /// Refresh token rejected (expired, revoked from the web, password changed) — docs/08-mobile.md §4.
  revoked,
}

/// Dio with the WEMS interceptors: bearer token, Accept-Language, X-Request-Id and a single-flight
/// refresh on 401 followed by one retry (docs/08-mobile.md §4).
class ApiClient {
  ApiClient({
    required String baseUrl,
    required this.tokens,
    required this.locale,
    this.onSessionLost,
  }) {
    final options = BaseOptions(
      baseUrl: '$baseUrl/api/v1',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 60),
      contentType: Headers.jsonContentType,
      responseType: ResponseType.json,
    );
    dio = Dio(options);
    _refreshDio = Dio(options);
    dio.interceptors.add(
      InterceptorsWrapper(onRequest: _onRequest, onError: _onError),
    );
  }

  final TokenStore tokens;

  /// Current UI language (`th` | `en`) for server-side messages.
  final String Function() locale;
  void Function(SessionLoss reason)? onSessionLost;

  late final Dio dio;
  late final Dio _refreshDio;
  Future<bool>? _refreshing;

  static const _noRefresh = ['/auth/login', '/auth/refresh', '/auth/mfa/verify', '/app/config'];

  void _onRequest(RequestOptions o, RequestInterceptorHandler h) {
    o.headers['Accept-Language'] = locale();
    o.headers['X-Request-Id'] = newId();
    final token = tokens.accessToken;
    if (token != null) o.headers['Authorization'] = 'Bearer $token';
    h.next(o);
  }

  Future<void> _onError(DioException e, ErrorInterceptorHandler h) async {
    final o = e.requestOptions;
    final eligible = e.response?.statusCode == 401 &&
        o.extra['retried'] != true &&
        !_noRefresh.any((p) => o.path.startsWith(p));
    if (!eligible || !await refresh()) {
      h.next(e);
      return;
    }
    o.extra['retried'] = true;
    o.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
    try {
      h.resolve(await dio.fetch<dynamic>(o));
    } on DioException catch (again) {
      h.next(again);
    }
  }

  /// Exchanges the refresh token once even when many requests fail together.
  Future<bool> refresh() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<bool> _doRefresh() async {
    final rt = await tokens.refreshToken();
    if (rt == null) return false;
    try {
      final res = await _refreshDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': rt},
        options: Options(headers: {'Accept-Language': locale(), 'X-Request-Id': newId()}),
      );
      final body = res.data ?? const <String, dynamic>{};
      tokens.accessToken = body['accessToken'] as String?;
      await tokens.saveRefreshToken((body['refreshToken'] as String?) ?? rt);
      return tokens.accessToken != null;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) {
        await tokens.clearSession();
        onSessionLost?.call(SessionLoss.revoked);
      }
      // offline: keep the refresh token, the app keeps working from the local database
      return false;
    }
  }
}
