import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:wems_mobile/features/reviews/presentation/review_screen.dart';
import 'package:wems_mobile/l10n/gen/app_localizations.dart';

/// Signature dialog (docs/08-mobile.md §11 widget tests): PIN by default when the user has one,
/// returns the `SignatureInputDto` body.
void main() {
  Future<Map<String, String>?> open(WidgetTester tester, {required bool hasPin}) async {
    Map<String, String>? result;
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async {
                result = await showDialog<Map<String, String>>(
                  context: context,
                  builder: (_) => SignatureDialog(hasSigningPin: hasPin),
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('signature-secret')), '135790');
    await tester.tap(find.text('Sign and submit'));
    await tester.pumpAndSettle();
    return result;
  }

  testWidgets('with a signing PIN the dialog signs with SIGNING_PIN', (tester) async {
    expect(await open(tester, hasPin: true), {'method': 'SIGNING_PIN', 'secret': '135790'});
  });

  testWidgets('without a PIN it asks for the password', (tester) async {
    expect(await open(tester, hasPin: false), {'method': 'PASSWORD', 'secret': '135790'});
  });
}
