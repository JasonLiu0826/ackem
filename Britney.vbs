' Britney Launcher - Robust VBScript wrapper
' Fixes: encoding issues, port conflicts, hidden console

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

britneyDir = "C:\Users\Administrator\.openclaw\workspace\britney"
nodeExe = "C:\Program Files\QClaw\v0.2.32.610\resources\node\node.exe"
electronVite = britneyDir & "\node_modules\electron-vite\bin\electron-vite.js"

' Kill any existing Britney/Electron processes to free port 5173
On Error Resume Next
WshShell.Run "cmd /c taskkill /f /im electron.exe >nul 2>&1", 0, True
WScript.Sleep 1000
On Error GoTo 0

' Set environment
WshShell.Environment("Process")("NODE_OPTIONS") = "--max-old-space-size=8192"

' Run directly: node.exe electron-vite.js dev
' WindowStyle 0 = hidden, False = don't wait
WshShell.Run """" & nodeExe & """ """ & electronVite & """ dev", 0, False
