# Godot の式（rules.gd）が元の JavaScript と一致するかの照合テスト

## 目的
`godot/worldart/scripts/game/rules.gd` の式が、移植元の JavaScript と同じ値を返すことを、自動で確かめられるようにする。

## 種類
A（純粋な処理）

## 触ってよいファイル
- tools/worldart/godot/golden_rules.mjs（新規: 元の JavaScript で入力と期待値の組を作り JSON に書く）
- godot/worldart/scripts/tests/rules_golden.gd（新規: Godot を画面なしで動かし、同じ入力で rules.gd を呼んで比べる）
- godot/worldart/data/rules_golden.json（新規: 上の組。golden_rules.mjs が書く）
- tools/worldart/godot/client_test.sh（末尾に、この照合を 1 行足すだけ）

## 触ってはいけないもの
- rules.gd そのもの（食い違いを見つけたら直さずに報告する）、ほかの Godot のスクリプト、public/ の JavaScript、生成物（GLB・.blend・art/）、docs/world-art/rulebook.md、git のコミットとプッシュ

## 守る約束
- 照合する関数と移植元: collide（public/shared/areas.js collide。屋外 f1_field・f1_town と屋内 f1_dun、扉の開閉の両方）、in_shape（public/shared/data.js inShape。circle・ring・cone・line）、bound_r（areas.js boundR）、ang_diff（data.js angDiff）、calc_stats（public/js/game/stats.js calcStats のうち、装備の基礎値・強化・付加効果・防具の基本効果・重さ。ツリー・称号は対象外なので、入力の装備はツリーなしで作る）、xp_to_next（data.js xpToNext）
- 入力は種を固定した乱数で、各関数 200 組以上。座標はエリアの輪郭の内外・障害物のそば・壁のそばを含める
- 数値の比較の許容差は 1e-6（calc_stats の丸めを含む値は元と同じ丸め）
- Godot は `godot --headless --path godot/worldart -s res://scripts/tests/rules_golden.gd` で動くこと（画面なし）

## 完了条件
- `node tools/worldart/godot/golden_rules.mjs` → `godot/worldart/data/rules_golden.json` を書き、件数を表示
- `cd godot/worldart && godot --headless --path . -s res://scripts/tests/rules_golden.gd` → 関数ごとに「OK n 件」か「NG（最初の 3 件の入力・期待値・実際の値）」を表示し、全部 OK なら終了コード 0
- `sh tools/worldart/godot/client_test.sh` の最後に、照合の結果が 1 行出る

## 返してほしいもの
- 変えたファイルと要点、上のコマンドの結果（生の出力の要所）、NG があればその関数と入力の例（rules.gd は直さない）
