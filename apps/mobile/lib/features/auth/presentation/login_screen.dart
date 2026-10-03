import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../app/ui.dart';
import '../../../core/api/problem.dart';
import '../../../core/auth/session.dart';

/// Login / MFA (docs/08-mobile.md §7). Error text comes from the server's problem+json.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  bool _busy = false;
  ApiProblem? _problem;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _run(Future<ApiProblem?> Function() action) async {
    setState(() {
      _busy = true;
      _problem = null;
    });
    final p = await action();
    if (mounted) {
      setState(() {
        _busy = false;
        _problem = p;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final session = ref.watch(sessionProvider);
    final controller = ref.read(sessionProvider.notifier);
    final mfa = session is MfaRequired;
    final reason = session is SignedOut ? session.reason : SignOutReason.none;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(Icons.water_drop_outlined, size: 56, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(height: 8),
                    Text(l.appTitle,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 4),
                    Text(mfa ? l.loginMfaTitle : l.loginTitle,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 24),
                    if (reason == SignOutReason.revoked)
                      _Notice(text: l.loginRevoked)
                    else if (reason == SignOutReason.completeOnWeb)
                      _Notice(text: l.loginCompleteOnWeb),
                    if (_problem != null) _Notice(text: problemText(context, _problem!), error: true),
                    if (!mfa) ...[
                      TextField(
                        key: const Key('login-email'),
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        textInputAction: TextInputAction.next,
                        decoration: InputDecoration(labelText: l.loginEmail),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        key: const Key('login-password'),
                        controller: _password,
                        obscureText: true,
                        autofillHints: const [AutofillHints.password],
                        onSubmitted: (_) =>
                            _run(() => controller.login(_email.text.trim(), _password.text)),
                        decoration: InputDecoration(labelText: l.loginPassword),
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        key: const Key('login-submit'),
                        onPressed: _busy
                            ? null
                            : () => _run(() => controller.login(_email.text.trim(), _password.text)),
                        child: Text(l.loginSubmit),
                      ),
                    ] else ...[
                      Text(l.loginMfaHint),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _code,
                        keyboardType: TextInputType.number,
                        autofillHints: const [AutofillHints.oneTimeCode],
                        maxLength: 6,
                        decoration: InputDecoration(labelText: l.loginMfaCode),
                        onSubmitted: (_) => _run(() => controller.verifyMfa(_code.text.trim())),
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _busy ? null : () => _run(() => controller.verifyMfa(_code.text.trim())),
                        child: Text(l.loginMfaSubmit),
                      ),
                      TextButton(onPressed: controller.cancelMfa, child: Text(l.loginBack)),
                    ],
                    if (_busy) const Padding(
                      padding: EdgeInsets.only(top: 16),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, this.error = false});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: error ? c.errorContainer : c.secondaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text,
          style: TextStyle(color: error ? c.onErrorContainer : c.onSecondaryContainer)),
    );
  }
}
