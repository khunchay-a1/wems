import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../../../core/db/database.dart';
import '../../../core/files/offline_store.dart';
import '../../../l10n/enum_labels.dart';
import '../data/documents_repository.dart';

final pinForDocumentProvider = StreamProvider.family<FileRow?, String>(
    (ref, documentId) => ref.watch(offlineStoreProvider).watchPinForDocument(documentId));

/// Document detail: every revision, the working one highlighted, open / pin (docs/08-mobile.md §7).
class DocumentScreen extends ConsumerStatefulWidget {
  const DocumentScreen({required this.projectId, required this.documentId, super.key});

  final String projectId;
  final String documentId;

  @override
  ConsumerState<DocumentScreen> createState() => _DocumentScreenState();
}

class _DocumentScreenState extends ConsumerState<DocumentScreen> {
  bool _busy = false;

  Future<void> _pin(DocumentItem doc, RevisionItem working) async {
    setState(() => _busy = true);
    try {
      await ref.read(offlineStoreProvider).pin(
            documentId: doc.id,
            revisionId: working.id,
            revLabel: working.revLabel,
          );
      if (mounted) showSnack(context, context.l.docPinned);
    } on PinVerifyFailed {
      if (mounted) showSnack(context, context.l.docPinVerifyFailed);
    } catch (e) {
      if (mounted) showSnack(context, problemText(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _open(DocumentItem doc, RevisionItem rev) {
    if (!rev.hasPdf) {
      showSnack(context, context.l.docNoPdf);
      return;
    }
    context.push('/pdf/${rev.id}?documentId=${doc.id}');
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final locale = ref.watch(settingsProvider).locale;
    final dates = ref.watch(datesProvider);
    final docValue = ref.watch(documentProvider(widget.documentId));
    final revisions = ref.watch(revisionsProvider(widget.documentId)).value ?? const <RevisionItem>[];
    final pin = ref.watch(pinForDocumentProvider(widget.documentId)).value;

    return Scaffold(
      appBar: AppBar(title: Text(docValue.value?.number ?? l.registerTitle)),
      body: AsyncBody<DocumentItem?>(
        value: docValue,
        data: (doc) {
          if (doc == null) return EmptyView(l.docNotFound);
          final working = revisions.where((r) => r.id == doc.latestApprovedRevisionId).firstOrNull;
          return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
            ListTile(
              title: Text(doc.titleFor(locale), style: Theme.of(context).textTheme.titleMedium),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Wrap(spacing: 8, runSpacing: 4, children: [
                  StatusChip('DocumentStatus', doc.status),
                  if (doc.ownerName != null) Text(doc.ownerName!),
                ]),
              ),
            ),
            Card(
              margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              color: Theme.of(context).colorScheme.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: working == null
                    ? Text(l.docNoWorking)
                    : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(l.docWorkingRevision, style: Theme.of(context).textTheme.labelMedium),
                        const SizedBox(height: 4),
                        Text('Rev.${working.revLabel} · ${enumLabel(l, 'PurposeCode', working.purposeCode)}',
                            style: Theme.of(context).textTheme.titleLarge),
                        if (working.approvedAt != null) Text(l.docApprovedOn(dates.date(working.approvedAt))),
                        if (pin != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Row(children: [
                              Icon(Icons.push_pin, size: 16, color: pin.stale ? Colors.red : null),
                              const SizedBox(width: 4),
                              Text(pin.stale ? l.bannerOld(pin.revLabel) : l.docPinned),
                            ]),
                          ),
                        const SizedBox(height: 12),
                        Wrap(spacing: 8, runSpacing: 8, children: [
                          FilledButton.icon(
                            onPressed: () => _open(doc, working),
                            icon: const Icon(Icons.picture_as_pdf_outlined),
                            label: Text(l.docOpenPdf),
                          ),
                          if (pin == null || pin.revisionId != working.id)
                            OutlinedButton.icon(
                              onPressed: _busy || !working.hasPdf ? null : () => _pin(doc, working),
                              icon: _busy
                                  ? const SizedBox(
                                      width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                  : const Icon(Icons.push_pin_outlined),
                              label: Text(l.docPin),
                            )
                          else
                            TextButton.icon(
                              onPressed: () => ref.read(offlineStoreProvider).remove(pin.revisionId),
                              icon: const Icon(Icons.delete_outline),
                              label: Text(l.docUnpin),
                            ),
                        ]),
                      ]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text(l.docRevisions, style: Theme.of(context).textTheme.titleSmall),
            ),
            for (final r in revisions)
              ListTile(
                selected: r.id == working?.id,
                leading: CircleAvatar(child: Text(r.revLabel)),
                title: Row(children: [
                  Flexible(child: Text(enumLabel(l, 'PurposeCode', r.purposeCode), overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: 8),
                  StatusChip('RevisionStatus', r.status),
                ]),
                subtitle: Text([
                  l.docPreparedBy(r.preparedByName),
                  if (r.approvedAt != null) l.docApprovedOn(dates.date(r.approvedAt)),
                  if (r.clientReturnCode != null) enumLabel(l, 'ClientReturnCode', r.clientReturnCode),
                ].join(' · ')),
                trailing: r.hasPdf ? const Icon(Icons.chevron_right) : null,
                onTap: r.hasPdf ? () => _open(doc, r) : null,
              ),
          ]);
        },
      ),
    );
  }
}
