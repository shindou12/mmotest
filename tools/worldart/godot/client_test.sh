#!/bin/sh
# Godot 版の試作クライアントの確認（L27）: ゲームのサーバーを別の番号で立て、画面なし（--headless）で自動操作を動かす。
#   sh tools/worldart/godot/client_test.sh
# 確かめること（大剣・短剣・大斧は武器ごとの回あり）: 1) ログインして草原へ移る 2) 敵に攻撃が当たる 3) 敵を倒して経験値が入る 4) 出口から街へ移る 5) 出口から屋内（マス目）のエリアへ移る 6) 溜め斬り・武器スキル 7) 落とし物を拾い装備する（運しだい）
cd "$(dirname "$0")/../../.."
GODOT_COMMAND="${GODOT_BIN:-${G:-godot}}"
GODOT_WRAPPER_DIR=
if [ "$GODOT_COMMAND" != godot ]; then
  GODOT_COMMAND="$(cygpath -u "$GODOT_COMMAND")"
  GODOT_WRAPPER_DIR="$(mktemp -d /tmp/godot-client-test.XXXXXX)"
  printf '#!/bin/sh\nexec "%s" "$@"\n' "$GODOT_COMMAND" > "$GODOT_WRAPPER_DIR/godot"
  chmod +x "$GODOT_WRAPPER_DIR/godot"
  PATH="$GODOT_WRAPPER_DIR:$PATH"
  export PATH
fi
# Godot の user://logs が既定の AppData に書けない端末では、プロジェクト内の user_data を使う。
TEST_APPDATA="${GODOT_TEST_APPDATA:-$PWD/godot/worldart/.godot/user_data/client_test}"
mkdir -p "$TEST_APPDATA"
APPDATA="$(cygpath -w "$TEST_APPDATA")"
export APPDATA
PORT=$((20000 + $$ % 20000))
PORT=$PORT node server.js > /tmp/godot_client_test_server.log 2>&1 &
SRV=$!
sleep 1
OUT=/tmp/godot_client_test.log
# スキル変化（G4）: 片手剣の武器スキルに爆炎（sv_blaze）を付けて、SKILL の行に sv= が出ること
( cd godot/worldart && timeout -k 5 200 godot --headless --path . -- --bot --sv=sv_blaze:3 --server=ws://127.0.0.1:$PORT/ws --quit=120 > $OUT 2>&1 )
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
# 倒れる（G4）: 15 秒で倒れて這いずり → 一人なので力尽きる → 始め直して草原へ入り直す（再接続で hello が送られること）
OUTF=/tmp/godot_client_test_fall.log
( cd godot/worldart && timeout -k 5 100 godot --headless --path . -- --bot --fall=15 --server=ws://127.0.0.1:$PORT/ws --quit=60 > $OUTF 2>&1 )
( cd godot/worldart && timeout -k 5 100 godot --headless --path . -- --bot --goto=f1_town --server=ws://127.0.0.1:$PORT/ws --quit=40 >> $OUT 2>&1 )
( cd godot/worldart && timeout -k 5 100 godot --headless --path . -- --bot --goto=f1_dun --server=ws://127.0.0.1:$PORT/ws --quit=50 >> $OUT 2>&1 )
# G7-7: F から依頼受注・鍛冶屋・共有ボックスを開く。NPC は実際の「受ける」ボタンを押す。
OUTNPC=/tmp/godot_client_test_npc.log
( cd godot/worldart && timeout -k 5 30 godot --headless --path . -- --auto --town --name=NpcTest --test-ui=npc --server=ws://127.0.0.1:$PORT/ws > $OUTNPC 2>&1 )
OUTSMITH=/tmp/godot_client_test_smith.log
( cd godot/worldart && timeout -k 5 30 godot --headless --path . -- --auto --town --name=SmithTest --test-ui=smith --server=ws://127.0.0.1:$PORT/ws > $OUTSMITH 2>&1 )
OUTBOX=/tmp/godot_client_test_box.log
( cd godot/worldart && timeout -k 5 30 godot --headless --path . -- --auto --town --name=BoxTest --test-ui=box --server=ws://127.0.0.1:$PORT/ws > $OUTBOX 2>&1 )
OUTCHAT=/tmp/godot_client_test_chat.log
( cd godot/worldart && timeout -k 5 30 godot --headless --path . -- --auto --town --name=ChatTest --test-ui=chat --server=ws://127.0.0.1:$PORT/ws > $OUTCHAT 2>&1 )
kill $SRV
ok=0
grep -q "LOG ひだまりの草原" $OUT && echo "OK  草原へ移った" || { echo "NG  草原へ移れない"; ok=1; }
grep -q "^HIT " $OUT && echo "OK  攻撃が当たった（$(grep -c '^HIT ' $OUT) 回）" || { echo "NG  攻撃が当たらない"; ok=1; }
grep -q "^XP " $OUT && echo "OK  敵を倒して経験値（$(grep -c '^XP ' $OUT) 回）" || { echo "NG  経験値が入らない"; ok=1; }
# 効果音（G8-3）: 操作・当たり・被弾・歩行が GameAudio に届くこと
grep -q "^SFX swing$" $OUT && echo "OK  SFX swing" || { echo "NG  SFX swing が出ない"; ok=1; }
grep -q "^SFX hit$" $OUT && echo "OK  SFX hit" || { echo "NG  SFX hit が出ない"; ok=1; }
grep -q "^SFX hurt$" $OUT && echo "OK  SFX hurt" || { echo "NG  SFX hurt が出ない"; ok=1; }
grep -q "^SFX step$" $OUT && echo "OK  SFX step" || { echo "NG  SFX step が出ない"; ok=1; }
grep -q "^SFX telegraph$" $OUT && echo "OK  SFX telegraph" || { echo "NG  SFX telegraph が出ない"; ok=1; }
grep -q "^SFX mobdie$" $OUT && echo "OK  SFX mobdie" || { echo "NG  SFX mobdie が出ない"; ok=1; }
grep -c "LOG はじまりの街" $OUT | grep -qv "^1$" && echo "OK  出口から街へ移った" || { echo "NG  出口から街へ移れない"; ok=1; }
grep -q "LOG 古井戸の洞窟" $OUT && echo "OK  出口から屋内（古井戸の洞窟）へ移った" || { echo "NG  屋内へ移れない"; ok=1; }
grep -q "^HEAVY" $OUT && echo "OK  溜め斬り（$(grep -c '^HEAVY' $OUT) 回）" || { echo "NG  溜め斬りが出ない"; ok=1; }
grep -q "^SKILL" $OUT && echo "OK  武器スキル（$(grep -c '^SKILL' $OUT) 回）" || { echo "NG  武器スキルが出ない"; ok=1; }
grep -q "^SKILL .* sv=sv_blaze" $OUT && echo "OK  スキル変化（爆炎）の武器スキル（$(grep -c '^SKILL .* sv=sv_blaze' $OUT) 回）" || { echo "NG  スキル変化の武器スキルが出ない"; ok=1; }
grep -q "^HURT" $OUT && echo "OK  被弾（HURT $(grep -c '^HURT' $OUT) 回）: $(grep '^HURT' $OUT | head -1)" || { echo "NG  被弾しない（hurt.gd）"; ok=1; }
grep -q "LOG 這いずり状態" $OUTF && echo "OK  倒れて這いずり状態になった" || { echo "NG  倒れても這いずり状態にならない"; ok=1; }
grep -q "LOG 戦闘不能" $OUTF && echo "OK  一人で倒れて力尽きた" || { echo "NG  力尽きない"; ok=1; }
[ "$(grep -c 'LOG ひだまりの草原' $OUTF)" -ge 2 ] && echo "OK  力尽きたあと始め直して草原へ入り直した" || { echo "NG  始め直しで草原へ入り直せない（再接続）"; ok=1; }
grep -E "SCRIPT ERROR" $OUTF && ok=1
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
grep -q "^HURT" $OUTG && echo "OK  大剣: 被弾・のけぞり（HURT $(grep -c '^HURT' $OUTG) 回）" || { echo "NG  大剣: 被弾しない"; ok=1; }
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
grep -q "^HURT" $OUTD && echo "OK  短剣: 被弾・のけぞり（HURT $(grep -c '^HURT' $OUTD) 回）" || { echo "NG  短剣: 被弾しない"; ok=1; }
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
grep -q "^HURT" $OUTA && echo "OK  大斧: 被弾・のけぞり（HURT $(grep -c '^HURT' $OUTA) 回）" || { echo "NG  大斧: 被弾しない"; ok=1; }
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
  grep -q "^HURT" $f && echo "OK  $name: 被弾（HURT $(grep -c '^HURT' $f) 回）" || { echo "NG  $name: 被弾しない"; ok=1; }
  # 盾槍はガードを構えて受ける（溜め中に自動で構える）: GUARD の行（防御・カウンター準備・ガードブレイク）が出ること
  [ "$name" = "盾槍" ] && { grep -q "^GUARD" $f && echo "OK  盾槍: ガードで受けた（GUARD $(grep -c '^GUARD' $f) 回）: $(grep '^GUARD' $f | head -1)" || { echo "NG  盾槍: ガードで受けない"; ok=1; }; }
  [ "$name" = "盾槍" ] && { grep -q "^SFX block$" $f && echo "OK  盾槍: SFX block" || { echo "NG  盾槍: SFX block が出ない"; ok=1; }; }
  grep -E "SCRIPT ERROR" $f && ok=1
done
# G7-7 の街 UI 確認
grep -q "G7_7 NPC ACCEPT OK" $OUTNPC && echo "OK  街で NPC に話してクエストを受ける" || { echo "NG  街で NPC に話してクエストを受ける"; grep -E "G7_7|SCRIPT ERROR" $OUTNPC; ok=1; }
grep -q "G7_7 SMITH OPEN OK" $OUTSMITH && echo "OK  鍛冶屋を開く" || { echo "NG  鍛冶屋を開く"; grep -E "G7_7|SCRIPT ERROR" $OUTSMITH; ok=1; }
grep -q "G7_7 BOX OPEN OK" $OUTBOX && echo "OK  共有ボックスを開く" || { echo "NG  共有ボックスを開く"; grep -E "G7_7|SCRIPT ERROR" $OUTBOX; ok=1; }
grep -q "G7_8 CHAT SEND OK t=chat field=text" $OUTCHAT && echo "OK  チャットを送信: {t:chat, text}" || { echo "NG  チャットを送信"; grep -E "G7_8|SCRIPT ERROR" $OUTCHAT; ok=1; }
grep -q "G7_8 CHAT RECEIVE OK from=ChatTest text=G7-8 chat roundtrip" $OUTCHAT && echo "OK  サーバー経由でチャットを受信" || { echo "NG  サーバー経由でチャットを受信"; grep -E "G7_8|SCRIPT ERROR" $OUTCHAT; ok=1; }
grep -q "G7_8 CHAT ROUNDTRIP OK" $OUTCHAT && echo "OK  チャット送受信の往復" || { echo "NG  チャット送受信の往復"; grep -E "G7_8|SCRIPT ERROR" $OUTCHAT; ok=1; }
# 設定の照合
G=$(cd godot/worldart && timeout -k 5 100 godot --headless --path . -s res://scripts/tests/settings_golden.gd 2>&1); gs=$?
echo "$G" | grep -E "^(OK|NG|設定)"
[ $gs -eq 0 ] || { echo "NG  設定の照合（終了コード $gs）"; ok=1; }
# クエスト進行・報酬・鍛冶屋の式。期待値は元の JavaScript から一時領域に生成する。
QUESTS_GOLDEN_PATH=$(node tools/worldart/godot/golden_quests.mjs | sed -n 's/^QUESTS_GOLDEN_PATH=//p' | tail -1)
export QUESTS_GOLDEN_PATH
G=$(cd godot/worldart && timeout -k 5 100 godot --headless --path . -s res://scripts/tests/quests_golden.gd 2>&1); gs=$?
echo "$G" | grep -E "^(OK|NG|照合)"
[ $gs -eq 0 ] || { echo "NG  クエスト・鍛冶屋の照合（終了コード $gs）"; ok=1; }
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
# 当たりの照合（strikes の arc・line・circle・proj・arrow・戻る斧・罠と、飛び道具の毎フレームを、元の JavaScript の記録と比べる。生の値は大きいので git に入れず、なければここで作る）
[ -f godot/worldart/data/strikes_golden.json ] || node tools/worldart/godot/golden_strikes.mjs > /dev/null
G=$(cd godot/worldart && timeout -k 5 300 godot --headless --path . -s res://scripts/tests/strikes_golden.gd 2>&1); gs=$?
echo "$G" | grep -E "^(OK|NG|照合)"
[ $gs -eq 0 ] || { echo "NG  当たりの照合（終了コード $gs）"; ok=1; }
# 姿勢の照合（人物の部品の世界行列を、元の three.js と 1e-4 で比べる。生の値は大きいので git に入れず、なければここで作る）
[ -f godot/worldart/data/poses_golden.json ] || node tools/worldart/godot/export_rig.mjs > /dev/null
G=$(cd godot/worldart && timeout -k 5 300 godot --headless --path . -s res://scripts/tests/poses_golden.gd 2>&1); gs=$?
echo "$G" | grep -E "^(OK|NG|照合)"
[ $gs -eq 0 ] || { echo "NG  姿勢の照合（終了コード $gs）"; ok=1; }
# 敵の動きの照合（JavaScript の animateMob が出した部品値・発光を 1e-4 で比べる）
[ -f godot/worldart/data/mobs_golden.json ] || node tools/worldart/godot/golden_mobs.mjs > /dev/null
G=$(cd godot/worldart && timeout -k 5 100 godot --headless --path . -s res://scripts/tests/mobs_golden.gd 2>&1); gs=$?
echo "$G" | grep -E "^(OK|NG|照合)"
if [ -n "$GODOT_WRAPPER_DIR" ]; then
  rm -f "$GODOT_WRAPPER_DIR/godot"
  rmdir "$GODOT_WRAPPER_DIR"
fi
[ $gs -eq 0 ] || { echo "NG  敵の動きの照合（終了コード $gs）"; ok=1; }
exit $ok
