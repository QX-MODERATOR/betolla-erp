Add-Type -AssemblyName System.Drawing

function Test-Img([string]$path) {
    if (Test-Path $path) {
        $img = [System.Drawing.Image]::FromFile($path)
        $len = (Get-Item $path).Length
        Write-Host "$path -> Width=$($img.Width), Height=$($img.Height), Size=$len bytes"
        $img.Dispose()
    } else {
        Write-Host "Not found: $path"
    }
}

Test-Img "c:\Users\QX\Desktop\Betolla System\betolla-erp\public\brand\betolla-logo-clean.png"
Test-Img "c:\Users\QX\Desktop\Betolla System\betolla-erp\public\brand\icon.png"
