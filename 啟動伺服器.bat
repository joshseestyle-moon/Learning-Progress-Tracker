@echo off
chcp 65001 >nul
title 學習管理系統
cd /d X:\class

echo.
echo  ============================================
echo       學習管理系統  ^|  正在啟動...
echo  ============================================
echo.

:: 確認 Node.js 已安裝
where node >nul 2>&1
if errorlevel 1 (
    echo  [錯誤] 找不到 Node.js，請先至 https://nodejs.org 下載安裝。
    echo.
    pause
    exit /b 1
)

:: 確認 node_modules 存在，否則先安裝
if not exist "node_modules\express" (
    echo  [首次執行] 安裝相依套件中，請稍候...
    echo.
    npm install
    if errorlevel 1 (
        echo.
        echo  [錯誤] npm install 失敗，請確認網路後重試。
        pause
        exit /b 1
    )
    echo.
)

:: 取得區網 IP
for /f "delims=" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress"') do set LAN_IP=%%i

echo  伺服器啟動成功！
echo.
echo    本機連線：http://localhost:3000
if defined LAN_IP (
    echo    區網連線：http://%LAN_IP%:3000
)
echo.
echo    關閉此視窗即可停止伺服器。
echo  ============================================
echo.

:: 2 秒後自動開啟瀏覽器
start "" /B cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: 啟動伺服器（保持視窗開啟以顯示 log）
node server.js

echo.
echo  伺服器已停止。按任意鍵關閉視窗...
pause >nul
