@echo off
chcp 65001 >nul
title Learning Manager
cd /d X:\class

echo.
echo  ============================================
echo       Learning Manager  Starting...
echo  ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found.
    echo  Please install from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Install dependencies if missing
if not exist "node_modules\express" (
    echo  [SETUP] Installing packages, please wait...
    echo.
    npm install
    if errorlevel 1 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
)

:: Get LAN IP (last IPv4 from ipconfig, strip leading space)
set "LAN_IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4"') do set "LAN_IP=%%A"
if defined LAN_IP set "LAN_IP=%LAN_IP: =%"

echo  Server started!
echo.
echo    Local : http://localhost:3000
if defined LAN_IP echo    LAN   : http://%LAN_IP%:3000
echo.
echo    Close this window to stop the server.
echo  ============================================
echo.

:: Open browser after 2 seconds
start "" /B cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

node server.js

echo.
echo  Server stopped. Press any key to close...
pause >nul
