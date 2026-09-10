@echo off
title Betolla ERP - Local Data Center Server
color 0A

echo ===================================================================
echo               BETOLLA COSMETICS - ERP LOCAL SERVER
echo ===================================================================
echo.
echo [*] System: Betolla ERP Enterprise Data Center
echo [*] Mode: Production Server (Turbopack Optimized)
echo [*] Working Hours: Sun-Wed 9:30-16:30, Thu 9:30-15:00
echo.
echo [*] Access URLs:
echo     - On This Machine:     http://localhost:3000
echo     - Inside Office Wi-Fi: http://192.168.1.109:3000
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

:loop
echo [INFO] Starting Betolla ERP Production Server on 0.0.0.0:3000...
echo.
call npm run start
echo.
echo [WARNING] Server stopped. Restarting in 5 seconds...
timeout /t 5 >nul
goto loop
