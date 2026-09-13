@echo off
title Betolla ERP - Local Data Center Server
color 0A

:: Dynamically detect current Wi-Fi / Local IPv4 address
set "LOCAL_IP="
if exist "%~dp0scripts\get-local-ip.js" (
    for /f "tokens=*" %%i in ('node "%~dp0scripts\get-local-ip.js" 2^>nul') do set "LOCAL_IP=%%i"
)
if "%LOCAL_IP%"=="" if exist "%~dp0..\scripts\get-local-ip.js" (
    for /f "tokens=*" %%i in ('node "%~dp0..\scripts\get-local-ip.js" 2^>nul') do set "LOCAL_IP=%%i"
)
if "%LOCAL_IP%"=="" (
    for /f "tokens=*" %%i in ('node -e "const os=require('os'),nets=os.networkInterfaces();for(const n of Object.keys(nets)){if(!n.toLowerCase().includes('vethernet')&&!n.toLowerCase().includes('loopback')){for(const d of nets[n]){if((d.family==='IPv4'||d.family===4)&&!d.internal&&!d.address.startsWith('169.254')){process.stdout.write(d.address);process.exit(0);}}}}" 2^>nul') do set "LOCAL_IP=%%i"
)
if "%LOCAL_IP%"=="" set "LOCAL_IP=localhost"

echo ===================================================================
echo               BETOLLA COSMETICS - ERP LOCAL SERVER
echo ===================================================================
echo.
echo [*] System: Betolla ERP Enterprise Data Center
echo [*] Mode: Production Server (Turbopack Optimized)
echo [*] Working Hours: Sun-Wed 9:30-16:30, Thu 9:30-15:00
echo.
echo [*] Access URLs:
echo     - On This Machine:        http://localhost:3000
echo     - Inside Office Wi-Fi:    http://%LOCAL_IP%:3000
echo     - Public (4G/5G / Cloud): Running via Cloudflare Tunnel
echo.
echo [*] Connected Accounts:
echo     - Admin:          admin   / rJ/$:9fUz3^>a$z,   (Dashboard: /)
echo     - Sales (Rahma):  rahma   / rahma2026         (Dashboard: /sales)
echo     - Driver Manager: diya    / diya2026          (Dashboard: /drivers)
echo     - Driver (Khaled):khalid  / khalid2026        (Dashboard: /driver)
echo     - Driver (Ali):   ali     / ali2026           (Dashboard: /driver)
echo.
echo [*] Telegram Alerts: Connected to ID 7225499588
echo ===================================================================
echo.

cd /d "%~dp0"

if exist "..\cloudflared.exe" (
    echo [INFO] Starting Cloudflare Public Tunnel for 4G/Mobile devices...
    start /min "Cloudflare Tunnel" "..\cloudflared.exe" tunnel --url http://localhost:3000
) else if exist ".\cloudflared.exe" (
    echo [INFO] Starting Cloudflare Public Tunnel for 4G/Mobile devices...
    start /min "Cloudflare Tunnel" ".\cloudflared.exe" tunnel --url http://localhost:3000
)

:loop
echo [INFO] Starting Betolla ERP Production Server on 0.0.0.0:3000...
echo.
call npm run start
echo.
echo [WARNING] Server stopped. Restarting in 5 seconds...
timeout /t 5 >nul
goto loop
