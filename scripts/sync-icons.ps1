Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$icoPath = Join-Path $root 'icon.ico'
$publicIco = Join-Path $root 'public\icon.ico'
$iconsDir = Join-Path $root 'public\icons'
$publicRoot512 = Join-Path $root 'public\icon-512.png'

if (-not (Test-Path $icoPath)) { throw "Missing $icoPath" }
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null
Copy-Item -Force $icoPath $publicIco

$src = [System.Drawing.Image]::FromFile($icoPath)
try {
  Write-Host ("Source: {0}x{1}" -f $src.Width, $src.Height)

  function Save-Png([System.Drawing.Image]$source, [int]$size, [string]$outPath, [bool]$maskable) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(255, 15, 45, 92)) # #0f2d5c
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $pad = if ($maskable) { [int]([math]::Round($size * 0.12)) } else { 0 }
    $box = $size - (2 * $pad)
    $g.DrawImage($source, $pad, $pad, $box, $box)
    $g.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Wrote $outPath"
  }

  Save-Png $src 48 (Join-Path $iconsDir 'icon-48.png') $false
  Save-Png $src 180 (Join-Path $iconsDir 'icon-180.png') $false
  Save-Png $src 192 (Join-Path $iconsDir 'icon-192.png') $false
  Save-Png $src 512 (Join-Path $iconsDir 'icon-512.png') $false
  Save-Png $src 192 (Join-Path $iconsDir 'icon-192-maskable.png') $true
  Save-Png $src 512 (Join-Path $iconsDir 'icon-512-maskable.png') $true
  Save-Png $src 512 $publicRoot512 $false
}
finally {
  $src.Dispose()
}

Write-Host 'Icon sync complete.'
