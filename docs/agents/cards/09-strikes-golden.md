# ゲームの中の当たり（strikes の arc・line・circle・proj・arrow と投射物の毎フレーム）を照合する（G4）

## 目的
技の照合（skills_golden）は「技がどの strikes をどんな引数で呼んだか」までを見ている。その先の「その形で、どの敵に、どの倍率で当たるか」と「投射物（斬撃波・光波・矢・戻る斧・罠など）が毎フレームどう動き、いつ誰に当たり、いつ消えるか」は、`scripts/game/skills/game_ctx.gd` の手の移植で、照合がない。
これを元の JavaScript（`public/js/game/actions.js` buildCombat の strikes、`loop.js` の投射物の更新 updateProjs と矢）と照合する。

## 元にするもの（読む）
- `public/js/game/actions.js`（senses・strikes・feedback）、`public/js/game/loop.js`（投射物・矢・戻る飛び道具・罠の毎フレーム）、`public/js/game/weapon-fx.js`（strikes が呼ぶ差し込み口: hitOpts・reach・arrowTick・arrowEdge・arrowHit・arrowGone など）
- `scripts/game/skills/game_ctx.gd`（strike_arc・line・circle・proj・arrow・update_projs・_update_arrow・boomerang_step・proj_revive）、`scripts/game/combat/damage.gd`
- 照合の流儀: `tools/worldart/godot/golden_combat.mjs`（wirePorts）・`scripts/tests/combat_golden.gd`

## 作るもの・変えるもの
1. `tools/worldart/godot/golden_strikes.mjs`（新規）→ `godot/worldart/data/strikes_golden.json`（git に入れない。`.gitignore` に 1 行足す）: 元の strikes と投射物の更新を wirePorts で動かす。dealDamage は「呼ばれた（敵の id・倍率・オプション）」を記録するだけのダミーに差し替える（ダメージの式は combat_golden で照合済み）
   - 場面: 自分の位置と向き、敵を数体（位置・半径・向き・hp・潜っている・番兵の盾）、倒れた仲間（reviveHit）、各 strikes を代表的な引数で（arc の角度と射程、line の始点と幅、circle の reach と a、skip）
   - 投射物: 斬撃波・光波・大きな光波（月蝕など）・矢（貫通・射程・毒・会心・遠矢）・戻る斧（行き・回る・戻る・捕まえる）・罠を、固定の dt（1/60）で消えるまで回し、フレームごとの位置と当たり（敵の id・倍率・オプション）と消えた時刻を記録
2. game_ctx.gd の strikes と投射物の更新を、照合しやすい純粋な関数（入力: 自分・敵の一覧・仲間・引数・dt、出力: 当たりの一覧と投射物の状態）に分け、ゲームはそれを呼ぶ形にする（振る舞いは変えない。見た目のノードの更新は分けた関数の外に）
3. `scripts/tests/strikes_golden.gd`（新規）: 同じ場面で純粋な関数を動かし、数は 1e-6、辞書はキーの集合も同じで比べる。suite: `arc`・`line`・`circle`・`proj`・`arrow`・`boomerang`・`trap`
4. `client_test.sh`: 照合を 1 つ足す（他と同じ形）。`strikes_golden.json` がなければ作る行も

## 触ってはいけないもの
- `public/`・`test/`（読むだけ）、`scripts/game/combat/hurt.gd`・`variants.gd`（別の作業 08 が作っている）、`game.gd`、`scripts/game/rig/`、`player_model.gd`、docs、git のコミットとプッシュ
- game_ctx.gd は strikes と投射物の部分だけ（別の作業 08 がガード・反応・スキル変化のために同じファイルの別の所を少し変える。統合は Opus）

## 完了条件
- `node tools/worldart/godot/golden_strikes.mjs` → 場面の件数
- `strikes_golden.gd` が全部 OK（食い違いが見つかったら、game_ctx.gd の方を元に合わせて直す。直した所を報告）
- skills・combat・rules・poses の照合と `client_test.sh` が全部 OK
- 照合が空振りでないこと（arc の角度の式を 1 つ変えると NG）を確かめて元に戻す

## 返してほしいもの
- 変えたファイルと要点、見つかった食い違いと直し方、生の出力の要所
