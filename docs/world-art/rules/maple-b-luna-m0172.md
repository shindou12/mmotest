# maple2_t の案 B と C を詰めて比べた記録（M-0172）

ユーザーの判断は「案 B + Luna の絵が一番いい」。708 三角形のまま、扇形の手描きの房 4 種を水平寄りの屋根瓦に置いた。

## 結果
- `maple2_t` と同じ 708 三角形。GLB は 389KB → 1.8MB（絵が 512 → 1024 で PNG のため）
- 比較: `art/shots/fan_m0172/sol_vs_luna.png`（左から元・B + Luna・B + Sol・C + Sol）
- 7 本並べた画面: `art/shots/fan_m0172/grove.jpg`
- 道具: `tools/worldart/plate_fan.py`、`tools/worldart/key_sheet.py`、`leaf_align.py` の `--uv-grid`、`tree_leaf_cards.py` の `--tones`
- 作り方: `plate_fan.py guide` → Luna が塗る → `key_sheet.py sheet --key 22,50,32 --near 22 --far 50` → `leaf_repaint.py --material leaf_plate --rename leaf_plate` → `leaf_align.py --material leaf_plate --leaf-faces 2 --clumps 6 --up 2.2 --lift 8 --uv-grid 2`

## わかったこと
- **放射状の房は花に読める。** 根元から扇形に広げると中心が消える
- **同じ木を回して 7 本置いても、繰り返しは目立ちにくい。** 房が 4 種あるのと、回転の効果
- **色まで塗った土台から描かせると、輪郭を保てるが筆の調子が揃いすぎる。** Sol に土台なしで描かせると筆の面は一番手描きらしいが、ゲームでは黄色が強く、ユーザーの評価は Luna が上だった
- **葉 1 枚の絵は「葉に見える形」でないと失敗する。** Sol の葉 8 種を案 C に貼ると、白っぽい塊になった

## 残した差
- 緑が鮮やかで、地面の草と古い茂みから浮く
- 木が縦長の柱に見え、幹がほとんど見えない。`maple2_t` の幹の形のまま。見本は太い幹の上に塊が広がる
- 根元が草に隠れず、低い葉が地面の近くで終わる
- `lf_test` の 1 画面でしか見ていない。実際の地図と Godot は未確認
- 線画だけ・外枠だけの土台の試しは作業中
