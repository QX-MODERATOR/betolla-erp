Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Bitmap]::FromFile("c:\Users\QX\Desktop\Betolla System\betolla-erp\public\brand\icon.png")
$corner = $img.GetPixel(0, 0)
$center = $img.GetPixel([int]($img.Width / 2), [int]($img.Height / 2))
Write-Host "Corner Pixel: A=$($corner.A), R=$($corner.R), G=$($corner.G), B=$($corner.B)"
Write-Host "Center Pixel: A=$($center.A), R=$($center.R), G=$($center.G), B=$($center.B)"
$img.Dispose()
