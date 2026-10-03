/// Per-flavor configuration from `--dart-define-from-file=env/<flavor>.json (copy of env/<flavor>.example.json)` (docs/08-mobile.md §10).
/// No secrets here: only public endpoints and switches.
class Env {
  const Env._();

  static const flavor = String.fromEnvironment('FLAVOR', defaultValue: 'dev');

  /// Origin of the API without `/api/v1` (Android emulator → host machine by default).
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000',
  );

  /// FCM needs google-services.json / GoogleService-Info.plist, which are not in the repo.
  static const pushEnabled = bool.fromEnvironment('PUSH_ENABLED');
}
