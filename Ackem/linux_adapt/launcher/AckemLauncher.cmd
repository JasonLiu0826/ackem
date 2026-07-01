@echo off
setlocal
set "DIR=%~dp0"
if "%~1"=="" (
  start "" "%DIR%Ackem.exe"
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%AckemLauncher.ps1" %*
exit /b %ERRORLEVEL%
