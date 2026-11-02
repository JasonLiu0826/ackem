# Upload macOS community v3 DMG assets to official Ackem v1.0.0 Release.
# Requires: gh auth login (run once: gh auth login -h github.com -p https -w)

$ErrorActionPreference = 'Stop'
$env:PATH = "C:\Program Files\GitHub CLI;$env:PATH"

$Repo = 'JasonLiu0826/ackem'
$Tag = 'v1.0.0'
$Staging = Join-Path $env:TEMP 'ackem-mac-release-upload'
New-Item -ItemType Directory -Force -Path $Staging | Out-Null

$Assets = @(
  @{
    Name = 'Ackem-1.0.0-mac-arm64.dmg'
    Url  = 'https://github.com/deufe/ackem/releases/download/v1.0.0-mac-community-v3/Ackem-1.0.0-mac-arm64.dmg'
    Sha256 = '22eed4c0f9cf5e2cf9b4817ca0314f6eda752d9e6cbe5e20b5b9a82c1841ef9c'
  },
  @{
    Name = 'Ackem-1.0.0-mac-x64.dmg'
    Url  = 'https://github.com/deufe/ackem/releases/download/v1.0.0-mac-community-v3/Ackem-1.0.0-mac-x64.dmg'
    Sha256 = 'bbfd90fb7b16db74ab3f18cc9848945af4996fafe89732d08db5cf45aedf8f93'
  }
)

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Not logged in. Run: gh auth login -h github.com -p https -w'
  exit 1
}

foreach ($a in $Assets) {
  $dest = Join-Path $Staging $a.Name
  if (-not (Test-Path $dest)) {
    Write-Host "Downloading $($a.Name) ..."
    curl.exe -L --retry 3 --retry-delay 5 -o $dest $a.Url
  }
  $hash = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
  if ($hash -ne $a.Sha256) {
    throw "SHA256 mismatch for $($a.Name): got $hash"
  }
  Write-Host "OK $($a.Name) ($([math]::Round((Get-Item $dest).Length/1MB)) MB)"
}

$BodyFile = Join-Path $PSScriptRoot '..\docs\旧文档\公开文档\docs\releases\v1.0.0-release-body-full.md'
$BodyFile = (Resolve-Path $BodyFile).Path

# Point macOS links at official release after upload
$body = Get-Content $BodyFile -Raw -Encoding UTF8
$body = $body -replace '\A> 历史归档[^\r\n]*\r?\n\r?\n', ''
$body = $body -replace 'https://github.com/deufe/ackem/releases/download/v1.0.0-mac-community-v3/Ackem-1.0.0-mac-arm64.dmg', "https://github.com/JasonLiu0826/ackem/releases/download/$Tag/Ackem-1.0.0-mac-arm64.dmg"
$body = $body -replace 'https://github.com/deufe/ackem/releases/download/v1.0.0-mac-community-v3/Ackem-1.0.0-mac-x64.dmg', "https://github.com/JasonLiu0826/ackem/releases/download/$Tag/Ackem-1.0.0-mac-x64.dmg"
$tmpBody = Join-Path $Staging 'release-body.md'
Set-Content -Path $tmpBody -Value $body -Encoding UTF8 -NoNewline

Write-Host 'Updating release notes...'
gh release edit $Tag --repo $Repo --notes-file $tmpBody

Write-Host 'Uploading DMG assets (may take several minutes)...'
$paths = $Assets | ForEach-Object { Join-Path $Staging $_.Name }
gh release upload $Tag --repo $Repo --clobber @paths

Write-Host "Done. https://github.com/$Repo/releases/tag/$Tag"
