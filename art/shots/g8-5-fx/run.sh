#!/bin/sh
# 使い方: sh run.sh <様式,様式> <種類> <刻み,刻み> [武器]   （PORT=8080 のサーバーが立っていること）
set -eu
cd "$(dirname "$0")/../../.."
STYLES="$1"; KIND="$2"; MARKS="$3"; WK="${4:-sword}"
LA="$(cygpath -u "$LOCALAPPDATA")"
export PATH="$LA/Programs/node22:$PATH"
export PLAYWRIGHT_MODULE="file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs"
G="$LA/Programs/Godot_4.3/Godot_v4.3-stable_win64_console.exe"
APPDATA="$(cygpath -w "$PWD/godot/worldart/.godot/user_data")"; export APPDATA
node art/shots/g8-5-fx/capture-browser.mjs http://127.0.0.1:8080 art/shots/g8-5-fx/browser "$STYLES" "$KIND" "$MARKS" "$WK"
case "$KIND" in swing|heavy|ws|q|e) LABEL="$WK-$KIND";; *) LABEL="$KIND";; esac
OUT="$(cygpath -w "$PWD/art/shots/g8-5-fx/godot/p")"
cd godot/worldart
"$G" --path . --resolution 1532x869 -- --auto --name=FxTest --at=0,0 --wk="$WK" "--fxdemo=$KIND:$MARKS" "--fxstyles=$STYLES" "--fxout=$OUT" "--fxlabel=$LABEL" "--shot=30000:$OUT.png" > /tmp/g85-godot.log 2>&1
grep -E "SCRIPT ERROR|^SHOT" /tmp/g85-godot.log || true
