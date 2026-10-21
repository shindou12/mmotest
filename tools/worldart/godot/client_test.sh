#!/bin/sh
# Godot 版の試作クライアントの確認（L27）: ゲームのサーバーを別の番号で立て、画面なし（--headless）で自動操作を動かす。
#   sh tools/worldart/godot/client_test.sh
# 確かめること（大剣・短剣・大斧は武器ごとの回あり）: 1) ログインして草原へ移る 2) 敵に攻撃が当たる 3) 敵を倒して経験値が入る 4) 出口から街へ移る 5) 出口から屋内（マス目）のエリアへ移る 6) 溜め斬り・武器スキル 7) 落とし物を拾い装備する（運しだい）
cd "$(dirname "$0")/../../.."
PORT=$((20000 + $$ % 20000))
PORT=$PORT node server.js > /tmp/godot_client_test_server.log 2>&1 &
SRV=$!
sleep 1
OUT=/tmp/godot_client_test.log
( cd godot/worldart && timeout -k 5 200 godot --headless --path . -- --bot --server=ws://127.0.0.1:$PORT/ws --quit=120 > $OUT 2>&1 )
# 大剣の回（G1-3b）: 大剣と武器ツリーを --wk・--wt・--slots で入れ、通常・溜め・強攻撃・武器スキル・Q/E を使わせる
OUTG=/tmp/godot_client_test_gs.log
( cd godot/worldart && timeout -k 5 200 godot --headless --path . -- --bot --wk=greatsword --wt=gt_wave,gt_charge:3A,gt_break:2,gt_eye,gt_armor,gt_moon,gt_rising:2,gt_broad,gt_guillo,gt_slam:2,gt_fullmoon --slots=gt_rising,gt_slam --server=ws://127.0.0.1:$PORT/ws --quit=120 > $OUTG 2>&1 )
# 短剣の回（G3）: 瞬影（溜めきった強攻撃）・シャドウ・ダンス・影縫い（投げナイフ）・裂傷連舞（出血）・毒刃（毒の継続ダメージ）
OUTD=/tmp/godot_client_test_dg.log
( cd godot/worldart && timeout -k 5 200 godot --headless --path . -- --bot --wk=dagger --wt=dk_venom,dk_burst,dk_combo:3A,dk_toxin:2,dk_shadow:2,dk_flank,dk_vital,dk_bleed:2,dk_pin:2,dk_poison --slots=dk_pin,dk_bleed --server=ws://127.0.0.1:$PORT/ws --quit=120 > $OUTD 2>&1 )
# 大斧の回（G3）: 大地砕き・ランペイジ・引き裂き・返り刃（戻る斧）・破砕と地砕き
OUTA=/tmp/godot_client_test_ax.log
( cd godot/worldart && timeout -k 5 200 godot --headless --path . -- --bot --wk=axe --wt=ax_crush,ax_quake,ax_heavy:3A,ax_swing:2,ax_brk:2,ax_hook:2,ax_stomp,ax_exec,ax_return,ax_rush,ax_lust --slots=ax_hook,ax_return --server=ws://127.0.0.1:$PORT/ws --quit=120 > $OUTA 2>&1 )
# 盾槍の回（G3）: 先端・槍の心得・鉄壁・盾の心得・崩し・扇突き・シールドバッシュ・杭打ち・迎撃の構え を振り、Q/E に扇突きとシールドバッシュ
OUTS=/tmp/godot_client_test_spear.log
( cd godot/worldart && timeout -k 5 200 godot --headless --path . -- --bot --wk=spear --wt=sp_reach,sp_pierce,sp_spear:3B,sp_iron:3A,sp_shield:2,sp_brk,sp_fan:2,sp_bash:2,sp_stake,sp_intercept --slots=sp_fan,sp_bash --server=ws://127.0.0.1:$PORT/ws --quit=120 > $OUTS 2>&1 )
# 弓の回（G3）: 狙撃手・遠見の心得・弓引きの心得・二段射ち・跳弦射撃 を振り、Q/E に二段射ちと跳弦射撃。通常攻撃も強攻撃も矢で当てる
OUTB=/tmp/godot_client_test_bow.log
( cd godot/worldart && timeout -k 5 200 godot --headless --path . -- --bot --wk=bow --wt=bw_sniper,bw_hawk,bw_zone:3B,bw_draw:2,bw_crit,bw_double:2,bw_side,bw_trap --slots=bw_double,bw_side --server=ws://127.0.0.1:$PORT/ws --quit=120 > $OUTB 2>&1 )
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
# 大剣の回: 強攻撃（HEAVY）・武器スキル（SKILL）・Q/E（TSKILL）が出て、HIT（当たり）に強攻撃の当たりが入っていること
grep -q "^HEAVY" $OUTG && echo "OK  大剣: 強攻撃（$(grep -c '^HEAVY' $OUTG) 回）" || { echo "NG  大剣: 強攻撃が出ない"; ok=1; }
grep -q "^SKILL" $OUTG && echo "OK  大剣: 武器スキル（$(grep -c '^SKILL' $OUTG) 回）" || { echo "NG  大剣: 武器スキルが出ない"; ok=1; }
grep -q "^TSKILL" $OUTG && echo "OK  大剣: Q/E のツリースキル（$(grep -c '^TSKILL' $OUTG) 回）" || { echo "NG  大剣: Q/E が出ない"; ok=1; }
grep -q "^HIT .* type=normal" $OUTG && echo "OK  大剣: 通常攻撃が当たった（$(grep -c '^HIT .* type=normal' $OUTG) 回）" || { echo "NG  大剣: 通常攻撃が当たらない"; ok=1; }
grep -q "^HIT .* type=heavy" $OUTG && echo "OK  大剣: 強攻撃が当たった（$(grep -c '^HIT .* type=heavy' $OUTG) 回）: $(grep '^HIT .* type=heavy' $OUTG | head -1)" || { echo "NG  大剣: 強攻撃が当たらない"; ok=1; }
grep -q "^HIT .* type=wskill" $OUTG && echo "OK  大剣: 武器スキルが当たった（$(grep -c '^HIT .* type=wskill' $OUTG) 回）" || { echo "NG  大剣: 武器スキルが当たらない"; ok=1; }
grep -q "^HIT .* type=tskill" $OUTG && echo "OK  大剣: ツリースキルが当たった（$(grep -c '^HIT .* type=tskill' $OUTG) 回）" || { echo "NG  大剣: ツリースキルが当たらない"; ok=1; }
grep -E "SCRIPT ERROR" $OUTG && ok=1
# 短剣の回: 強攻撃（瞬影）・武器スキル・Q/E・投げナイフ（影縫い lv2 = 倍率 3.40 は矢だけ）・毒の継続ダメージ（type=dot）が当たること
grep -q "^HEAVY" $OUTD && echo "OK  短剣: 強攻撃（瞬影 $(grep -c '^HEAVY' $OUTD) 回）" || { echo "NG  短剣: 強攻撃が出ない"; ok=1; }
grep -q "^SKILL" $OUTD && echo "OK  短剣: 武器スキル（$(grep -c '^SKILL' $OUTD) 回）" || { echo "NG  短剣: 武器スキルが出ない"; ok=1; }
grep -q "^TSKILL" $OUTD && echo "OK  短剣: Q/E のツリースキル（$(grep -c '^TSKILL' $OUTD) 回）" || { echo "NG  短剣: Q/E が出ない"; ok=1; }
grep -q "^HIT .* type=normal" $OUTD && echo "OK  短剣: 通常攻撃が当たった（$(grep -c '^HIT .* type=normal' $OUTD) 回）" || { echo "NG  短剣: 通常攻撃が当たらない"; ok=1; }
grep -q "^HIT .* type=heavy" $OUTD && echo "OK  短剣: 強攻撃が当たった（$(grep -c '^HIT .* type=heavy' $OUTD) 回）: $(grep '^HIT .* type=heavy' $OUTD | head -1)" || { echo "NG  短剣: 強攻撃が当たらない"; ok=1; }
grep -q "^HIT .* type=wskill" $OUTD && echo "OK  短剣: 武器スキルが当たった（$(grep -c '^HIT .* type=wskill' $OUTD) 回）" || { echo "NG  短剣: 武器スキルが当たらない"; ok=1; }
grep -q "^HIT .* type=tskill" $OUTD && echo "OK  短剣: ツリースキルが当たった（$(grep -c '^HIT .* type=tskill' $OUTD) 回）" || { echo "NG  短剣: ツリースキルが当たらない"; ok=1; }
grep -q "^HIT .* type=tskill mult=3.40" $OUTD && echo "OK  短剣: 投げナイフ（矢）が当たった（$(grep -c '^HIT .* type=tskill mult=3.40' $OUTD) 回）" || { echo "NG  短剣: 投げナイフが当たらない"; ok=1; }
grep -q "^HIT .* type=dot" $OUTD && echo "OK  短剣: 毒・出血の継続ダメージが入った（$(grep -c '^HIT .* type=dot' $OUTD) 回）" || { echo "NG  短剣: 毒・出血が入らない"; ok=1; }
grep -E "SCRIPT ERROR" $OUTD && ok=1
# 大斧の回: 強攻撃（大地砕き）・武器スキル・Q/E・戻る斧（返り刃 lv1 = 倍率 2.40 は斧だけ）が当たること
grep -q "^HEAVY" $OUTA && echo "OK  大斧: 強攻撃（$(grep -c '^HEAVY' $OUTA) 回）" || { echo "NG  大斧: 強攻撃が出ない"; ok=1; }
grep -q "^SKILL" $OUTA && echo "OK  大斧: 武器スキル（$(grep -c '^SKILL' $OUTA) 回）" || { echo "NG  大斧: 武器スキルが出ない"; ok=1; }
grep -q "^TSKILL" $OUTA && echo "OK  大斧: Q/E のツリースキル（$(grep -c '^TSKILL' $OUTA) 回）" || { echo "NG  大斧: Q/E が出ない"; ok=1; }
grep -q "^HIT .* type=normal" $OUTA && echo "OK  大斧: 通常攻撃が当たった（$(grep -c '^HIT .* type=normal' $OUTA) 回）" || { echo "NG  大斧: 通常攻撃が当たらない"; ok=1; }
grep -q "^HIT .* type=heavy" $OUTA && echo "OK  大斧: 強攻撃が当たった（$(grep -c '^HIT .* type=heavy' $OUTA) 回）: $(grep '^HIT .* type=heavy' $OUTA | head -1)" || { echo "NG  大斧: 強攻撃が当たらない"; ok=1; }
grep -q "^HIT .* type=wskill" $OUTA && echo "OK  大斧: 武器スキルが当たった（$(grep -c '^HIT .* type=wskill' $OUTA) 回）" || { echo "NG  大斧: 武器スキルが当たらない"; ok=1; }
grep -q "^HIT .* type=tskill" $OUTA && echo "OK  大斧: ツリースキルが当たった（$(grep -c '^HIT .* type=tskill' $OUTA) 回）" || { echo "NG  大斧: ツリースキルが当たらない"; ok=1; }
grep -q "^HIT .* type=tskill mult=2.40" $OUTA && echo "OK  大斧: 戻る斧（返り刃）が当たった（$(grep -c '^HIT .* type=tskill mult=2.40' $OUTA) 回）" || { echo "NG  大斧: 戻る斧が当たらない"; ok=1; }
grep -E "SCRIPT ERROR" $OUTA && ok=1
# 盾槍・弓の回: 強攻撃（HEAVY）・武器スキル（SKILL）・Q/E（TSKILL）が出て、HIT（当たり）に 通常・強攻撃・武器スキル・ツリースキルが入っていること
for pair in "盾槍:$OUTS" "弓:$OUTB"; do
  name=${pair%%:*}; f=${pair#*:}
  grep -q "^HEAVY" $f && echo "OK  $name: 強攻撃（$(grep -c '^HEAVY' $f) 回）" || { echo "NG  $name: 強攻撃が出ない"; ok=1; }
  grep -q "^SKILL" $f && echo "OK  $name: 武器スキル（$(grep -c '^SKILL' $f) 回）" || { echo "NG  $name: 武器スキルが出ない"; ok=1; }
  grep -q "^TSKILL" $f && echo "OK  $name: Q/E のツリースキル（$(grep -c '^TSKILL' $f) 回）" || { echo "NG  $name: Q/E が出ない"; ok=1; }
  for ty in normal heavy wskill tskill; do
    grep -q "^HIT .* type=$ty" $f && echo "OK  $name: $ty が当たった（$(grep -c "^HIT .* type=$ty" $f) 回）: $(grep "^HIT .* type=$ty" $f | head -1)" || { echo "NG  $name: $ty が当たらない"; ok=1; }
  done
  grep -E "SCRIPT ERROR" $f && ok=1
done
# 式の照合（元の JavaScript で作った期待値と GDScript を比べる。JSON は node tools/worldart/godot/golden_rules.mjs で作り直せる）
G=$(cd godot/worldart && timeout -k 5 100 godot --headless --path . -s res://scripts/tests/rules_golden.gd 2>&1); gs=$?
echo "$G" | grep -E "^(OK|NG|照合)"
[ $gs -eq 0 ] || { echo "NG  式の照合（終了コード $gs）"; ok=1; }
# 技の照合（片手剣・大剣・短剣・大斧・盾槍・弓の強攻撃・武器スキル・ツリースキルの呼び出し列を、元の JavaScript の記録と比べる。JSON は node tools/worldart/godot/golden_skills.mjs で作り直せる）
G=$(cd godot/worldart && timeout -k 5 100 godot --headless --path . -s res://scripts/tests/skills_golden.gd 2>&1); gs=$?
echo "$G" | grep -E "^(OK|NG|照合)"
[ $gs -eq 0 ] || { echo "NG  技の照合（終了コード $gs）"; ok=1; }
# 戦闘の照合（ダメージの式と、片手剣・大剣・短剣・大斧・盾槍・弓の効果の差し込み口を、元の JavaScript の結果と比べる。JSON は node tools/worldart/godot/golden_combat.mjs で作り直せる）
[ -f godot/worldart/data/combat_golden.json ] || node tools/worldart/godot/golden_combat.mjs > /dev/null
G=$(cd godot/worldart && timeout -k 5 300 godot --headless --path . -s res://scripts/tests/combat_golden.gd 2>&1); gs=$?
echo "$G" | grep -E "^(OK|NG|照合)"
[ $gs -eq 0 ] || { echo "NG  戦闘の照合（終了コード $gs）"; ok=1; }
# 姿勢の照合（人物の部品の世界行列を、元の three.js と 1e-4 で比べる。生の値は大きいので git に入れず、なければここで作る）
[ -f godot/worldart/data/poses_golden.json ] || node tools/worldart/godot/export_rig.mjs > /dev/null
G=$(cd godot/worldart && timeout -k 5 300 godot --headless --path . -s res://scripts/tests/poses_golden.gd 2>&1); gs=$?
echo "$G" | grep -E "^(OK|NG|照合)"
[ $gs -eq 0 ] || { echo "NG  姿勢の照合（終了コード $gs）"; ok=1; }
exit $ok
