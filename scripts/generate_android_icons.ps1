Add-Type -AssemblyName System.Drawing

$sourcePath = "e:\scaroerp\scaro\scaro\public\assets\scaro-logo.png"
$src = [System.Drawing.Image]::FromFile($sourcePath)

$mipmapSizes = @{
    "mdpi" = 48
    "hdpi" = 72
    "xhdpi" = 96
    "xxhdpi" = 144
    "xxxhdpi" = 192
}

$foregroundSizes = @{
    "mdpi" = 108
    "hdpi" = 162
    "xhdpi" = 216
    "xxhdpi" = 324
    "xxxhdpi" = 432
}

function Resize-Image($srcImage, $targetWidth, $targetHeight, $destPath, $bgHex) {
    $bmp = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($bgHex) {
        $color = [System.Drawing.ColorTranslator]::FromHtml($bgHex)
        $brush = New-Object System.Drawing.SolidBrush($color)
        $g.FillRectangle($brush, 0, 0, $targetWidth, $targetHeight)
        $brush.Dispose()
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }

    # Maintain aspect ratio centered
    $srcRatio = $srcImage.Width / $srcImage.Height
    $targetRatio = $targetWidth / $targetHeight

    if ($srcRatio -gt $targetRatio) {
        $w = $targetWidth
        $h = [int]($targetWidth / $srcRatio)
        $x = 0
        $y = [int](($targetHeight - $h) / 2)
    } else {
        $h = $targetHeight
        $w = [int]($targetHeight * $srcRatio)
        $x = [int](($targetWidth - $w) / 2)
        $y = 0
    }

    $g.DrawImage($srcImage, $x, $y, $w, $h)
    $g.Dispose()

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$resBase = "e:\scaroerp\scaro\scaro\android\app\src\main\res"

# Generate launcher icons
foreach ($density in $mipmapSizes.Keys) {
    $size = $mipmapSizes[$density]
    $dir = "$resBase\mipmap-$density"
    if (Test-Path $dir) {
        Resize-Image $src $size $size "$dir\ic_launcher.png" $null
        Resize-Image $src $size $size "$dir\ic_launcher_round.png" $null
        Write-Host "Generated $dir\ic_launcher.png ($size x $size)"
    }
}

# Generate foreground icons (with transparent padding for adaptive icon safe zone)
foreach ($density in $foregroundSizes.Keys) {
    $size = $foregroundSizes[$density]
    $dir = "$resBase\mipmap-$density"
    if (Test-Path $dir) {
        # Safe zone for adaptive icon foreground is inner 66%
        $innerSize = [int]($size * 0.72)
        $bmp = New-Object System.Drawing.Bitmap($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)

        $offset = [int](($size - $innerSize) / 2)
        $g.DrawImage($src, $offset, $offset, $innerSize, $innerSize)
        $g.Dispose()

        $bmp.Save("$dir\ic_launcher_foreground.png", [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Host "Generated $dir\ic_launcher_foreground.png ($size x $size)"
    }
}

# Generate splash screens (with #0f172a background matching SCARO branding)
$splashConfigs = @{
    "drawable" = @{ w = 480; h = 800 }
    "drawable-port-mdpi" = @{ w = 320; h = 480 }
    "drawable-port-hdpi" = @{ w = 480; h = 800 }
    "drawable-port-xhdpi" = @{ w = 720; h = 1280 }
    "drawable-port-xxhdpi" = @{ w = 960; h = 1600 }
    "drawable-port-xxxhdpi" = @{ w = 1280; h = 1920 }
    "drawable-land-mdpi" = @{ w = 480; h = 320 }
    "drawable-land-hdpi" = @{ w = 800; h = 480 }
    "drawable-land-xhdpi" = @{ w = 1280; h = 720 }
    "drawable-land-xxhdpi" = @{ w = 1600; h = 960 }
    "drawable-land-xxxhdpi" = @{ w = 1920; h = 1280 }
}

foreach ($folder in $splashConfigs.Keys) {
    $conf = $splashConfigs[$folder]
    $dir = "$resBase\$folder"
    if (Test-Path $dir) {
        # Logo should take ~40% of the smallest dimension
        $logoDim = [int]([Math]::Min($conf.w, $conf.h) * 0.45)
        $bmp = New-Object System.Drawing.Bitmap($conf.w, $conf.h)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#0f172a"))
        $g.FillRectangle($bgBrush, 0, 0, $conf.w, $conf.h)
        $bgBrush.Dispose()

        $logoX = [int](($conf.w - $logoDim) / 2)
        $logoY = [int](($conf.h - $logoDim) / 2)
        $g.DrawImage($src, $logoX, $logoY, $logoDim, $logoDim)
        $g.Dispose()

        $bmp.Save("$dir\splash.png", [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Host "Generated $dir\splash.png ($($conf.w) x $($conf.h))"
    }
}

$src.Dispose()
Write-Host "Android icons and splash screens generated successfully!"
