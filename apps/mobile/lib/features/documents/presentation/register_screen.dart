import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../../../core/db/database.dart';
import '../../../l10n/enum_labels.dart';
import '../../settings/presentation/storage_screen.dart';
import '../data/documents_repository.dart';

/// Document register from drift — searchable offline (docs/08-mobile.md §7).
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({required this.projectId, super.key});

  final String projectId;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  String _query = '';
  String? _discipline;
  String? _type;
  String? _status;

  static const _statuses = ['ACTIVE', 'ON_HOLD', 'CANCELLED', 'SUPERSEDED'];

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final locale = ref.watch(settingsProvider).locale;
    final docs = ref.watch(documentsProvider(widget.projectId));
    final revisions = ref.watch(projectRevisionsProvider(widget.projectId)).value ?? const {};
    final disciplines = ref.watch(disciplinesProvider).value ?? const <MasterItem>[];
    final types = ref.watch(documentTypesProvider).value ?? const <MasterItem>[];
    final pinnedDocs = {
      for (final FileRow f in ref.watch(pinnedFilesProvider).value ?? const <FileRow>[]) f.documentId
    };

    Widget filter(String label, String? value, List<(String, String)> options, void Function(String?) assign) =>
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: PopupMenuButton<String>(
            onSelected: (v) => setState(() => assign(v.isEmpty ? null : v)),
            itemBuilder: (_) => [
              PopupMenuItem(value: '', child: Text(l.commonAll)),
              for (final o in options) PopupMenuItem(value: o.$1, child: Text(o.$2)),
            ],
            child: Chip(
              label: Text(options.where((o) => o.$1 == value).map((o) => o.$2).firstOrNull ?? label),
              avatar: Icon(value == null ? Icons.filter_list : Icons.check, size: 16),
            ),
          ),
        );

    return Scaffold(
      appBar: AppBar(title: Text(l.registerTitle)),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: TextField(
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: l.registerSearch,
              isDense: true,
              border: const OutlineInputBorder(),
            ),
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(children: [
            filter(l.registerDiscipline, _discipline,
                [for (final d in disciplines) (d.id, '${d.code} ${d.name(locale)}')], (v) => _discipline = v),
            filter(l.registerType, _type,
                [for (final t in types) (t.id, '${t.code} ${t.name(locale)}')], (v) => _type = v),
            filter(l.registerStatus, _status,
                [for (final s in _statuses) (s, enumLabel(l, 'DocumentStatus', s))], (v) => _status = v),
          ]),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => ref.read(syncEngineProvider).syncNow(),
            child: AsyncBody<List<DocumentItem>>(
              value: docs,
              data: (all) {
                if (all.isEmpty) return ListView(children: [EmptyView(l.registerNotSynced)]);
                final list = filterDocuments(all,
                    query: _query, disciplineId: _discipline, documentTypeId: _type, status: _status);
                if (list.isEmpty) return ListView(children: [EmptyView(l.registerEmpty)]);
                return ListView.separated(
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final d = list[i];
                    final working = revisions[d.latestApprovedRevisionId];
                    final current = revisions[d.currentRevisionId];
                    return ListTile(
                      title: Text(d.number),
                      subtitle: Text(d.titleFor(locale), maxLines: 2, overflow: TextOverflow.ellipsis),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Row(mainAxisSize: MainAxisSize.min, children: [
                            if (pinnedDocs.contains(d.id))
                              const Padding(
                                padding: EdgeInsets.only(right: 4),
                                child: Icon(Icons.push_pin, size: 16),
                              ),
                            Text(working != null ? 'Rev.${working.revLabel}' : '—',
                                style: Theme.of(context).textTheme.titleSmall),
                          ]),
                          if (current != null && current.id != working?.id)
                            StatusChip('RevisionStatus', current.status),
                        ],
                      ),
                      onTap: () => context.go('/projects/${widget.projectId}/documents/${d.id}'),
                    );
                  },
                );
              },
            ),
          ),
        ),
      ]),
    );
  }
}
