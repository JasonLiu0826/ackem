# AckemLauncher.ps1 — 轻量启动器 / 更新器（无整份 Electron 复制）
param(
  [string]$AckemUpdater = ''
)

$ErrorActionPreference = 'Stop'
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AckemExe = Join-Path $InstallDir 'Ackem.exe'
$SevenZip = Join-Path $InstallDir 'resources\tools\7za.exe'
$MinAsar = 80000000
$MaxAsar = 500000000

function Start-Ackem {
  if (-not (Test-Path $AckemExe)) { throw "Ackem.exe not found: $AckemExe" }
  Start-Process -FilePath $AckemExe -WorkingDirectory $InstallDir
  exit 0
}

function Invoke-RobocopyInstall([string]$Source, [string]$Target) {
  & robocopy $Source $Target /E /XD data /R:2 /W:2 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
}

function Test-HealthyAsar([string]$Path) {
  if (-not (Test-Path $Path)) { throw "Missing app.asar: $Path" }
  $size = (Get-Item $Path).Length
  if ($size -lt $MinAsar -or $size -gt $MaxAsar) { throw "app.asar size out of range: $size" }
}

function Get-StagingDir([string]$ExtractDir, [string]$Version) {
  $v = $Version -replace '^v',''
  $candidates = @(
    (Join-Path $ExtractDir "Ackem-$v-win-x64"),
    $ExtractDir
  )
  Get-ChildItem $ExtractDir -Directory -ErrorAction SilentlyContinue | ForEach-Object { $candidates += $_.FullName }
  foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c 'Ackem.exe')) { return $c }
  }
  throw "Missing Ackem.exe under $ExtractDir"
}

function Save-Download([string]$Url, [string]$Dest, [long]$ExpectedSize) {
  $part = "$Dest.part"
  $start = 0L
  if (Test-Path $part) { $start = (Get-Item $part).Length }
  elseif (Test-Path $Dest) { Remove-Item $Dest -Force }

  $request = [System.Net.HttpWebRequest]::Create($Url)
  $request.UserAgent = 'Ackem-Desktop-Updater/1.0'
  if ($start -gt 0) { $request.AddRange($start) }
  $response = $request.GetResponse()
  $stream = $response.GetResponseStream()

  $dir = Split-Path $Dest -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

  $mode = if ($start -gt 0) { [IO.FileMode]::Append } else { [IO.FileMode]::Create }
  $fs = [IO.File]::Open($part, $mode, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $buffer = New-Object byte[] 32768
  try {
    while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $fs.Write($buffer, 0, $read)
    }
  } finally {
    $fs.Close()
    $stream.Close()
    $response.Close()
  }
  Move-Item -Force $part $Dest
  Write-Host "Download complete."
}

function Start-Update([string]$JobPath) {
  $JobPath = $JobPath.Trim('"')
  $job = Get-Content $JobPath -Raw | ConvertFrom-Json

  Write-Host "Ackem Update"
  Write-Host "$($job.currentVersion) -> $($job.targetVersion) ($($job.channel))"
  Write-Host ""

  Write-Host "Step 1/4 — Download"
  Save-Download -Url $job.downloadUrl -Dest $job.zipPath -ExpectedSize $job.expectedSize

  Write-Host "Step 2/4 — Verify"
  $size = (Get-Item $job.zipPath).Length
  if ($job.expectedSize -gt 0 -and $size -ne $job.expectedSize) {
    throw "Size mismatch: expected $($job.expectedSize), got $size"
  }
  if (-not (Test-Path $SevenZip)) { throw "Missing 7za.exe: $SevenZip" }
  & $SevenZip t $job.zipPath | Out-Host
  if ($LASTEXITCODE -ne 0) { throw '7za test failed' }

  Write-Host "Step 3/4 — Extract"
  if (Test-Path $job.extractDir) { Remove-Item $job.extractDir -Recurse -Force }
  New-Item -ItemType Directory -Path $job.extractDir -Force | Out-Null
  & $SevenZip x $job.zipPath "-o$($job.extractDir)" -y | Out-Host
  if ($LASTEXITCODE -ne 0) { throw '7za extract failed' }

  $staging = Get-StagingDir $job.extractDir $job.targetVersion
  Test-HealthyAsar (Join-Path $staging 'resources\app.asar')

  Write-Host "Step 4/4 — Install (data/ preserved)"
  Invoke-RobocopyInstall $staging $job.installDir
  Test-HealthyAsar (Join-Path $job.installDir 'resources\app.asar')
  if (-not (Test-Path (Join-Path $job.installDir 'Ackem.exe'))) { throw 'Ackem.exe missing after install' }

  Write-Host ""
  Write-Host "Update finished. Starting Ackem…"
  Start-Ackem
}

foreach ($arg in $args) {
  if ($arg -like '--ackem-updater=*') {
    Start-Update ($arg -replace '^--ackem-updater=','')
  }
}

if ($AckemUpdater) {
  Start-Update $AckemUpdater
}

Start-Ackem
