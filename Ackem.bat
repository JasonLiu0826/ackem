@echo off
cd /d "C:\Users\Administrator\.openclaw\workspace\britney"
set "NODE_OPTIONS=--max-old-space-size=8192"
"C:\Program Files\QClaw\v0.2.32.610\resources\node\node.exe" "C:\Users\Administrator\.openclaw\workspace\britney\node_modules\electron-vite\bin\electron-vite.js" dev
