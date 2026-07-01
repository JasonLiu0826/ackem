@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "%~dp0Ackem.exe" (
  echo [Ackem] 未找到 Ackem.exe，请完整解压发行文件夹后再运行。
  pause
  exit /b 1
)
start "" "%~dp0Ackem.exe"
