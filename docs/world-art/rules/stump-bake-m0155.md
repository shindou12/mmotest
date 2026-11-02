# 切り株をブロックアウトから作って焼く（M-0155、2026-11-02）

Stylized Asset Suite の紹介図の流れを、アドオンなしで試した。道具は `tools/worldart/blender/build_stump_bake.py`（Blender 4.2.23、Cycles）、絵は `art/painted-gen/stump/`（Luna の image_generation）、結果は `public/worldart/assets/stump_b.glb`。

## 流れ
1. 密な格子で形を作る（約 8 万頂点）
2. 木の皮・切り口・苔・細部の絵を生成する
3. 色のむら・曲率・AO・苔をノードで重ね、1024 四方の 1 枚に焼く。太陽の光は焼かない
4. 3,800 三角形に減らし、キノコ 3 本と落ち葉 3 枚を足す（計 4,532 三角形）

投影方式（生成した 1 枚を形に投影する）は、視点ごとの絵のずれと継ぎ目が出やすいので使っていない。

## 判断: 流れは使える。今の切り株の出来は不合格
- **動いた:** 形から GLB まで 1 本のスクリプトで作り直せる。image_generation の絵も、地図の光の中でそのまま使えた。
- **33m のカメラ:** 周りとなじみ、切り株に読める。切り口とキノコも読める。
- **寄ると布に見える:** 溝がなめらかな折り目で、根が薄い裾に広がり、テーブルクロスのよう（`art/shots/painted_glade/v3/stages.webp`）。
- **木の皮に見えない:** `bark.png` が丸い鱗の模様で、紅葉の塊のように読める。紹介図の縦に長い板と違う。
- **苔が弱い:** ほとんど見えない。

形が読めないと、焼いても良くならない。M-0153 と同じ結論。

## 次に直すなら（未検証）
1. 形: 溝を折り目でなく V 字に鋭く刻む。根は薄い裾でなく、断面の丸い太い筒にして、幹の板から分かれさせる。
2. 木の皮: 縦に長い板の絵に生成し直し、繰り返しを細かくする。
3. 苔: 根元と根の上に、はっきり乗るまで強くする。

## 手順の注意
- Luna は指定と違う Blender 5.2.2 で動かしていた。Blender はフルパスで指定する。
- 形づくりは Luna で届かず、Sol high（`gpt-6.1-sol`）に渡した。Sol は卵の形を直したが、布の形になった。言葉の指定だけでは形が届きにくい。
- 参考: https://www.strayspark.studio/blog/curvature-maps-blender-substance-painter-alternative（ポイントネスは低ポリで荒れる）、https://blenderartists.org/t/assetgen-create-a-game-asset-in-a-single-click/702849（1 枚の色に焼く考え方）
