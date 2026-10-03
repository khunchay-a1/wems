import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:pdfrx/pdfrx.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../../../core/api/problem.dart';
import '../../../core/auth/session.dart';
import '../../../core/util/ids.dart';
import '../../../l10n/enum_labels.dart';
import '../data/reviews_repository.dart';

class _ReviewData {
  const _ReviewData({required this.task, required this.step, required this.pdfPath});
  final ReviewTask task;
  final Map<String, dynamic> step;
  final String pdfPath;

  bool get canDecide => ((step['allowedActions'] as List<dynamic>?) ?? const []).contains('decide');
  bool get requiresSignature => step['requiresSignature'] == true;
  int get version => (step['version'] as num).toInt();
}

/// Review page (docs/08-mobile.md §7): PDF + comments (long-press to pin one) and the decision
/// sheet → signature dialog. Online only; buttons follow `allowedActions` from the API.
class ReviewScreen extends ConsumerStatefulWidget {
  const ReviewScreen({required this.stepId, super.key});

  final String stepId;

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends ConsumerState<ReviewScreen> {
  late Future<_ReviewData?> _data = _load();
  List<Map<String, dynamic>> _comments = const [];

  ReviewsRepository get _repo => ref.read(reviewsRepositoryProvider);

  Future<_ReviewData?> _load() async {
    final task = await _repo.task(widget.stepId);
    if (task == null) return null;
    final step = await _repo.liveStep(task.cycleId, widget.stepId);
    if (step == null) return null;
    final path = await ref.read(offlineStoreProvider).open(
          documentId: task.documentId,
          revisionId: task.revisionId,
          revLabel: task.revLabel,
          cacheLimitBytes: ref.read(settingsProvider).cacheLimitBytes,
        );
    await _reloadComments(task.revisionId);
    return _ReviewData(task: task, step: step, pdfPath: path);
  }

  Future<void> _reloadComments(String revisionId) async {
    final list = await _repo.comments(revisionId);
    if (mounted) setState(() => _comments = list);
  }

  Future<void> _addComment(_ReviewData d, {int? page, double? x, double? y}) async {
    final body = await showDialog<String>(context: context, builder: (_) => const _CommentDialog());
    if (body == null || body.trim().isEmpty || !mounted) return;
    try {
      await _repo.addComment(
        revisionId: d.task.revisionId,
        stepId: d.task.id,
        body: body.trim(),
        page: page,
        x: x,
        y: y,
      );
      await _reloadComments(d.task.revisionId);
    } catch (e) {
      if (mounted) showSnack(context, problemText(context, e));
    }
  }

  Future<void> _decide(_ReviewData d) async {
    final session = ref.read(sessionProvider);
    final hasPin = session is SignedIn && session.me.hasSigningPin;
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _DecisionSheet(
        data: d,
        hasSigningPin: hasPin,
        submit: (decision, note, signature, key) => _repo.decide(
          stepId: d.task.id,
          version: d.version,
          decision: decision,
          note: note,
          signature: signature,
          idempotencyKey: key,
        ),
      ),
    );
    if (!mounted) return;
    if (done == true) {
      showSnack(context, context.l.reviewDecided);
      unawaited(ref.read(syncEngineProvider).syncNow());
      context.go('/reviews');
    } else if (done == false) {
      // conflict: reload the step so the user sees the current state
      setState(() => _data = _load());
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    return Scaffold(
      appBar: AppBar(title: Text(l.reviewDecisionTitle)),
      body: FutureBuilder<_ReviewData?>(
        future: _data,
        builder: (context, snap) {
          if (snap.hasError) {
            final e = snap.error!;
            return ErrorView(
              error: e is ApiProblem && e.isNetwork ? ApiProblem(status: 0, detail: l.reviewNeedsOnline) : e,
              onRetry: () => setState(() => _data = _load()),
            );
          }
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final d = snap.data;
          if (d == null) return EmptyView(l.reviewNotFound, icon: Icons.task_alt);
          return Column(children: [
            ListTile(
              title: Text('${d.task.documentNumber} Rev.${d.task.revLabel}'),
              subtitle: Text('${d.task.name} · ${enumLabel(l, 'PurposeCode', d.task.purposeCode)}\n'
                  '${l.reviewsSubmittedBy(d.task.submittedByName)}'),
              isThreeLine: true,
            ),
            Expanded(
              flex: 3,
              child: PdfViewer.file(
                d.pdfPath,
                params: PdfViewerParams(
                  pageOverlaysBuilder: (context, pageRect, page) => [
                    SizedBox(
                      width: pageRect.width,
                      height: pageRect.height,
                      child: Stack(children: [
                        Positioned.fill(
                          child: GestureDetector(
                            behavior: HitTestBehavior.translucent,
                            onLongPressStart: (e) => _addComment(
                              d,
                              page: page.pageNumber,
                              x: (e.localPosition.dx / pageRect.width).clamp(0.0, 1.0),
                              y: (e.localPosition.dy / pageRect.height).clamp(0.0, 1.0),
                            ),
                          ),
                        ),
                        for (final c in _comments)
                          if (_anchorPage(c) == page.pageNumber)
                            Positioned(
                              left: _anchorX(c) * pageRect.width - 10,
                              top: _anchorY(c) * pageRect.height - 10,
                              child: _Marker(seq: (c['seq'] as num?)?.toInt() ?? 0, open: c['status'] == 'OPEN'),
                            ),
                      ]),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              flex: 2,
              child: _CommentList(
                comments: _comments,
                onAdd: () => _addComment(d),
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: d.canDecide ? () => _decide(d) : null,
                    icon: const Icon(Icons.gavel),
                    label: Text(d.canDecide ? l.reviewDecide : l.reviewNotAllowed),
                  ),
                ),
              ),
            ),
          ]);
        },
      ),
    );
  }

  static Map<String, dynamic>? _anchor(Map<String, dynamic> c) =>
      c['anchor'] is Map ? Map<String, dynamic>.from(c['anchor'] as Map) : null;
  static int? _anchorPage(Map<String, dynamic> c) => (_anchor(c)?['page'] as num?)?.toInt();
  static double _anchorX(Map<String, dynamic> c) => ((_anchor(c)?['x'] as num?) ?? 0).toDouble();
  static double _anchorY(Map<String, dynamic> c) => ((_anchor(c)?['y'] as num?) ?? 0).toDouble();
}

class _Marker extends StatelessWidget {
  const _Marker({required this.seq, required this.open});
  final int seq;
  final bool open;

  @override
  Widget build(BuildContext context) => Container(
        width: 20,
        height: 20,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: open ? Colors.orange.shade700 : Colors.green.shade700,
          shape: BoxShape.circle,
        ),
        child: Text('$seq', style: const TextStyle(color: Colors.white, fontSize: 10)),
      );
}

class _CommentList extends StatelessWidget {
  const _CommentList({required this.comments, required this.onAdd});
  final List<Map<String, dynamic>> comments;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
        child: Row(children: [
          Expanded(child: Text(l.reviewComments, style: Theme.of(context).textTheme.titleSmall)),
          TextButton.icon(onPressed: onAdd, icon: const Icon(Icons.add_comment_outlined), label: Text(l.reviewAddComment)),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Text(l.reviewAddHint, style: Theme.of(context).textTheme.bodySmall),
      ),
      Expanded(
        child: comments.isEmpty
            ? Center(child: Text(l.reviewNoComments))
            : ListView(children: [
                for (final c in comments)
                  ListTile(
                    dense: true,
                    leading: CircleAvatar(radius: 14, child: Text('${c['seq'] ?? ''}')),
                    title: Text((c['body'] as String?) ?? ''),
                    subtitle: Text(<String>[
                      ((c['author'] as Map?)?['displayName'] as String?) ?? '',
                      if (c['anchor'] is Map) l.reviewCommentOnPage(((c['anchor'] as Map)['page'] as num).toInt()),
                      enumLabel(l, 'CommentStatus', c['status'] as String?),
                    ].where((s) => s.isNotEmpty).join(' · ')),
                  ),
              ]),
      ),
    ]);
  }
}

class _CommentDialog extends StatefulWidget {
  const _CommentDialog();

  @override
  State<_CommentDialog> createState() => _CommentDialogState();
}

class _CommentDialogState extends State<_CommentDialog> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(context.l.reviewAddComment),
        content: TextField(
          controller: _text,
          autofocus: true,
          minLines: 2,
          maxLines: 6,
          decoration: InputDecoration(labelText: context.l.reviewCommentBody),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(context.l.commonCancel)),
          FilledButton(onPressed: () => Navigator.pop(context, _text.text), child: Text(context.l.commonSave)),
        ],
      );
}

typedef _Submit = Future<Object?> Function(
    String decision, String? note, Map<String, String>? signature, String idempotencyKey);

/// Pops `true` when saved, `false` on a version conflict, null when dismissed.
class _DecisionSheet extends StatefulWidget {
  const _DecisionSheet({required this.data, required this.hasSigningPin, required this.submit});
  final _ReviewData data;
  final bool hasSigningPin;
  final _Submit submit;

  @override
  State<_DecisionSheet> createState() => _DecisionSheetState();
}

class _DecisionSheetState extends State<_DecisionSheet> {
  static const _decisions = ['APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED'];
  final _note = TextEditingController();
  // one key per sheet: a retried submit is the same request (docs/04-api-conventions.md §6)
  final _key = newId();
  String? _decision;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final decision = _decision;
    if (decision == null) return;
    Map<String, String>? signature;
    if (widget.data.requiresSignature) {
      signature = await showDialog<Map<String, String>>(
        context: context,
        builder: (_) => SignatureDialog(hasSigningPin: widget.hasSigningPin),
      );
      if (signature == null) return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.submit(decision, _note.text, signature, _key);
      if (mounted) Navigator.pop(context, true);
    } on ApiProblem catch (p) {
      if (!mounted) return;
      if (p.isConflict) {
        showSnack(context, context.l.reviewConflict);
        Navigator.pop(context, false);
        return;
      }
      setState(() {
        _busy = false;
        _error = problemText(context, p);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(l.reviewDecisionTitle, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final d in _decisions)
              ListTile(
                key: Key('decision-$d'),
                title: Text(enumLabel(l, 'ReviewStepStatus', d)),
                leading: Icon(_decision == d ? Icons.radio_button_checked : Icons.radio_button_unchecked),
                selected: _decision == d,
                onTap: _busy ? null : () => setState(() => _decision = d),
              ),
            TextField(
              controller: _note,
              minLines: 1,
              maxLines: 4,
              decoration: InputDecoration(labelText: l.reviewNote),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _decision == null || _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(l.reviewSubmit),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Signing PIN or password (docs/06-security.md §5, BR-DOC-043). Returns `{method, secret}`.
class SignatureDialog extends StatefulWidget {
  const SignatureDialog({required this.hasSigningPin, super.key});
  final bool hasSigningPin;

  @override
  State<SignatureDialog> createState() => _SignatureDialogState();
}

class _SignatureDialogState extends State<SignatureDialog> {
  late String _method = widget.hasSigningPin ? 'SIGNING_PIN' : 'PASSWORD';
  final _secret = TextEditingController();

  @override
  void dispose() {
    _secret.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final pin = _method == 'SIGNING_PIN';
    return AlertDialog(
      title: Text(l.signatureTitle),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(l.signatureIntro),
        const SizedBox(height: 12),
        if (widget.hasSigningPin)
          SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'SIGNING_PIN', label: Text(l.signaturePin)),
              ButtonSegment(value: 'PASSWORD', label: Text(l.signaturePassword)),
            ],
            selected: {_method},
            onSelectionChanged: (s) => setState(() {
              _method = s.first;
              _secret.clear();
            }),
          ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('signature-secret'),
          controller: _secret,
          autofocus: true,
          obscureText: true,
          keyboardType: pin ? TextInputType.number : TextInputType.visiblePassword,
          decoration: InputDecoration(labelText: pin ? l.signaturePin : l.signaturePassword),
        ),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.commonCancel)),
        FilledButton(
          onPressed: () {
            if (_secret.text.isEmpty) return;
            Navigator.pop(context, {'method': _method, 'secret': _secret.text});
          },
          child: Text(l.signatureConfirm),
        ),
      ],
    );
  }
}
