# 人物の姿勢（動き）を GDScript に移し、元の行列と照合する（G2-1）

## 目的
ブラウザ版の人物の動きは、毎フレーム関数で各部品（体・頭・腕・肘・手・脚・マント・武器・盾）の回転と位置を決めている（`public/js/models.js` animatePlayer → `player-motion.js`・`pose-rig.js`・`motions/*.js`・各 `weapons/<武器>.js` の motion の部分）。
これを GDScript に移し、**元と同じ状態を与えたときの各部品の世界行列が、元の three.js と 1e-4 以内で一致する**ことを自動で確かめる。メッシュ（GLB）はこの作業では作らない（骨組みだけ JSON で渡す）。

## 種類
B（移植と道具）

## 元にするもの（読む）
- `test/golden/pose-trace.mjs`（記録のしかた。ハッシュは `test/fixtures/golden-poses.json`、テストは `test/golden-poses.test.js`）
- `public/js/models.js`（makePlayer・setPlayerWeapon・animatePlayer）、`public/js/player-motion.js`・`pose-rig.js`・`motions/index.js`・`melee.js`・`styles.js`、`public/js/weapons/*.js` の motion・構え、`public/js/spear-motion.js` など animatePlayer から呼ばれるもの全部
- `public/shared/motion-catalog.js`・`tree-motions.js`・`techniques.js`

## 作るもの（触ってよいファイル）
1. `tools/worldart/godot/export_rig.mjs`（新規）:
   - `godot/worldart/data/rig.json`: makePlayer の骨組み（部品の名前・親・休みの位置・回転（オイラー XYZ）・拡大）と、setPlayerWeapon で武器 6 種 × 形 0〜3 を付けたときの武器・盾の取り付け（親・位置・回転・拡大）。animatePlayer が読む userData の値（握る位置など）も
   - `godot/worldart/data/poses_golden.json`: pose-trace.mjs と同じ入力の、**ハッシュにする前の** sample の値（キーも同じ: `motion/<id>/<武器>`・`basic/<武器>/<形>`）と、その入力の状態
   - **自己確認**: 各キーの生の値を pose-trace.mjs と同じ方法でハッシュにし、`test/fixtures/golden-poses.json` と一致することを確かめる（違えば止まる）
2. 表: モーションの表（TREE_MOTIONS・TECHNIQUES のうち動きに使うもの・MOTION_DURATIONS・styles.js の型）は JSON で渡す（rig.json か `data/motions.json`）。手で写さない
3. `godot/worldart/scripts/game/rig/player_rig.gd`（新規）: animatePlayer の移植。部品は名前 → Node3D の辞書で受ける（あとでゲームの GLB の同じ名前の部品を動かす）。three.js のオイラー XYZ と同じ回転順（`rotation_order`）にする
4. `godot/worldart/scripts/tests/poses_golden.gd`（新規）: rig.json から Node3D の骨組みを組み、poses_golden.json の各キーの状態を与えて、sample と同じ順の値（visible と世界行列 16 個、three.js の列優先の並び）を作り、1e-4 で比べる。出力は `scripts/tests/rules_golden.gd` と同じ形（suite ごとに OK n 件／NG と最初の 3 件、全部 OK で終了コード 0）
   - suite: `basic`（全武器・全形）、`motion_greatsword`・`motion_sword`（その武器のモーション）、`motion_other`（ほかの 4 武器と共通のモーション）。**この作業の完了は basic・motion_greatsword・motion_sword が全部 OK**。motion_other は件数と OK の数を報告（全部 OK でなくてよい）

## 触ってはいけないもの
- `public/`・`test/`（読むだけ）、既存の Godot のスクリプト（game.gd・visuals.gd・rules.gd など）、`tools/worldart/godot/export_models.mjs`・GLB・生成物、`client_test.sh`、docs、git のコミットとプッシュ

## 完了条件
- `node tools/worldart/godot/export_rig.mjs` → 自己確認が全キー一致、件数を表示
- `cd godot/worldart && godot --headless --path . -s res://scripts/tests/poses_golden.gd` → basic・motion_greatsword・motion_sword が全部 OK（motion_other は件数を出す）
- 既存の `rules_golden.gd` が今までどおり全部 OK

## 返してほしいもの
- 変えたファイルと要点、生の出力の要所、three.js と Godot の違い（回転順・行列の並び・visible など）で気をつけたこと、移しにくかった所
