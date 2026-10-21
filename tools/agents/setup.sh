#!/bin/sh
# Luna（Codex CLI）を呼べる状態にする準備（docs/agents/collaboration.md）。何度実行してもよい。
#   sh tools/agents/setup.sh            # Codex CLI を入れて、認証の有無を確かめる
#   sh tools/agents/setup.sh --godot    # あわせて描画の確認の環境（Godot 4.3・xvfb・ソフトウェアの Vulkan）も入れる
# 認証は ChatGPT のアカウントでのログインだけ（codex login --device-auth、ユーザーが承認）。API キー（従量課金）は使わない。秘密情報を表示・保存しない。
CODEX_VERSION=0.163.0
if ! command -v codex >/dev/null 2>&1 || [ "$(codex --version 2>/dev/null)" != "codex-cli $CODEX_VERSION" ]; then
  npm install -g "@openai/codex@$CODEX_VERSION" >/dev/null 2>&1 || { echo "NG  Codex CLI を入れられない（npm）"; exit 1; }
fi
echo "OK  $(codex --version)"
if [ "$1" = "--godot" ]; then
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
# 認証: 中身は見ずに、ログインの有無だけ
if codex login status >/dev/null 2>&1; then
  echo "OK  Codex にログイン済み（$(codex login status 2>&1 | head -1 | cut -c1-40)）"
else
  echo "--  Codex にログインしていない。ChatGPT のアカウントで: codex login --device-auth（ユーザーがブラウザで承認）"
fi
