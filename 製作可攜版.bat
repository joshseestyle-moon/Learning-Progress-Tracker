@echo off
chcp 65001 >nul
title 製作可攜版
cd /d "%~dp0"

echo.
echo  ============================
echo       製作可攜版
echo  ============================
echo.

:: ── 步驟 1：下載 Node.js 可攜版 ──────────────────────────
if exist "node\node.exe" (
  echo  [1/4] Node.js 已存在，略過下載。
) else (
  echo  [1/4] 下載 Node.js 可攜版（約 30 MB）...
  set NODE_VER=22.14.0
  set NODE_ZIP=node-v22.14.0-win-x64.zip
  set NODE_DIR=node-v22.14.0-win-x64

  powershell -NoProfile -Command ^
    "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip' -OutFile 'node.zip' -UseBasicParsing"

  if errorlevel 1 (
    echo.
    echo  [錯誤] 下載失敗，請確認網路連線後重試。
    pause
    exit /b 1
  )

  echo  解壓縮中...
  powershell -NoProfile -Command ^
    "Expand-Archive -Path 'node.zip' -DestinationPath '.' -Force"

  if exist "node-v22.14.0-win-x64" (
    ren "node-v22.14.0-win-x64" "node"
  ) else (
    echo  [錯誤] 解壓縮後找不到預期的資料夾。
    del /q node.zip 2>nul
    pause
    exit /b 1
  )

  del /q node.zip
  echo  Node.js 下載完成。
)

echo.

:: ── 步驟 2：安裝相依套件（使用內嵌 node） ────────────────
echo  [2/4] 安裝相依套件...
node\npm.cmd install

if errorlevel 1 (
  echo.
  echo  [錯誤] npm install 失敗。
  pause
  exit /b 1
)

echo.

:: ── 步驟 3：建立輸出目錄並複製檔案 ──────────────────────
echo  [3/4] 建立可攜版目錄...
set DIST=dist\class-portable

if exist "%DIST%" rd /s /q "%DIST%"
mkdir "%DIST%"
mkdir "%DIST%\data"

echo  複製 Node.js...
xcopy /e /i /q /y "node"         "%DIST%\node"         >nul

echo  複製相依套件...
xcopy /e /i /q /y "node_modules" "%DIST%\node_modules"  >nul

echo  複製應用程式檔案...
xcopy /e /i /q /y "db"           "%DIST%\db"            >nul
xcopy /e /i /q /y "routes"       "%DIST%\routes"        >nul
xcopy /e /i /q /y "middleware"   "%DIST%\middleware"    >nul
xcopy /e /i /q /y "public"       "%DIST%\public"        >nul

copy /y "server.js"     "%DIST%\server.js"     >nul
copy /y "package.json"  "%DIST%\package.json"  >nul
if exist "package-lock.json" copy /y "package-lock.json" "%DIST%\package-lock.json" >nul
if exist ".env"          copy /y ".env"         "%DIST%\.env"         >nul
copy /y "啟動.bat"       "%DIST%\啟動.bat"      >nul

if exist "data\app.db" (
  copy /y "data\app.db" "%DIST%\data\app.db" >nul
  echo  已包含資料庫（含現有資料）。
) else (
  echo  資料庫尚無資料，將於目標機首次啟動時自動建立。
)

echo.

:: ── 步驟 4：打包成 zip ────────────────────────────────────
echo  [4/4] 打包成 zip...
if exist "dist\class-portable.zip" del /q "dist\class-portable.zip"

powershell -NoProfile -Command ^
  "Compress-Archive -Path 'dist\class-portable' -DestinationPath 'dist\class-portable.zip' -Force"

if errorlevel 1 (
  echo  [警告] zip 打包失敗，資料夾版本仍可正常使用。
) else (
  echo  壓縮完成。
)

:: ── 完成 ──────────────────────────────────────────────────
echo.
echo  ============================
echo   完成！
echo.
echo   資料夾：dist\class-portable\
echo   壓縮檔：dist\class-portable.zip
echo.
echo   使用方式：
echo   將 class-portable.zip 複製到目標電腦，
echo   解壓縮後雙擊「啟動.bat」即可，
echo   目標電腦不需安裝任何軟體。
echo  ============================
echo.
pause
