#!/usr/bin/env bash
# ============================================================
#  Learning Manager — Mac / Linux 啟動腳本
# ============================================================
set -euo pipefail

# 切換到腳本所在目錄，確保相對路徑正確
cd "$(dirname "$0")"

echo ""
echo " ============================================"
echo "      Learning Manager  Starting..."
echo " ============================================"
echo ""

# ── 偵測作業系統 ──────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="mac" ;;
  Linux)  PLATFORM="linux" ;;
  *)
    echo " [ERROR] Unsupported OS: $OS"
    exit 1
    ;;
esac
echo " [Platform] $OS"

# ── 確認 Node.js 已安裝 ───────────────────────────────────
if ! command -v node &>/dev/null; then
  echo ""
  echo " [ERROR] Node.js not found."
  echo ""
  if [ "$PLATFORM" = "mac" ]; then
    echo "  Install options:"
    echo "    brew install node"
    echo "    or download from https://nodejs.org"
  else
    echo "  Install options:"
    echo "    Ubuntu/Debian : sudo apt install nodejs npm build-essential"
    echo "    Fedora/RHEL   : sudo dnf install nodejs npm gcc gcc-c++ make"
    echo "    or download from https://nodejs.org"
  fi
  echo ""
  exit 1
fi

NODE_VER="$(node --version)"
echo " [Node.js] $NODE_VER"
echo ""

# ── 首次安裝相依套件 ──────────────────────────────────────
if [ ! -d "node_modules/express" ]; then
  echo " [SETUP] Installing packages, please wait..."
  echo "         (better-sqlite3 needs compilation, may take ~30s)"
  echo ""

  # Linux 需要編譯工具，先給個友善提示
  if [ "$PLATFORM" = "linux" ] && ! command -v gcc &>/dev/null; then
    echo " [WARN] gcc not found. If npm install fails, run:"
    echo "        sudo apt install build-essential python3   (Ubuntu/Debian)"
    echo "        sudo dnf install gcc gcc-c++ make python3 (Fedora/RHEL)"
    echo ""
  fi

  if ! npm install; then
    echo ""
    echo " [ERROR] Package installation failed."
    if [ "$PLATFORM" = "mac" ]; then
      echo "         Make sure Xcode Command Line Tools are installed:"
      echo "         xcode-select --install"
    else
      echo "         Make sure build tools are installed:"
      echo "         sudo apt install build-essential python3"
    fi
    exit 1
  fi
  echo ""
fi

# ── 取得區網 IP ────────────────────────────────────────────
LAN_IP=""
if [ "$PLATFORM" = "mac" ]; then
  # 依序嘗試 Wi-Fi (en0) → 有線 (en1)，取第一個有效 IP
  for iface in en0 en1 en2; do
    ip_candidate="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [ -n "$ip_candidate" ]; then
      LAN_IP="$ip_candidate"
      break
    fi
  done
else
  # Linux：用 hostname -I 取第一個非 127.x 的 IPv4
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi

# ── 顯示連線資訊 ───────────────────────────────────────────
echo " Server started!"
echo ""
echo "   Local : http://localhost:3000"
[ -n "$LAN_IP" ] && echo "   LAN   : http://$LAN_IP:3000"
echo ""
echo "   Press Ctrl+C to stop the server."
echo " ============================================"
echo ""

# ── 2 秒後自動開啟瀏覽器（背景執行）─────────────────────
(
  sleep 2
  if [ "$PLATFORM" = "mac" ]; then
    open "http://localhost:3000"
  else
    # Linux：嘗試 xdg-open，沒有就靜默略過
    if command -v xdg-open &>/dev/null; then
      xdg-open "http://localhost:3000" &>/dev/null
    fi
  fi
) &

# ── 啟動伺服器 ─────────────────────────────────────────────
node server.js

echo ""
echo " Server stopped."
