@echo off
rem Local check on Windows (same steps as the CI mobile job). Log: apps\mobile\build\check.log
rem Set FLUTTER_HOME if Flutter is not on PATH, e.g. set FLUTTER_HOME=C:\Devtool\flutter
setlocal
if "%FLUTTER_HOME%"=="" set FLUTTER_HOME=C:\Devtool\flutter
set PATH=%FLUTTER_HOME%\bin;%PATH%
cd /d "%~dp0.."
if not exist build mkdir build
set LOG=build\check.log
echo === flutter --version > %LOG%
call flutter --version >> %LOG% 2>&1
if not exist env\dev.json copy env\dev.example.json env\dev.json >nul
echo === flutter pub get >> %LOG%
call flutter pub get >> %LOG% 2>&1
echo === exit %ERRORLEVEL% >> %LOG%
echo === flutter gen-l10n >> %LOG%
call flutter gen-l10n >> %LOG% 2>&1
echo === exit %ERRORLEVEL% >> %LOG%
echo === build_runner >> %LOG%
call dart run build_runner build >> %LOG% 2>&1
echo === exit %ERRORLEVEL% >> %LOG%
echo === flutter analyze >> %LOG%
call flutter analyze --no-fatal-infos >> %LOG% 2>&1
echo === exit %ERRORLEVEL% >> %LOG%
echo === flutter test >> %LOG%
call flutter test >> %LOG% 2>&1
echo === exit %ERRORLEVEL% >> %LOG%
if /i "%1"=="apk" (
  echo === flutter build apk >> %LOG%
  call flutter build apk --debug --flavor dev -t lib/main_dev.dart --dart-define-from-file=env/dev.json >> %LOG% 2>&1
  echo === exit %ERRORLEVEL% >> %LOG%
)
echo === DONE >> %LOG%
endlocal
