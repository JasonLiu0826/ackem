# 一键下载中文 Piper 女声（花颜 medium）到 Ackem 音色目录
# 用法：在 PowerShell 里运行
#   cd Ackem\voice-service\scripts
#   .\download-piper-voice-zh.ps1

$ErrorActionPreference = "Stop"

$voiceId = "zh_CN-huayan-medium"
$targetDir = Join-Path $env:APPDATA "Ackem\voice-models\piper\$voiceId"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$baseUrl = "https://huggingface.co/csukuangfj/vits-piper-zh_CN-huayan-medium/resolve/main"
$files = @(
    @{ Url = "$baseUrl/model.onnx"; Out = "$voiceId.onnx" },
    @{ Url = "$baseUrl/model.onnx.json"; Out = "$voiceId.onnx.json" }
)

Write-Host "下载目录: $targetDir" -ForegroundColor Cyan
Write-Host "约 63MB，请稍候..." -ForegroundColor Yellow

foreach ($f in $files) {
    $dest = Join-Path $targetDir $f.Out
    if (Test-Path $dest) {
        Write-Host "已存在，跳过: $($f.Out)" -ForegroundColor DarkGray
        continue
    }
    Write-Host "正在下载: $($f.Out) ..."
    Invoke-WebRequest -Uri $f.Url -OutFile $dest -UseBasicParsing
}

Write-Host ""
Write-Host "完成！接下来在 Ackem 里：" -ForegroundColor Green
Write-Host "  1. 设置 -> 语音 -> TTS 引擎 选「Piper 离线」"
Write-Host "  2. 离线音色包 选 $voiceId"
Write-Host "  3. 点「重启语音服务」"
Write-Host ""
Write-Host "若还没装 Piper 依赖，在 Ackem 设置里点「一键准备语音环境」，或运行："
Write-Host "  pip install piper-tts"
