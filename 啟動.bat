@echo off
chcp 65001 >nul
title Learning Manager
cd /d "%~dp0"

echo.
echo  ============================================
echo       Learning Manager  Starting...
echo  ============================================
echo.

:: ── 判斷版本：可攜版 or 安裝版 ──────────────────
if exist "%~dp0node\node.exe" (
    set "NODE=node\node.exe"
    set "NPM=node\npm.cmd"
    echo  [Mode] Portable
) else (
    where node >nul 2>&1
    if errorlevel 1 (
        echo  [ERROR] Node.js not found.
        echo  Install from https://nodejs.org
        echo  or rebuild the portable package first.
        echo.
        pause
        exit /b 1
    )
    set "NODE=node"
    set "NPM=npm"
    echo  [Mode] Installed
)
echo.

:: ── 首次安裝相依套件 ─────────────────────────────
if not exist "%~dp0node_modules\express" (
    echo  [SETUP] Installing packages, please wait...
    echo.
    "%NPM%" install
    if errorlevel 1 (
        echo.
        echo  [ERROR] Package installation failed.
        pause
        exit /b 1
    )
    echo.
)

:: ── 取得區網 IP（ipconfig，不使用 PowerShell）────
set "LAN_IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4"') do (
    if not defined LAN_IP set "LAN_IP=%%A"
)
if defined LAN_IP set "LAN_IP=%LAN_IP: =%"

:: ── 顯示連線資訊 ─────────────────────────────────
echo  Server started!
echo.
echo    Local : http://localhost:3000
if defined LAN_IP echo    LAN   : http://%LAN_IP%:3000
echo.
echo    Close this window to stop the server.
echo  ============================================
echo.

:: ── 2 秒後自動開啟瀏覽器 ─────────────────────────
start "" /B cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: ── 啟動伺服器 ───────────────────────────────────
"%NODE%" server.js

echo.
echo  Server stopped. Press any key to close...
pause >nul
