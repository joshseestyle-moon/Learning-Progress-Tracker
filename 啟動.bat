@echo off
chcp 65001 >nul
title 學習管理系統
cd /d "%~dp0"

echo.
echo  ============================
echo       學習管理系統
echo  ============================
echo.

if not exist "node\node.exe" (
  echo  [錯誤] 找不到 node\node.exe
  echo  請先在原機執行「製作可攜版.bat」重新打包。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo  首次執行，安裝相依套件中，請稍候...
  echo  （需要網路連線，約 1-2 分鐘）
  echo.
  node\npm.cmd install
  if errorlevel 1 (
    echo.
    echo  [錯誤] 安裝失敗，請確認網路連線後重試。
    pause
    exit /b 1
  )
  echo.
)

for /f "delims=" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress"') do set LAN_IP=%%i

echo  伺服器已啟動
echo.
echo  本機連線：http://localhost:3000
if defined LAN_IP (
  echo  區網連線：http://%LAN_IP%:3000
)
echo.
echo  關閉此視窗即可停止伺服器。
echo  ============================
echo.

node\node.exe server.js

echo.
echo  伺服器已停止。
pause
