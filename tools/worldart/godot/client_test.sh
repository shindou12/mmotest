#!/bin/sh
# Godot 版の試作クライアントの確認（L27）: ゲームのサーバーを別の番号で立て、画面なし（--headless）で自動操作を動かす。
#   sh tools/worldart/godot/client_test.sh
# 確かめること: 1) ログインして草原へ移る 2) 敵に攻撃が当たる 3) 敵を倒して経験値が入る 4) 出口から街へ移る
cd "$(dirname "$0")/../../.."
PORT=$((20000 + $$ % 20000))
PORT=$PORT node server.js > /tmp/godot_client_test_server.log 2>&1 &
SRV=$!
sleep 1
OUT=/tmp/godot_client_test.log
( cd godot/worldart && timeout 150 godot --headless --path . -- --bot --server=ws://127.0.0.1:$PORT/ws --quit=60 > $OUT 2>&1 )
( cd godot/worldart && timeout 100 godot --headless --path . -- --bot --goto=f1_town --server=ws://127.0.0.1:$PORT/ws --quit=40 >> $OUT 2>&1 )
kill $SRV
ok=0
grep -q "LOG ひだまりの草原" $OUT && echo "OK  草原へ移った" || { echo "NG  草原へ移れない"; ok=1; }
grep -q "^HIT " $OUT && echo "OK  攻撃が当たった（$(grep -c '^HIT ' $OUT) 回）" || { echo "NG  攻撃が当たらない"; ok=1; }
grep -q "^XP " $OUT && echo "OK  敵を倒して経験値（$(grep -c '^XP ' $OUT) 回）" || { echo "NG  経験値が入らない"; ok=1; }
grep -c "LOG はじまりの街" $OUT | grep -qv "^1$" && echo "OK  出口から街へ移った" || { echo "NG  出口から街へ移れない"; ok=1; }
grep -E "SCRIPT ERROR" $OUT && ok=1
exit $ok
