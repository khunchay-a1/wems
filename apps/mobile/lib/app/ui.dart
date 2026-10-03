import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../core/api/problem.dart';
import '../l10n/enum_labels.dart';
import '../l10n/gen/app_localizations.dart';

extension L10nX on BuildContext {
  AppLocalizations get l => AppLocalizations.of(this);
}

/// Water-blue seed; status colours follow the web StatusBadge tones.
ThemeData buildTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(seedColor: const Color(0xFF0B6E99), brightness: brightness);
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    visualDensity: VisualDensity.standard,
    listTileTheme: const ListTileThemeData(contentPadding: EdgeInsets.symmetric(horizontal: 16)),
  );
}

String problemText(BuildContext context, Object error) => error is ApiProblem
    ? (error.isNetwork ? context.l.commonNeedsOnline : error.message(context.l.commonUnexpected))
    : context.l.commonUnexpected;

void showSnack(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));
}

/// Coloured chip with the localised enum label.
class StatusChip extends StatelessWidget {
  const StatusChip(this.enumName, this.value, {super.key});

  final String enumName;
  final String value;

  Color _tone(ColorScheme c) => switch (value) {
        'APPROVED' || 'ISSUED' || 'ACTIVE' || 'CODE_1' => Colors.green.shade700,
        'IN_REVIEW' || 'PENDING' || 'ON_HOLD' || 'CODE_2' => Colors.orange.shade800,
        'REJECTED' || 'CODE_3' || 'CODE_4' || 'CANCELLED' => c.error,
        'SUPERSEDED' || 'VOID' || 'CLOSED' => c.outline,
        _ => c.primary,
      };

  @override
  Widget build(BuildContext context) {
    final color = _tone(Theme.of(context).colorScheme);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        enumLabel(context.l, enumName, value),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color),
      ),
    );
  }
}

/// Error with retry, used by screens that load online data.
class ErrorView extends StatelessWidget {
  const ErrorView({required this.error, this.onRetry, super.key});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.cloud_off_outlined, size: 40, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
            Text(problemText(context, error), textAlign: TextAlign.center),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              OutlinedButton(onPressed: onRetry, child: Text(context.l.commonRetry)),
            ],
          ]),
        ),
      );
}

class EmptyView extends StatelessWidget {
  const EmptyView(this.text, {this.icon = Icons.inbox_outlined, super.key});

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 40, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center),
          ]),
        ),
      );
}

/// Renders an AsyncValue with the shared loading / error views.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({required this.value, required this.data, this.onRetry, super.key});

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => value.when(
        data: data,
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(error: e, onRetry: onRetry),
      );
}
