# 武器の効果の差し込み口・片手剣と大剣の効果・ダメージの式を GDScript に移し、照合する（G1-3a）

## 目的
武器ツリーのクラス・マスター・パッシブの効果は、`public/js/game/weapon-fx.js` の差し込み口（fxCall・fxSome・fxReduce と order）に各武器のファイルの `effects`（`public/js/weapons/<武器>.js`、道具は `public/js/game/weapon-api.js`）が登録する。
ダメージは `public/js/game/combat.js` dealDamage・stunValue が、能力値（stats.js の S・buffMod・addBuff）・武器ツリーの W・差し込み口・称号（rules.titleDmg など）を使って決める。
これを GDScript に移し、**同じ状態・同じ入力で、元の JavaScript と同じダメージ・会心・スタン値・サーバーへの送信・状態の変化になる**ことを照合で確かめる。

## 種類
B（移植と道具）。ゲームへのつなぎ込み（game.gd・combat.gd）は次の作業（G1-3b）なので、この作業ではしない。

## 元にするもの（読む）
- `public/js/game/weapon-fx.js`・`weapon-api.js`・`weapons/index.js`、`public/js/weapons/sword.js`・`greatsword.js` の effects と、それが呼ぶもの
- `public/js/game/combat.js`（dealDamage・stunValue・TYPE_MOD・番兵の盾 GUARD_ARC・GUARD_PASS）、`stats.js`（buffMod・addBuff・バフの扱い）、`public/js/game/ports.js`（rules・state・stats の窓口。称号の rules.tf・titleDmg・wtCritAdd・wtDmgMult など）
- 既にある GDScript: `godot/worldart/scripts/game/skills/`（ctx・wtree・sword・greatsword・skills）、`scripts/game/rules.gd`（calc_stats）
- 照合の道具の書き方: `tools/worldart/godot/golden_rules.mjs`（wirePorts で最小のダミーを差し込んで元の calcStats を呼んでいる）・`golden_skills.mjs`、`scripts/tests/rules_golden.gd`・`skills_golden.gd`

## 作るもの（触ってよいファイル）
1. `tools/worldart/godot/golden_combat.mjs`（新規）→ `godot/worldart/data/combat_golden.json`: 元の JavaScript を wirePorts で動かし（ブラウザの部分はダミー）、次の場面ごとに入力と結果を書く。乱数は種固定（Math.random を差し替え）、時刻（now）も固定の値
   - 武器: 片手剣・大剣。武器ツリー: なし・各クラス（ks1）・各マスター（ks2）・各パッシブの lv1〜3 と A/B（wtLearn・wtChoose で作る）
   - 攻撃の種類: normal・heavy・wskill・tskill・dot、オプション（crit・stun・falloff・exec・sv など技が渡すもの）
   - 敵: 雑魚・精鋭・ボス（kind 2）、スタン中、HP の多い／少ない、番兵の盾（guard と向き）、潜っている（burrow）
   - 自分: HP の多い／少ない、バフ（atkp・dmgp・crit・heavyp・stunp など）、ambush、ガードの攻撃ボーナス
   - 結果: サーバーへの送信（`hit` の dmg・crit・st など全部）、敵の hp、自分の状態の変化（ambush など）、差し込み口が呼んだ fx・音・文字など（記録だけ）
   - 片手剣と大剣の effects を、差し込み口の場面ごとに直接呼ぶ場面も入れる（強攻撃を押した・溜め・被弾・回避・JUST・ガードなど、effects が登録している場面すべて）
   - **全武器の effects を登録した状態で回す**（元のゲームと同じ。ほかの 4 武器の効果は、そのノードを持っていなければ働かない前提。働いてしまう場面があれば報告）
2. GDScript（新規）: `scripts/game/combat/weapon_fx.gd`（差し込み口と order）、`scripts/game/combat/damage.gd`（dealDamage・stunValue・buffMod・addBuff）、`scripts/game/combat/api.gd`（weapon-api.js の道具）、片手剣と大剣の effects（`scripts/game/skills/sword.gd`・`greatsword.gd` に足すか、`scripts/game/combat/fx_sword.gd`・`fx_greatsword.gd`）。表は game.json から（手で写さない）
3. `scripts/tests/combat_golden.gd`（新規）: 上の場面を同じ入力で動かし、数は 1e-6、辞書はキーの集合も同じで比べる。出力は他の照合と同じ形（suite: `damage_sword`・`damage_greatsword`・`hooks_sword`・`hooks_greatsword`）。全部 OK で終了コード 0
4. `tools/worldart/godot/client_test.sh`: 照合を 1 つ足す（他の照合と同じ形。NG なら ok=1）
5. ほかの 4 武器（短剣・大斧・盾槍・弓）の effects は移さない。ただし、差し込み口の順（order）に関わる場合は、その武器の登録が空でも順だけは同じになるようにする

## 触ってはいけないもの
- `public/`・`test/`（読むだけ）、`game.gd`・`combat.gd`・`visuals.gd`・`rules.gd`・`scripts/game/rig/`、`export_models.mjs`・GLB・生成物、docs、git のコミットとプッシュ

## 完了条件
- `node tools/worldart/godot/golden_combat.mjs` → 場面の件数を表示
- `cd godot/worldart && timeout -k 5 300 godot --headless --path . -s res://scripts/tests/combat_golden.gd` → 4 つの suite が全部 OK、終了コード 0
- `rules_golden.gd`・`skills_golden.gd`・`poses_golden.gd` が今までどおり全部 OK
- 照合が空振りでないこと（式の数を 1 つ変えると NG になる）を確かめて元に戻す

## 返してほしいもの
- 変えたファイルと要点、生の出力の要所、件数、wirePorts で差し込んだダミーの一覧、移しにくかった所とその扱い、ほかの武器の効果が働いてしまう場面があったか
