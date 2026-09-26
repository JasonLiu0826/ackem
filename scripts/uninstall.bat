@echo off
chcp 65001 >nul
setlocal EnableExtensions

REM Britney 卸载助手 — 可从程序目录双击，或由 Britney 设置内触发
set "APP_DIR=%~dp0"
if /I "%~dp0"=="%ProgramFiles%\Britney\" set "APP_DIR=%~dp0"
if exist "%~dp0..\Britney.exe" set "APP_DIR=%~dp0..\"

set "DELETE_DATA=0"
set "REMOVE_APP=0"
if /I "%~1"=="/DATA" set "DELETE_DATA=1"
if /I "%~2"=="/REMOVE_APP" set "REMOVE_APP=1"
if /I "%~1"=="/REMOVE_APP" set "REMOVE_APP=1"

echo.
echo [Britney] 正在关闭 Britney 及后台进程...
taskkill /F /IM Britney.exe >nul 2>&1
timeout /t 2 /nobreak >nul

if exist "%USERPROFILE%\Desktop\Britney.lnk" (
  del /F /Q "%USERPROFILE%\Desktop\Britney.lnk"
  echo 已移除桌面快捷方式。
)

if "%DELETE_DATA%"=="1" (
  if exist "%APP_DIR%data\" (
    echo 正在删除本地数据目录...
    rd /s /q "%APP_DIR%data"
    echo 数据目录已删除。
  )
)

if exist "%APP_DIR%Uninstall Britney.exe" (
  echo 正在运行安装版卸载程序...
  start /wait "" "%APP_DIR%Uninstall Britney.exe" /S
  goto :done
)

if "%REMOVE_APP%"=="1" (
  echo 正在安排删除程序文件...
  set "SELF=%~f0"
  (
    echo @echo off
    echo ping 127.0.0.1 -n 3 ^>nul
    echo rd /s /q "%APP_DIR%"
    echo del /F /Q "%%~f0"
  ) > "%TEMP%\britney-uninstall-cleanup.cmd"
  start "" /min cmd /c "%TEMP%\britney-uninstall-cleanup.cmd"
  goto :done
)

:done
echo.
echo Britney 卸载流程已启动。
timeout /t 3 /nobreak >nul
endlocal
