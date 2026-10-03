# WEMS mobile (Flutter)

Phase 1 app for site and design staff — `docs/08-mobile.md`.

| Area | Where |
|---|---|
| Login / MFA, session restore, single-flight refresh | `lib/core/auth`, `lib/core/api/api_client.dart` |
| Pull sync (`GET /sync/pull`, scopes `global`, `user:<me>`, `project:<followed>`) | `lib/core/sync/pull_sync.dart` + `drift_stores.dart` |
| Outbox (order, dependsOn, `$upload:` placeholders, 409/4xx/5xx, backoff) | `lib/core/sync/outbox.dart` |
| Offline pins (sha256 check, "old revision" flag, auto-replace on Wi-Fi), PDF cache (LRU) | `lib/core/files/offline_store.dart` |
| Push (FCM) and deep links | `lib/core/push/` |
| Screens | `lib/features/{auth,home,projects,documents,reviews,notifications,settings}` |

## Run

```bash
cd apps/mobile
flutter pub get
flutter gen-l10n                                   # lib/l10n/gen (not run by pub get any more)
dart run build_runner build                        # drift tables (*.g.dart)
flutter analyze && flutter test
cp env/dev.example.json env/dev.json             # per-developer copy (git-ignored)
flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=env/dev.json
```

- `env/dev.json` points at `http://10.0.2.2:4000` (the host machine from the Android emulator).
  For a phone on the same network use the computer's LAN address. Cleartext HTTP is allowed in
  the `dev` flavor only.
- Sign in with any user of the API (e.g. the UAT users from `pnpm --filter api seed:demo`). Users
  that must change a temporary password or set up MFA are asked to do it on the web first.
- iOS: the `ios/` folder is not committed yet — create it once with
  `flutter create --platforms=ios --org th.co.wems --project-name wems_mobile .`, then add the
  schemes `dev`/`staging`/`prod` in Xcode (docs/08-mobile.md §10).

On Windows `tool\check.bat` runs the same steps as CI and writes `build\check.log`
(`tool\check.bat apk` also builds the debug APK). Verified 2026-10-04 with Flutter 3.47.6 /
Dart 3.13.5: analyze clean, 31 tests pass, `app-dev-debug.apk` builds (AGP 9.1, Gradle 9.3.1,
Kotlin 2.4, JDK 17).

## Push notifications

Disabled unless `PUSH_ENABLED` is `true` in the flavor file **and** the Firebase files exist on
the build machine (`android/app/google-services.json`, `ios/Runner/GoogleService-Info.plist`;
both are git-ignored). To enable on Android add the `com.google.gms.google-services` plugin to
`android/settings.gradle.kts` and `android/app/build.gradle.kts`. The API side needs
`FCM_CREDENTIALS_JSON` (see `.env.example`).

## Generated code

- `lib/l10n/app_*.arb`: hand-written keys + `enum*` keys from `docs/data/enum-labels.json`
  (`node tools/gen-i18n-enums.mjs`, which also writes `lib/l10n/enum_labels.dart`).
- `lib/l10n/gen/` (gen-l10n) and `*.g.dart` (drift) are produced in CI and locally — not committed.
- API: phase 1 uses the hand-written `lib/core/api/wems_api.dart` (method names follow the
  OpenAPI operationIds). `swagger_parser.yaml` is ready for the generated client
  (`lib/core/api/generated/`) once retrofit/freezed are added.

## Status

Compiles and passes analyze/tests on Flutter 3.47.6; the debug APK (`dev` flavor) builds. Not yet
exercised on a device against a running API — do that in UAT (`docs/runbooks/uat-pilot.md`).
`firebase_core` and `workmanager_android` still apply the Kotlin Gradle plugin themselves
(`android.builtInKotlin=false` in `gradle.properties`); drop that flag once both migrate to
Built-in Kotlin.
