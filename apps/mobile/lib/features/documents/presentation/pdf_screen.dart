import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:pdfrx/pdfrx.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../../../core/files/offline_store.dart';
import '../data/documents_repository.dart';

class _Opened {
  const _Opened({required this.path, required this.revLabel, required this.banner});
  final String path;
  final String revLabel;
  final RevisionBanner banner;
}

/// PDF viewer (docs/08-mobile.md §6–7): pinned/cached file or a fresh stamped download, with the
/// revision status bar and a red "old revision" strip on every page.
class PdfScreen extends ConsumerStatefulWidget {
  const PdfScreen({required this.revisionId, required this.documentId, super.key});

  final String revisionId;
  final String documentId;

  @override
  ConsumerState<PdfScreen> createState() => _PdfScreenState();
}

class _PdfScreenState extends ConsumerState<PdfScreen> {
  late Future<_Opened> _opened = _open();
  int _page = 1;

  Future<_Opened> _open() async {
    final repo = ref.read(documentsRepositoryProvider);
    final store = ref.read(offlineStoreProvider);
    var rev = await repo.revision(widget.revisionId);
    String revLabel;
    String status;
    String documentId;
    String? latestApproved;
    if (rev != null) {
      revLabel = rev.revLabel;
      status = rev.status;
      documentId = rev.documentId;
      latestApproved = (await repo.document(documentId))?.latestApprovedRevisionId;
    } else {
      // project not followed: ask the server (online only)
      final live = await ref.read(apiProvider).revision(widget.revisionId);
      rev = RevisionItem(live);
      revLabel = rev.revLabel;
      status = rev.status;
      documentId = rev.documentId;
      latestApproved = live['isLatestApproved'] == true ? rev.id : null;
    }
    final local = await store.local(widget.revisionId);
    var banner = bannerFor(
      revisionId: widget.revisionId,
      revisionStatus: status,
      latestApprovedRevisionId: latestApproved,
    );
    if (local != null && local.stale) banner = RevisionBanner.old;
    final path = await store.open(
      documentId: documentId,
      revisionId: widget.revisionId,
      revLabel: revLabel,
      cacheLimitBytes: ref.read(settingsProvider).cacheLimitBytes,
    );
    return _Opened(path: path, revLabel: revLabel, banner: banner);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    return Scaffold(
      appBar: AppBar(title: Text(l.pdfPage(_page))),
      body: FutureBuilder<_Opened>(
        future: _opened,
        builder: (context, snap) {
          if (snap.hasError) {
            return ErrorView(
              error: snap.error!,
              onRetry: () => setState(() => _opened = _open()),
            );
          }
          final o = snap.data;
          if (o == null) return const Center(child: CircularProgressIndicator());
          final (color, text) = switch (o.banner) {
            RevisionBanner.working => (Colors.green.shade700, l.bannerWorking(o.revLabel)),
            RevisionBanner.notApproved => (Colors.orange.shade800, l.bannerNotApproved(o.revLabel)),
            RevisionBanner.old => (Colors.red.shade700, l.bannerOld(o.revLabel)),
          };
          return Column(children: [
            Container(
              width: double.infinity,
              color: color,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(text, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
            ),
            Expanded(
              child: PdfViewer.file(
                o.path,
                params: PdfViewerParams(
                  onPageChanged: (n) {
                    if (n != null && mounted) setState(() => _page = n);
                  },
                  pageOverlaysBuilder: o.banner == RevisionBanner.old
                      ? (context, pageRect, page) => [
                            Align(
                              alignment: Alignment.topCenter,
                              child: Container(
                                width: double.infinity,
                                color: Colors.red.withValues(alpha: 0.85),
                                padding: const EdgeInsets.all(4),
                                child: Text(text,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(color: Colors.white, fontSize: 11)),
                              ),
                            ),
                          ]
                      : null,
                ),
              ),
            ),
          ]);
        },
      ),
    );
  }
}
