$ErrorActionPreference = "Stop"

$toolsDir = "C:\Users\QX\android-tools"
$downloads = "$toolsDir\downloads"
$jdkDir = "$toolsDir\jdk-17"
$androidSdk = "$toolsDir\android-sdk"
$gradleDir = "$toolsDir\gradle"

function Download-File([string]$url, [string]$outPath) {
    if (Test-Path $outPath) {
        $size = (Get-Item $outPath).Length
        if ($size -gt 1000000) {
            Write-Host "File $outPath already exists ($size bytes), skipping download."
            return
        }
    }
    Write-Host "Downloading $url -> $outPath ..."
    curl.exe -L --fail -o "$outPath.tmp" "$url"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to download $url"
    }
    Move-Item -Force "$outPath.tmp" "$outPath"
    Write-Host "Downloaded $(Get-Item $outPath | Select-Object -ExpandProperty Length) bytes."
}

# 1. Download JDK 17
$jdkZip = "$downloads\jdk17.zip"
Download-File "https://aka.ms/download-jdk/microsoft-jdk-17.0.12-windows-x64.zip" $jdkZip

# 2. Download Commandline tools
$cmdlineZip = "$downloads\cmdline-tools.zip"
Download-File "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" $cmdlineZip

# 3. Download Gradle 8.7
$gradleZip = "$downloads\gradle.zip"
Download-File "https://services.gradle.org/distributions/gradle-8.7-bin.zip" $gradleZip

# 4. Extract JDK 17
if (-not (Test-Path "$jdkDir\bin\javac.exe")) {
    Write-Host "Extracting JDK 17..."
    C:\Windows\System32\tar.exe -xf $jdkZip -C $jdkDir --strip-components=1
    Write-Host "JDK 17 extracted."
} else {
    Write-Host "JDK 17 already extracted."
}

# 5. Extract Commandline Tools
$cmdlineLatest = "$androidSdk\cmdline-tools\latest"
if (-not (Test-Path "$cmdlineLatest\bin\sdkmanager.bat")) {
    Write-Host "Extracting Android Commandline Tools..."
    New-Item -ItemType Directory -Force -Path $cmdlineLatest | Out-Null
    C:\Windows\System32\tar.exe -xf $cmdlineZip -C $cmdlineLatest --strip-components=1
    Write-Host "Android Commandline Tools extracted."
} else {
    Write-Host "Android Commandline Tools already extracted."
}

# 6. Extract Gradle 8.7
if (-not (Test-Path "$gradleDir\bin\gradle.bat")) {
    Write-Host "Extracting Gradle..."
    C:\Windows\System32\tar.exe -xf $gradleZip -C $gradleDir --strip-components=1
    Write-Host "Gradle extracted."
} else {
    Write-Host "Gradle already extracted."
}

Write-Host "Tools setup complete!"
