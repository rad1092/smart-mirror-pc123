@echo off
setlocal

cd /d "%~dp0"

echo == PC1 Smart Mirror installer build ==
echo.

set "INSTALLER_NAME=SmartMirror-PC1-Setup.exe"
set "BUNDLE_DIR=%~dp0src-tauri\target\release\bundle\nsis"
set "INSTALLER_PATH=%~dp0%INSTALLER_NAME%"

if not exist "%~dp0node_modules\" (
  echo node_modules not found. Running npm ci...
  call npm ci
  if errorlevel 1 goto failed
)

if exist "%~dp0.env" (
  for /f "usebackq tokens=* delims=" %%A in (`findstr /b "VITE_PC3_URL=" "%~dp0.env"`) do echo Using %%A
)

echo Building Tauri NSIS installer...
call npm run tauri -- build
if errorlevel 1 goto failed

if not exist "%BUNDLE_DIR%\" (
  echo No bundle directory found:
  echo %BUNDLE_DIR%
  goto failed
)

for /f "delims=" %%F in ('dir /b /a:-d /o:-d "%BUNDLE_DIR%\*.exe" 2^>nul') do (
  if not defined BUILT_INSTALLER set "BUILT_INSTALLER=%BUNDLE_DIR%\%%F"
)

if not defined BUILT_INSTALLER (
  echo No NSIS installer exe was found under:
  echo %BUNDLE_DIR%
  goto failed
)

copy /y "%BUILT_INSTALLER%" "%INSTALLER_PATH%" >nul
if errorlevel 1 goto failed

set "BUILD_EXIT=0"
goto finished

:failed
set "BUILD_EXIT=1"

:finished
echo.
if not "%BUILD_EXIT%"=="0" (
  echo Build failed with exit code %BUILD_EXIT%.
) else (
  echo Build finished.
  echo Installer should be next to this file:
  echo %INSTALLER_PATH%
)

echo.
pause
exit /b %BUILD_EXIT%
