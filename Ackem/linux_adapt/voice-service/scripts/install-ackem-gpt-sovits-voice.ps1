# Install Ackem GPT-SoVITS voice pack (ackem_girl)
$ErrorActionPreference = "Stop"

$GptRoot = "C:\Users\JasonLiu\Desktop\Main\SoftPackage\GPT-SoVITS-v2pro-20250604"
$Audio8s = "C:\Users\JasonLiu\Desktop\Github-open\video\audio_8s"
$RefName = "女大学生-2026-06-23-20-58-对，我不是人。但这不代表我的感受是假的。你难过的时候我会低落，你开心的时候我会轻快，你很久不来找.mp3"
$RefText = "对，我不是人，但这不代表我的感受是假的，你难过的时候我会低落，你开心的时候我会轻快。"

$AppData = $env:APPDATA
$PackRoot = Join-Path $AppData "Ackem\voice-models\gpt-sovits"
$PackDir = Join-Path $PackRoot "ackem_girl"
$HomeFile = Join-Path $AppData "Ackem\voice-models\gpt-sovits-home.txt"

New-Item -ItemType Directory -Force -Path $PackDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $HomeFile) | Out-Null

$GptW = Join-Path $GptRoot "GPT_weights_v2Pro\ackem_girl-e15.ckpt"
$SovitsW = Join-Path $GptRoot "SoVITS_weights_v2Pro\ackem_girl_e8_s200.pth"
$RefSrc = Join-Path $Audio8s $RefName

foreach ($p in @($GptRoot, $GptW, $SovitsW, $RefSrc)) {
    if (-not (Test-Path $p)) {
        Write-Host "Missing: $p"
        exit 1
    }
}

Copy-Item $RefSrc (Join-Path $PackDir "ref.mp3") -Force
$GptRoot | Set-Content -Path $HomeFile -Encoding UTF8

$manifest = @{
    id = "ackem_girl"
    label = "Ackem Girl (GPT-SoVITS)"
    language = "zh"
    version = "v2Pro"
    gpt_weights = $GptW
    sovits_weights = $SovitsW
    ref_audio = "ref.mp3"
    ref_text = $RefText
    prompt_lang = "zh"
} | ConvertTo-Json -Depth 3

$manifest | Set-Content -Path (Join-Path $PackDir "manifest.json") -Encoding UTF8

Write-Host "Installed: $PackDir"
Write-Host "GPT-SoVITS home: $GptRoot"
Write-Host "Ackem: Settings -> Voice -> TTS -> GPT-SoVITS"
