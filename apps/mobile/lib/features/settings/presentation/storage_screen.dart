import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../../../core/db/database.dart';
import '../../../core/util/version.dart';

final pinnedFilesProvider =
    StreamProvider<List<FileRow>>((ref) => ref.watch(offlineStoreProvider).watchPinned());

final cacheBytesProvider = FutureProvider<int>((ref) {
  ref.watch(pinnedFilesProvider); // recompute when files change
  return ref.watch(offlineStoreProvider).cacheBytes();
});

/// Pinned document row, shared with the home screen.
class PinnedTile extends ConsumerWidget {
  const PinnedTile({required this.file, this.deletable = false, super.key});

  final FileRow file;
  final bool deletable;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l;
    final error = Theme.of(context).colorScheme.error;
    return ListTile(
      leading: Icon(Icons.push_pin, color: file.stale ? error : null),
      title: Text('Rev.${file.revLabel} · ${formatBytes(file.sizeBytes)}'),
      subtitle: file.stale ? Text(l.storageOld, style: TextStyle(color: error)) : null,
      trailing: deletable
          ? IconButton(
              tooltip: l.docUnpin,
              icon: const Icon(Icons.delete_outline),
              onPressed: () => ref.read(offlineStoreProvider).remove(file.revisionId),
            )
          : null,
      onTap: () => context.push('/pdf/${file.revisionId}?documentId=${file.documentId}'),
    );
  }
}

/// "พื้นที่เก็บข้อมูล" (docs/08-mobile.md §6): pinned documents, sizes, delete; cache size.
class StorageScreen extends ConsumerWidget {
  const StorageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l;
    final pins = ref.watch(pinnedFilesProvider).value ?? const <FileRow>[];
    final cache = ref.watch(cacheBytesProvider).value ?? 0;
    return Scaffold(
      appBar: AppBar(title: Text(l.storageTitle)),
      body: ListView(children: [
        ListTile(
          leading: const Icon(Icons.cached),
          title: Text(l.storageCache(formatBytes(cache))),
          trailing: TextButton(
            onPressed: () async {
              await ref.read(offlineStoreProvider).clearCache();
              ref.invalidate(cacheBytesProvider);
            },
            child: Text(l.storageClearCache),
          ),
        ),
        const Divider(),
        if (pins.isEmpty) EmptyView(l.storageEmpty, icon: Icons.push_pin_outlined),
        for (final p in pins) PinnedTile(file: p, deletable: true),
      ]),
    );
  }
}
