@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts/start-ackem-dev.mjs
pause
