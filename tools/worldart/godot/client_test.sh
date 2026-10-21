#!/bin/sh
# Godot 版の試作クライアントの確認（L27）: ゲームのサーバーを別の番号で立て、画面なし（--headless）で自動操作を動かす。
#   sh tools/worldart/godot/client_test.sh
# 確かめること: 1) ログインして草原へ移る 2) 敵に攻撃が当たる 3) 敵を倒して経験値が入る 4) 出口から街へ移る 5) 出口から屋内（マス目）のエリアへ移る 6) 溜め斬り・武器スキル 7) 落とし物を拾い装備する（運しだい）
cd "$(dirname "$0")/../../.."
PORT=$((20000 + $$ % 20000))
PORT=$PORT node server.js > /tmp/godot_client_test_server.log 2>&1 &
SRV=$!
sleep 1
OUT=/tmp/godot_client_test.log
( cd godot/worldart && timeout -k 5 200 godot --headless --path . -- --bot --server=ws://127.0.0.1:$PORT/ws --quit=120 > $OUT 2>&1 )
( cd godot/worldart && timeout -k 5 100 godot --headless --path . -- --bot --goto=f1_town --server=ws://127.0.0.1:$PORT/ws --quit=40 >> $OUT 2>&1 )
( cd godot/worldart && timeout -k 5 100 godot --headless --path . -- --bot --goto=f1_dun --server=ws://127.0.0.1:$PORT/ws --quit=50 >> $OUT 2>&1 )
kill $SRV
ok=0
grep -q "LOG ひだまりの草原" $OUT && echo "OK  草原へ移った" || { echo "NG  草原へ移れない"; ok=1; }
grep -q "^HIT " $OUT && echo "OK  攻撃が当たった（$(grep -c '^HIT ' $OUT) 回）" || { echo "NG  攻撃が当たらない"; ok=1; }
grep -q "^XP " $OUT && echo "OK  敵を倒して経験値（$(grep -c '^XP ' $OUT) 回）" || { echo "NG  経験値が入らない"; ok=1; }
grep -c "LOG はじまりの街" $OUT | grep -qv "^1$" && echo "OK  出口から街へ移った" || { echo "NG  出口から街へ移れない"; ok=1; }
grep -q "LOG 古井戸の洞窟" $OUT && echo "OK  出口から屋内（古井戸の洞窟）へ移った" || { echo "NG  屋内へ移れない"; ok=1; }
grep -q "^HEAVY" $OUT && echo "OK  溜め斬り（$(grep -c '^HEAVY' $OUT) 回）" || { echo "NG  溜め斬りが出ない"; ok=1; }
grep -q "^SKILL" $OUT && echo "OK  武器スキル（$(grep -c '^SKILL' $OUT) 回）" || { echo "NG  武器スキルが出ない"; ok=1; }
grep -q "^PICKUP" $OUT && echo "OK  落とし物を拾った（$(grep -c '^PICKUP' $OUT) 個）" || echo "--  落とし物なし（運しだい）"
grep -q "^EQUIP" $OUT && echo "OK  拾った装備を着けた: $(grep '^EQUIP' $OUT | head -1)" || echo "--  装備の変更なし（運しだい）"
grep -E "SCRIPT ERROR" $OUT && ok=1
# 式の照合（元の JavaScript で作った期待値と GDScript を比べる。JSON は node tools/worldart/godot/golden_rules.mjs で作り直せる）
G=$(cd godot/worldart && timeout -k 5 100 godot --headless --path . -s res://scripts/tests/rules_golden.gd 2>&1); gs=$?
echo "$G" | grep -E "^(OK|NG|照合)"
[ $gs -eq 0 ] || { echo "NG  式の照合（終了コード $gs）"; ok=1; }
exit $ok
