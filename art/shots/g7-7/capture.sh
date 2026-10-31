#!/bin/sh
set -eu
cd "$(dirname "$0")/../../.."
mkdir -p art/shots/g7-7/browser art/shots/g7-7/godot
rm -f art/shots/g7-7/browser/*.png art/shots/g7-7/godot/*.png art/shots/g7-7/comparison.webp
LOCALAPPDATA_UNIX="$(cygpath -u "$LOCALAPPDATA")"
export PATH="$LOCALAPPDATA_UNIX/Programs/node22:$PATH"
export PLAYWRIGHT_MODULE="file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs"
GODOT_BIN="$LOCALAPPDATA_UNIX/Programs/Godot_4.3/Godot_v4.3-stable_win64_console.exe"
APPDATA="$(cygpath -w "$PWD/godot/worldart/.godot/user_data")"
export APPDATA
PORT=8080 node server.js > /tmp/g7-7-server.log 2>&1 &
SERVER_PID=$!
RESTORE_BOX=0
cleanup() {
  if [ "$RESTORE_BOX" -eq 1 ] && [ -n "$SERVER_PID" ]; then
    node art/shots/g7-7/restore-box.mjs > /tmp/g7-7-box-restore.log 2>&1 || true
  fi
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then cat /tmp/g7-7-server.log; exit 1; fi
node art/shots/g7-7/capture-browser.mjs http://127.0.0.1:8080 art/shots/g7-7/browser > /tmp/g7-7-browser-capture.log 2>&1
for view in npc quests smith box gate; do
  demo="$view"
  [ "$view" = npc ] && demo=dialog
  shot="$(cygpath -w "$PWD/art/shots/g7-7/godot/$view.png")"
  "$GODOT_BIN" --path godot/worldart --resolution 1532x869 -- --auto --low --settings-defaults --town --name=NpcTest --server=ws://127.0.0.1:8080/ws --shotarea=f1_town --demo-ui="$demo" --shot="120:$shot" > "/tmp/g7-7-godot-$view.log" 2>&1
  if [ "$view" = box ] && grep -q "を共有ボックスに入れた" /tmp/g7-7-godot-box.log; then RESTORE_BOX=1; fi
  if grep -q "SCRIPT ERROR" "/tmp/g7-7-godot-$view.log" || ! grep -q "^SHOT " "/tmp/g7-7-godot-$view.log"; then cat "/tmp/g7-7-godot-$view.log"; exit 1; fi
done
if [ "$RESTORE_BOX" -eq 1 ]; then
  node art/shots/g7-7/restore-box.mjs > /tmp/g7-7-box-restore.log 2>&1
  RESTORE_BOX=0
fi
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
SERVER_PID=
PYTHON_BIN="$LOCALAPPDATA_UNIX/Programs/Python/Python313/python.exe"
"$PYTHON_BIN" -I -X utf8 tools/worldart/pairsheet.py art/shots/g7-7/browser art/shots/g7-7/godot art/shots/g7-7/comparison.webp npc,quests,smith,box,gate --labels Browser,Godot
cat /tmp/g7-7-browser-capture.log
