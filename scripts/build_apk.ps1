$ErrorActionPreference = "Stop"

$jdk = "C:\Users\QX\android-tools\jdk-17"
$sdk = "C:\Users\QX\android-tools\android-sdk"

if (-not (Test-Path "$jdk\bin\javac.exe")) {
    throw "JDK not found at $jdk"
}
if (-not (Test-Path "$sdk\platform-tools")) {
    throw "Android SDK not found at $sdk"
}

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
$env:Path = "$jdk\bin;$sdk\platform-tools;$env:Path"

Write-Host "JAVA_HOME = $env:JAVA_HOME"
Write-Host "ANDROID_HOME = $env:ANDROID_HOME"

Set-Location "c:\Users\QX\Desktop\Betolla System\betolla-erp\android"

Write-Host "Running gradlew.bat assembleRelease..."
& ".\gradlew.bat" assembleRelease --no-daemon --stacktrace

if ($LASTEXITCODE -ne 0) {
    throw "Gradle build failed with exit code $LASTEXITCODE"
}

$apkSource = "c:\Users\QX\Desktop\Betolla System\betolla-erp\android\app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apkSource) {
    $apkDest = "c:\Users\QX\Desktop\Betolla System\Betolla-ERP.apk"
    Copy-Item -Force $apkSource $apkDest
    $item = Get-Item $apkDest
    Write-Host "SUCCESS: Copied $apkSource to $apkDest"
    Write-Host "APK Size: $($item.Length) bytes, LastWriteTime: $($item.LastWriteTime)"
} else {
    throw "Built APK not found at $apkSource"
}
