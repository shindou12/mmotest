#!/bin/sh
# このリポジトリだけの準備。共通の setup.sh から呼ばれる。
if [ "${1:-}" = "--godot" ]; then
  if ! command -v godot >/dev/null 2>&1; then
    d=$(mktemp -d)
    curl -sSL -o "$d/g.zip" https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_linux.x86_64.zip && (cd "$d" && unzip -oq g.zip) && mv "$d/Godot_v4.3-stable_linux.x86_64" /usr/local/bin/godot
    rm -rf "$d"
  fi
  # apt は update してからでないと mesa-vulkan-drivers が見つからない（2026-10-21）
  [ -f /usr/share/vulkan/icd.d/lvp_icd.json ] || { apt-get update -q >/dev/null 2>&1; apt-get install -y -q mesa-vulkan-drivers >/dev/null 2>&1; }
  command -v xvfb-run >/dev/null 2>&1 || apt-get install -y -q xvfb >/dev/null 2>&1
  # Godot MCP（.mcp.json の godot。エディタ・実行・デバッグの出力）。npm の版は古いので GitHub の決まったコミットから作る
  GODOT_MCP_REV=1209744fad78f3998f98c7394fd0f6ef50da5281
  if [ "$(git -C /opt/godot-mcp rev-parse HEAD 2>/dev/null)" != "$GODOT_MCP_REV" ] || [ ! -f /opt/godot-mcp/build/index.js ]; then
    rm -rf /opt/godot-mcp && git clone -q https://github.com/Coding-Solo/godot-mcp.git /opt/godot-mcp && git -C /opt/godot-mcp checkout -q $GODOT_MCP_REV && (cd /opt/godot-mcp && npm ci --silent >/dev/null 2>&1 && npm run build --silent >/dev/null 2>&1)
  fi
  echo "OK  godot-mcp: $([ -f /opt/godot-mcp/build/index.js ] && echo あり || echo なし)"
  echo "OK  $(godot --version 2>/dev/null | head -1)  xvfb: $(command -v xvfb-run >/dev/null && echo あり || echo なし)  vulkan(lavapipe): $([ -f /usr/share/vulkan/icd.d/lvp_icd.json ] && echo あり || echo なし)"
fi
