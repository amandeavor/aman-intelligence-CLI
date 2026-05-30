Add-Type -AssemblyName System.Drawing

$imagePath = "C:\Users\Admin\Desktop\aman-intelligence\images\ai-cli.png"
$outputPath = "C:\Users\Admin\Desktop\aman-intelligence\images\ai-cli.png"

if (!(Test-Path $imagePath)) {
    Write-Error "Original image not found at $imagePath"
    exit 1
}

Write-Host "Loading original image..."
$src = [System.Drawing.Image]::FromFile($imagePath)
$width = $src.Width
$height = $src.Height
Write-Host "Dimensions: $width x $height"

Write-Host "Creating rounded canvas..."
$dest = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($dest)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# We use a premium 40px corner radius
$radius = 40
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $radius, $radius, 180, 90)
$path.AddArc(($width - $radius), 0, $radius, $radius, 270, 90)
$path.AddArc(($width - $radius), ($height - $radius), $radius, $radius, 0, 90)
$path.AddArc(0, ($height - $radius), $radius, $radius, 90, 90)
$path.CloseAllFigures()

$g.SetClip($path)
$g.DrawImage($src, 0, 0, $width, $height)

# Release the source file lock before writing
$src.Dispose()
$g.Dispose()

Write-Host "Saving rounded image..."
$dest.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$dest.Dispose()

Write-Host "Image rounded successfully with a premium 40px radius!"
