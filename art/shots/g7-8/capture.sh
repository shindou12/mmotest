#!/bin/sh
set -eu
cd "$(dirname "$0")/../../.."
mkdir -p art/shots/g7-8/browser art/shots/g7-8/godot
LOCALAPPDATA_UNIX="$(cygpath -u "$LOCALAPPDATA")"
export PATH="$LOCALAPPDATA_UNIX/Programs/node22:$PATH"
export PLAYWRIGHT_MODULE="file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs"
GODOT_BIN="$LOCALAPPDATA_UNIX/Programs/Godot_4.3/Godot_v4.3-stable_win64_console.exe"
PYTHON_BIN="$LOCALAPPDATA_UNIX/Programs/Python/Python313/python.exe"
APPDATA="$(cygpath -w "$PWD/godot/worldart/.godot/user_data")"
export APPDATA

PORT=8080 node server.js > /tmp/g7-8-server.log 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT
sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then cat /tmp/g7-8-server.log; exit 1; fi

node art/shots/g7-8/capture-browser.mjs http://127.0.0.1:8080 art/shots/g7-8/browser > /tmp/g7-8-browser-capture.log 2>&1

capture_godot() {
  view="$1"
  shift
  shot="$(cygpath -w "$PWD/art/shots/g7-8/godot/$view.png")"
  log="/tmp/g7-8-godot-$view.log"
  "$GODOT_BIN" --path godot/worldart --resolution 1532x869 -- "$@" "--shot=120:$shot" > "$log" 2>&1
  if grep -q "SCRIPT ERROR" "$log" || ! grep -q "^SHOT " "$log"; then cat "$log"; exit 1; fi
}

capture_godot login --login-new --wk=greatsword --shotarea=f1_town
capture_godot login-existing --login-existing --wk=greatsword --shotarea=f1_town
capture_godot chat --auto --town --login-new --name=G7-8 --chat-demo --server=ws://127.0.0.1:8080/ws --shotarea=f1_town
capture_godot debug --auto --town --name=G7-8 --debug --debug-panel --server=ws://127.0.0.1:8080/ws --shotarea=f1_town
capture_godot death --auto --town --name=G7-8 --hud-demo=death --server=ws://127.0.0.1:8080/ws --shotarea=f1_town

cleanup
wait "$SERVER_PID" 2>/dev/null || true
SERVER_PID=
trap - EXIT
"$PYTHON_BIN" -I -X utf8 tools/worldart/pairsheet.py art/shots/g7-8/browser art/shots/g7-8/godot art/shots/g7-8/comparison.webp login,login-existing,chat,debug,death --labels Browser,Godot
cat /tmp/g7-8-browser-capture.log
