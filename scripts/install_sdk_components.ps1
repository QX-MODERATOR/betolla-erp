$ErrorActionPreference = "Stop"

$toolsDir = "C:\Users\QX\android-tools"
$env:JAVA_HOME = "$toolsDir\jdk-17"
$androidSdk = "$toolsDir\android-sdk"
$sdkManager = "$androidSdk\cmdline-tools\latest\bin\sdkmanager.bat"

Write-Host "Accepting Android SDK licenses..."
$yesList = ("y`n" * 20)
$yesList | & $sdkManager --sdk_root="$androidSdk" --licenses

Write-Host "Installing platform-tools, platforms;android-34, build-tools;34.0.0..."
& $sdkManager --sdk_root="$androidSdk" "platform-tools" "platforms;android-34" "build-tools;34.0.0"

Write-Host "Android SDK components installed successfully!"
