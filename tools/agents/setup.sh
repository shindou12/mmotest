#!/bin/sh
# Luna（Codex CLI）を呼べる状態にする準備（docs/agents/collaboration.md）。何度実行してもよい。
#   sh tools/agents/setup.sh            # Codex CLI を入れて、認証の有無を確かめる
#   sh tools/agents/setup.sh --godot    # あわせて描画の確認の環境（Godot 4.3・xvfb・ソフトウェアの Vulkan）も入れる
# 秘密情報は扱わない: 認証は環境の設定（ネットワークの秘密情報 か 環境変数 CODEX_API_KEY）で渡す。キーを表示・保存しない。
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
  [ -f /usr/share/vulkan/icd.d/lvp_icd.json ] || apt-get install -y -q mesa-vulkan-drivers >/dev/null 2>&1
  command -v xvfb-run >/dev/null 2>&1 || apt-get install -y -q xvfb >/dev/null 2>&1
  echo "OK  $(godot --version 2>/dev/null | head -1)  xvfb: $(command -v xvfb-run >/dev/null && echo あり || echo なし)  vulkan(lavapipe): $([ -f /usr/share/vulkan/icd.d/lvp_icd.json ] && echo あり || echo なし)"
fi
# 認証: 中身は見ずに、有無だけ
if [ -n "$CODEX_API_KEY" ] || [ -n "$OPENAI_API_KEY" ] || codex login status >/dev/null 2>&1; then
  echo "OK  認証の設定あり（環境変数 か codex login）"
else
  echo "--  Codex の認証の設定なし（環境変数 CODEX_API_KEY がない、codex login もしていない）。"
  echo "    ネットワークの秘密情報（api.openai.com）で渡している場合は、tools/agents/luna.sh --check で実際に呼べるか確かめる"
fi
