Add-Type -AssemblyName System.Drawing

$srcPath = "c:\Users\QX\Desktop\Betolla System\betolla-erp\public\brand\icon.png"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source icon not found: $srcPath"
    exit 1
}

$resDir = "c:\Users\QX\Desktop\Betolla System\betolla-erp\android\app\src\main\res"
$sourceBmp = [System.Drawing.Bitmap]::FromFile($srcPath)

$densities = @(
    @{ Name = "mipmap-mdpi"; Size = 48 },
    @{ Name = "mipmap-hdpi"; Size = 72 },
    @{ Name = "mipmap-xhdpi"; Size = 96 },
    @{ Name = "mipmap-xxhdpi"; Size = 144 },
    @{ Name = "mipmap-xxxhdpi"; Size = 192 }
)

foreach ($d in $densities) {
    $dirPath = Join-Path $resDir $d.Name
    if (-not (Test-Path $dirPath)) {
        New-Item -ItemType Directory -Force -Path $dirPath | Out-Null
    }

    $size = $d.Size
    
    # 1. Standard square launcher icon with rounded squircle / smooth corners
    $targetBmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($targetBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    
    # Draw image
    $g.DrawImage($sourceBmp, 0, 0, $size, $size)
    $g.Dispose()
    
    $squarePath = Join-Path $dirPath "ic_launcher.png"
    $targetBmp.Save($squarePath, [System.Drawing.Imaging.ImageFormat]::Png)
    $targetBmp.Dispose()

    # 2. Round launcher icon
    $roundBmp = New-Object System.Drawing.Bitmap($size, $size)
    $gRound = [System.Drawing.Graphics]::FromImage($roundBmp)
    $gRound.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gRound.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gRound.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gRound.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $gRound.Clear([System.Drawing.Color]::Transparent)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $size, $size)
    $gRound.SetClip($path)
    $gRound.DrawImage($sourceBmp, 0, 0, $size, $size)
    $path.Dispose()
    $gRound.Dispose()

    $roundPath = Join-Path $dirPath "ic_launcher_round.png"
    $roundBmp.Save($roundPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $roundBmp.Dispose()

    Write-Host "Generated $($d.Name): $size x $size (ic_launcher.png & ic_launcher_round.png)"
}

# 3. Generate adaptive foreground icon (432x432 with safe-zone margin: icon centered at 288x288)
$fgSize = 432
$fgInnerSize = 288
$offset = [int](($fgSize - $fgInnerSize) / 2)

$fgBmp = New-Object System.Drawing.Bitmap($fgSize, $fgSize)
$gFg = [System.Drawing.Graphics]::FromImage($fgBmp)
$gFg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gFg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gFg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gFg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$gFg.Clear([System.Drawing.Color]::Transparent)

# Draw icon centered in the safe zone
$gFg.DrawImage($sourceBmp, $offset, $offset, $fgInnerSize, $fgInnerSize)
$gFg.Dispose()

$drawableDir = Join-Path $resDir "drawable"
if (-not (Test-Path $drawableDir)) {
    New-Item -ItemType Directory -Force -Path $drawableDir | Out-Null
}
$fgPath = Join-Path $drawableDir "ic_launcher_foreground.png"
$fgBmp.Save($fgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$fgBmp.Dispose()
Write-Host "Generated adaptive foreground: $fgPath ($fgSize x $fgSize)"

# 4. Generate Web App icons (public/icon.png, app/icon.png, etc.)
$webIcon192 = New-Object System.Drawing.Bitmap(192, 192)
$gWeb = [System.Drawing.Graphics]::FromImage($webIcon192)
$gWeb.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gWeb.DrawImage($sourceBmp, 0, 0, 192, 192)
$gWeb.Dispose()
$webIcon192.Save("c:\Users\QX\Desktop\Betolla System\betolla-erp\public\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$webIcon192.Save("c:\Users\QX\Desktop\Betolla System\betolla-erp\app\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$webIcon192.Dispose()

$sourceBmp.Dispose()
Write-Host "All icons generated successfully!"
