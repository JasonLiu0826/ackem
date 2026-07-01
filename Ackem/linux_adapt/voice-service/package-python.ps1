<#
.SYNOPSIS
    Package embedded Python + voice dependencies for Ackem distribution.

.DESCRIPTION
    Downloads Windows embedded Python, installs faster-whisper + edge-tts + dependencies,
    and creates a self-contained voice-service directory that can be bundled with Ackem.

    Output: voice-service/python-embedded/ with everything needed to run the voice service.

.PARAMETER PythonVersion
    Python version to use (default: 3.11.9)

.PARAMETER SkipDownload
    Skip Python download if already present
#>

param(
    [string]$PythonVersion = "3.11.9",
    [switch]$SkipDownload
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EmbeddedDir = Join-Path $ScriptDir "python-embedded"
$ModelsDir = Join-Path $ScriptDir "models"

Write-Host "=== Ackem Voice Service Packager ===" -ForegroundColor Cyan
Write-Host "Python: $PythonVersion"
Write-Host "Output: $EmbeddedDir"
Write-Host ""

# --- Step 1: Download embedded Python ---
$PythonZip = "python-$PythonVersion-embed-amd64.zip"
$PythonUrl = "https://www.python.org/ftp/python/$PythonVersion/$PythonZip"
$PythonZipPath = Join-Path $ScriptDir $PythonZip

if (-not $SkipDownload -or -not (Test-Path $EmbeddedDir)) {
    Write-Host "[1/5] Downloading embedded Python $PythonVersion..." -ForegroundColor Yellow
    if (-not (Test-Path $PythonZipPath)) {
        Invoke-WebRequest -Uri $PythonUrl -OutFile $PythonZipPath -UseBasicParsing
        Write-Host "  Downloaded: $PythonZipPath ($((Get-Item $PythonZipPath).Length / 1MB)MB)" -ForegroundColor Green
    } else {
        Write-Host "  Already downloaded: $PythonZipPath" -ForegroundColor Gray
    }

    # Extract
    Write-Host "[2/5] Extracting..." -ForegroundColor Yellow
    if (Test-Path $EmbeddedDir) { Remove-Item -Recurse -Force $EmbeddedDir }
    Expand-Archive -Path $PythonZipPath -DestinationPath $EmbeddedDir
    Write-Host "  Extracted to: $EmbeddedDir" -ForegroundColor Green
} else {
    Write-Host "[1-2/5] Skipping download (already exists)" -ForegroundColor Gray
}

# --- Step 2: Enable pip in embedded Python ---
Write-Host "[3/5] Enabling pip..." -ForegroundColor Yellow

# Remove the "import site" disable line from python311._pth
$PthFile = Get-ChildItem -Path $EmbeddedDir -Filter "python*._pth" | Select-Object -First 1
if ($PthFile) {
    $content = Get-Content $PthFile.FullName -Raw
    $content = $content -replace "#import site", "import site"
    Set-Content -Path $PthFile.FullName -Value $content
    Write-Host "  Enabled site packages in: $($PthFile.Name)" -ForegroundColor Green
}

# Download get-pip.py
$GetPipPath = Join-Path $EmbeddedDir "get-pip.py"
if (-not (Test-Path $GetPipPath)) {
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $GetPipPath -UseBasicParsing
}

# Install pip
$PythonExe = Join-Path $EmbeddedDir "python.exe"
& $PythonExe $GetPipPath --no-warn-script-location 2>&1 | Out-Null
Write-Host "  pip installed" -ForegroundColor Green

# --- Step 3: Install dependencies ---
Write-Host "[4/5] Installing voice dependencies..." -ForegroundColor Yellow

$Packages = @(
    "fastapi>=0.110.0",
    "uvicorn>=0.29.0",
    "faster-whisper>=1.0.0",
    "edge-tts>=6.1.0",
    "numpy>=1.24.0",
    "soundfile>=0.12.0",
    "pydantic>=2.0.0"
)

foreach ($pkg in $Packages) {
    Write-Host "  Installing: $pkg" -ForegroundColor Gray
    & $PythonExe -m pip install $pkg --no-warn-script-location --quiet 2>&1 | Out-Null
}
Write-Host "  All dependencies installed" -ForegroundColor Green

# --- Step 4: Pre-download faster-whisper base model ---
Write-Host "[5/5] Pre-downloading ASR model (base)..." -ForegroundColor Yellow
& $PythonExe -c "
from faster_whisper import WhisperModel
model = WhisperModel('base', device='cpu', compute_type='int8')
print('Model downloaded OK')
" 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host "  ASR model cached" -ForegroundColor Green

# --- Cleanup ---
Remove-Item -Force $PythonZipPath -ErrorAction SilentlyContinue
Remove-Item -Force $GetPipPath -ErrorAction SilentlyContinue

# --- Summary ---
$TotalSize = (Get-ChildItem -Recurse $EmbeddedDir | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Embedded Python: $EmbeddedDir"
Write-Host "Total size: $([math]::Round($TotalSize, 0))MB"
Write-Host ""
Write-Host "To run the voice service:" -ForegroundColor Yellow
Write-Host "  $EmbeddedDir\python.exe server.py --port 8765"
