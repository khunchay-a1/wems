import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../data/documents_repository.dart';

/// `/revisions/:id` (push without a document link): find the document locally, else online,
/// then replace this route with the document page.
class RevisionLinkScreen extends ConsumerStatefulWidget {
  const RevisionLinkScreen({required this.revisionId, super.key});

  final String revisionId;

  @override
  ConsumerState<RevisionLinkScreen> createState() => _RevisionLinkScreenState();
}

class _RevisionLinkScreenState extends ConsumerState<RevisionLinkScreen> {
  Object? _error;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  Future<void> _resolve() async {
    setState(() => _error = null);
    try {
      final repo = ref.read(documentsRepositoryProvider);
      final local = await repo.revision(widget.revisionId);
      String documentId;
      String projectId;
      if (local != null) {
        documentId = local.documentId;
        projectId = (await repo.document(documentId))?.projectId ?? '';
      } else {
        final rev = await ref.read(apiProvider).revision(widget.revisionId);
        documentId = rev['documentId'] as String;
        projectId = rev['projectId'] as String;
      }
      if (mounted) context.replace('/projects/$projectId/documents/$documentId');
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: _error == null
            ? const Center(child: CircularProgressIndicator())
            : ErrorView(error: _error!, onRetry: _resolve),
      );
}
