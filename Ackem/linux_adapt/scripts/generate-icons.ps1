# Generate Ackem/build and resources PNG + multi-size ICO
param(
  [string]$Logo = ""
)

$ackem = Split-Path $PSScriptRoot -Parent
if (-not $Logo) {
  $Logo = Join-Path (Split-Path $ackem -Parent) ([char]0x56fe + [char]0x7247 + ".jpg")
}
$build = Join-Path $ackem 'build'
$res = Join-Path $ackem 'resources'

if (-not (Test-Path $Logo)) {
  Write-Error "Missing logo: $Logo"
  exit 1
}

New-Item -ItemType Directory -Force -Path $build, $res | Out-Null
Add-Type -AssemblyName System.Drawing

function New-ResizedBitmap([System.Drawing.Image]$src, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  return $bmp
}

function Save-Png([string]$path, [int]$w, [int]$h) {
  $src = [System.Drawing.Image]::FromFile($Logo)
  $bmp = New-ResizedBitmap $src $w
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $src.Dispose()
}

function Save-MultiSizeIco([string]$path, [int[]]$sizes) {
  $src = [System.Drawing.Image]::FromFile($Logo)
  $entries = @()

  foreach ($size in ($sizes | Sort-Object -Descending)) {
    $bmp = New-ResizedBitmap $src $size
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $entries += [PSCustomObject]@{
      Width  = $size
      Height = $size
      Bytes  = $ms.ToArray()
    }
    $ms.Dispose()
    $bmp.Dispose()
  }
  $src.Dispose()

  $count = $entries.Count
  $offset = 6 + ($count * 16)
  $fs = [System.IO.File]::Create($path)
  $bw = New-Object System.IO.BinaryWriter($fs)

  $bw.Write([uint16]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]$count)

  foreach ($e in $entries) {
    $wByte = if ($e.Width -ge 256) { [byte]0 } else { [byte]$e.Width }
    $hByte = if ($e.Height -ge 256) { [byte]0 } else { [byte]$e.Height }
    $bw.Write($wByte)
    $bw.Write($hByte)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$e.Bytes.Length)
    $bw.Write([uint32]$offset)
    $offset += $e.Bytes.Length
  }

  foreach ($e in $entries) {
    $bw.Write($e.Bytes)
  }

  $bw.Close()
  $fs.Close()
}

$iconSizes = @(16, 24, 32, 48, 64, 128, 256, 512)

Save-Png (Join-Path $build 'icon.png') 512 512
Save-Png (Join-Path $res 'icon.png') 512 512
Save-Png (Join-Path $res 'tray.png') 64 64
Save-MultiSizeIco (Join-Path $build 'icon.ico') $iconSizes
Save-MultiSizeIco (Join-Path $res 'icon.ico') $iconSizes
Write-Host 'Generated HD icons (512 PNG + multi-size ICO)'
