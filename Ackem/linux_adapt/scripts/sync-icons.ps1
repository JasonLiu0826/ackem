# 从仓库根目录 ico/ 同步到 Ackem/build 与 Ackem/resources
# 源文件扩展名为 .ico，实际为 PNG；同步时写入 .png 供 Electron / electron-builder 使用
$ackem = Split-Path $PSScriptRoot -Parent
$root = Split-Path $ackem -Parent
$ico = Join-Path $root 'ico'

$src256 = Join-Path $ico '256x256.ico'
$src32 = Join-Path $ico '32x32.ico'
if (-not (Test-Path $src256)) {
  Write-Error "Missing $src256"
  exit 1
}

New-Item -ItemType Directory -Force -Path (Join-Path $ackem 'build'), (Join-Path $ackem 'resources') | Out-Null

Copy-Item $src256 (Join-Path $ackem 'build\icon.png') -Force
Copy-Item $src256 (Join-Path $ackem 'resources\icon.png') -Force
if (Test-Path $src32) {
  Copy-Item $src32 (Join-Path $ackem 'resources\tray.png') -Force
} else {
  Copy-Item $src256 (Join-Path $ackem 'resources\tray.png') -Force
}

Write-Host "Icons synced as PNG -> Ackem/build/icon.png, Ackem/resources/{icon,tray}.png"
