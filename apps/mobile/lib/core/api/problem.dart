import 'package:dio/dio.dart';

/// problem+json from the API (docs/04-api-conventions.md §7); `status == 0` = no response
/// (offline, timeout). The server already localises `title`/`detail` by Accept-Language.
class ApiProblem implements Exception {
  const ApiProblem({
    required this.status,
    this.code,
    this.title,
    this.detail,
    this.rule,
    this.errors = const [],
    this.extra = const {},
  });

  final int status;
  final String? code;
  final String? title;
  final String? detail;
  final String? rule;
  final List<Map<String, dynamic>> errors;

  /// Extension members of the problem (e.g. `currentVersion` on conflicts).
  final Map<String, dynamic> extra;

  bool get isNetwork => status == 0;
  bool get isTransient => status == 0 || status >= 500 || status == 429;
  bool get isConflict => status == 409;

  String message(String fallback) {
    if (detail != null && detail!.isNotEmpty) return detail!;
    if (title != null && title!.isNotEmpty) return title!;
    return fallback;
  }

  static ApiProblem fromDio(DioException e) {
    final res = e.response;
    if (res == null) return ApiProblem(status: 0, code: 'NETWORK', detail: e.message);
    final data = res.data;
    if (data is Map) {
      final m = Map<String, dynamic>.from(data);
      final errs = m['errors'];
      return ApiProblem(
        status: res.statusCode ?? 0,
        code: m['code'] as String?,
        title: m['title'] as String?,
        detail: m['detail'] as String?,
        rule: m['rule'] as String?,
        errors: errs is List
            ? errs.whereType<Map<dynamic, dynamic>>().map(Map<String, dynamic>.from).toList()
            : const [],
        extra: m,
      );
    }
    return ApiProblem(status: res.statusCode ?? 0, code: 'HTTP_${res.statusCode}');
  }

  @override
  String toString() => 'ApiProblem($status $code ${detail ?? title ?? ''})';
}
