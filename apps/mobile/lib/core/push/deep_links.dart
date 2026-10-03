/// Push / notification → app route (docs/08-mobile.md §8). Pure function.
///
/// The API sends `{type, entityType, entityId, projectId, link}`; `link` is the web path of the
/// related page (`/projects/:p/documents/:d...`), which carries the document id that review and
/// revision events need.
String routeForNotification({
  required String type,
  String? entityType,
  String? entityId,
  String? projectId,
  String? link,
}) {
  bool has(String? s) => s != null && s.isNotEmpty;
  if (type.startsWith('review.step.') && has(entityId)) return '/reviews/$entityId';
  final m = RegExp(r'^/projects/([0-9a-fA-F-]+)/documents/([0-9a-fA-F-]+)').firstMatch(link ?? '');
  if (m != null) {
    final base = '/projects/${m.group(1)}/documents/${m.group(2)}';
    if (type == 'comment.created' && has(entityId)) return '$base?comment=$entityId';
    return base;
  }
  if (entityType == 'DocumentRevision' && has(entityId)) return '/revisions/$entityId';
  if (entityType == 'ReviewStep' && has(entityId)) return '/reviews/$entityId';
  return '/notifications';
}

String routeForPushData(Map<String, dynamic> data) => routeForNotification(
      type: (data['type'] as String?) ?? '',
      entityType: data['entityType'] as String?,
      entityId: data['entityId'] as String?,
      projectId: data['projectId'] as String?,
      link: data['link'] as String?,
    );
