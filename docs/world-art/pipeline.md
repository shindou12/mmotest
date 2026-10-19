# 新しいアセットと地図を作って画面に出す手順

規則と数値は `style-spec.md`。ここは操作の順番・確認点・よくある失敗です。

## 0. 準備（初回だけ）
```sh
npm ci
# Blender 4.2 LTS（このリポジトリの検証は 4.2.23）
curl -O https://download.blender.org/release/Blender4.2/blender-4.2.23-linux-x64.tar.xz
tar xf blender-4.2.23-linux-x64.tar.xz && ln -sf $PWD/blender-4.2.23-linux-x64/blender /usr/local/bin/blender
# GPU のない Linux で EEVEE を使うなら: apt-get install -y libegl1 libegl-mesa0 libgbm1
PORT=8091 node server.js &
```

## 1. 再生成できるもの / 手作業が要るもの
| 物 | 再生成 | 入力 | 手作業 |
|---|---|---|---|
| テクスチャ | `python3 -I tools/worldart/textures.py` と `textures2.py`（第 2 世代の葉・岩） | 関数の中の色・数・シード | 新しい絵柄の関数を書く |
| アセット（GLB と assets.blend） | `blender -b --factory-startup --python tools/worldart/blender/build_assets.py` | `ASSETS` の表 | 新しい形の関数を書く。Blender で形を直したい場合は下の 4 |
| 地形と配置 | `blender -b --factory-startup --python tools/worldart/blender/build_map.py -- <名>` | `public/worldart/maps/<名>.json` | 地図の JSON を書く（構図・道・崖・区域・小物） |
| 実行画面 | 不要（ページを開くだけ） | 上の出力 | なし |

全部シード固定。同じ入力からは同じ出力になる（規則ごとに乱数の系列が分かれている）。

## 2. 新しいアセットを作る
1. 絵が要るなら `textures.py` に関数を足す（アルファ抜きの葉は `leaflet_poly` を組み合わせる。端がつながる地面は `tiled_draw` と `fnoise`）。
   **確認**: 512px の中で葉 1 枚が 60〜120px（画面で読める大きさ）。地面の絵は 2×2 に並べて継ぎ目が見えないこと。
2. `build_assets.py` に形の関数を足し、`ASSETS` に登録する。部品は次を使う:
   - `tube()` 幹・枝・杭（UV の u は 0〜0.5 が樹皮、0.5〜1 が木口）
   - `leaf_clump()` 葉の房（法線は外向き、頂点色で AO）
   - `frond_strip()` 垂れる枝カード（もみ・ヤシ）
   - `card()` 単独のカード、`rock()` 岩、`tint_variant()` 葉の色違い
   材質の名前で実行環境の扱いが決まる: `leaf*`・`grass` は葉（アルファ抜き・両面・影は受けない）、それ以外は不透明。
3. 実行して `public/worldart/assets/assets_report.json` を見る: 寸法（`style-spec.md` 5 の表に合うか）、`zmin`（−0.3〜0、根元が地面）、三角形の数、材質、頂点色の数 1。
4. 往復の検査: `blender -b --factory-startup --python tools/worldart/blender/preview.py -- public/worldart/assets art/shots/assets/preview.png`
   GLB を読み戻して描く。**確認**: 色が壊れていない（ピンク・水色が出たら下の失敗 F1）、葉が抜けている、影が落ちる。
5. Blender で手で直したいとき: `art/blender/assets.blend` を開いて直し、そのオブジェクトだけ glTF で書き出す
   （Y 上、法線・頂点色 ACTIVE・適用済み）。**ただし `build_assets.py` を再実行すると上書きされる**ので、手で直したものは別名で登録する。

## 3. 新しい地図を作る
1. `public/worldart/maps/` の既存の JSON を複製する。カメラ・太陽・空・`albedoSat`・`foliage`・`post` は規則なのでそのまま。
2. 位置の書き方を選ぶ:
   - 見本の 1 枚を再現するなら `"screen": [u, v]`（画面の位置。カメラから地面へ投げる）。木は `"canopy": [u, v]` で樹冠の見える位置から置ける。
   - 歩き回る地図なら `"world": [x, z]`（x 右、z 手前、m）。
3. 地面の種類: `terrain.ground` が `grass`（既定）/ `sand` / `alt`（全面を `ground.alt` の絵、例 `cobble`）。`paths` の `mat` は `dirt` / `sand` / `grass`（草の帯で他を抜く）。
   地形: `terrain.hills`（起伏）、`terrain.cliffs`（段差。`lowPoint` で低い側、`drop`・`width`・`jag`、`rocks` で崖に岩を張る）、
   `terrain.bands`（高さで砂/土を塗る）、`terrain.water`（水面の高さと色）。
4. 構図: 画面のどこに明るい通路、どこに影の塊（林）、どこに見せ場を置くかを先に決める。**背の高い木の樹冠を見せるなら根元を画面の下半分に。**
5. `paths`（道）、`zones`（林・ヤシの区域）、`trees`（決めた位置の木）、`lines`（柵を線に沿って）、`props`（小物）、`scatter`（草・茂み・小石・浜の草）。
6. 組み立て: `blender -b --factory-startup --python tools/worldart/blender/build_map.py -- <名> [--render]`
   - 標準出力の `PLACED` で各アセットの数を確かめる（0 のものがあれば規則の条件を見直す。失敗 F4）。
   - `--render` で `art/shots/<名>/blender_view.png`（Blender で同じカメラから描いた絵）。`art/blender/<名>.blend` を開けばゲームのカメラから見られる。
7. 表示: `http://localhost:8091/worldart/index.html?map=<名>`（`walk=1` で WASD）。
8. 撮影と比較:
   ```sh
   node tools/worldart/shot.mjs "http://localhost:8091/worldart/index.html?map=<名>" art/shots/<名>/v01.png
   python3 -I tools/worldart/compare.py art/shots/<名>/v01_cmp.png <見本> art/shots/<名>/v01.png --gray
   node tools/worldart/walktest.mjs "http://localhost:8091/worldart/index.html?map=<名>" art/shots/<名>/walk "x,z" "x,z"
   python3 -I tools/worldart/pack_shots.py
   ```
9. 確認点: 輝度比 2.9〜3.4・彩度 ≈ 0.4（草地）、樹冠が画面に入っている、影の塊がある、手前の物が人物を隠さない、歩いて水に入らない。

## 4. 実験のしかた
- URL の引数で 1 つだけ変える（`fov pitch dist sunEl sunAz sun hemi skyC gndC sunC asat sat exposure wrap trans leafShadow grass dof post shadow fnorm`）。
- 3 本まで並べて撮れる（4 コア。swiftshader は 1 枚 20〜120 秒）。
- 結果は `experiments.md` に ID・変更・固定条件・画像・数値・判定を書く。効いた数値は地図の JSON と `style-spec.md` に入れる。

## 5. よくある失敗
| ID | 症状 | 原因 | 直し方 |
|---|---|---|---|
| F1 | 幹がピンク・水色、葉に青い斑点 | Blender で UV 層を作った後に色の層を足し、先に取った UV 層の参照に書いた | 層を全部作ってから名前で取り直す（`Builder.build`） |
| F2 | 撮影がタイムアウト | 大きな木の葉の重なりで、ソフトウェア描画の 1 枚が 90 秒超 | `tools/worldart/shot.mjs`（ループを止めて 1 回描く） |
| F3 | カメラの前に巨木が立って画面をふさぐ | 木を 2 倍にし、樹冠の画面位置から幹を逆算した | 木は 0.9〜1.3 倍。小物の誇張を木に使わない |
| F4 | ある木が 1 本も置かれない | 置く条件に地図専用の判定（高さ < −1 は崖の向こう）が残っていた | `dry()`（水面より上か）で判定する |
| F5 | 幹だけが柱のように並び、樹冠が見えない | 根元を画面の上端近くに置いた | 根元を下半分に / 樹冠の位置で置く（`canopy`） |
| F6 | 崖が敷石・タイルに見える | 岩肌の絵がボロノイの網目 | 横の層 + 縦の割れ目の絵 |
| F7 | 水の面にひびの線 | 水のノイズに岩肌の絵を流用 | なめらかな絵（砂）をノイズに使う |
| F8 | 地面が「×」の模様 | 十字の縦の草カード | 外へ倒した 5 枚の房 |
| F9 | 全体がくすんで灰色 | 仕上げで全体の彩度を下げた | 地色の彩度と光の色で作る |
| F10 | 房の中まで真っ暗 | 葉が自分の影を受けている | 葉は影を受けない（落とすだけ） |
| F11 | 規則を足したら関係ない木の位置が変わった | 乱数を全規則で共有 | `rule_rng(名前)` で系列を分ける |
| F12 | `const` の初期化前参照で画面が真っ黒 | `placeCamera()` が後で定義した `OCC` を使った | 共有の値はファイルの先頭で定義する |
| F13 | もみがリュウゼツランの束に見える | シダの葉の絵が細長いひし形 | 根元の広い三角形 + とがった小羽片（`leaf_frond`） |
| F15 | 絵を変えたのに画面が変わらない | GLB は書き出しの時点の絵を埋め込む | `textures*.py` のあと `build_assets.py` も実行する |
| F16 | 画面の位置で置いた木が手前で巨大になる | 段差で注目点の地面が 0 でなくなり、高さ 0 前提の逆算がずれた | `build_map.py` が注目点の地面を 0 にそろえる。台地の上の木は `base` で高さを渡す |
| F17 | 樹冠がすかすかのレース、枝が黒く透ける | 葉の絵の不透明な部分が 20〜30% | 葉の塊の絵（円の中 85%）にする |
| F18 | 葉が地紋（雑音）に見える | アセットを縮めて置いた / 絵が細かすぎる | 実寸で作る。いちばん細かい形は画面で 3〜4px 以上 |
| F19 | 崖の岩が台地の上に並ぶ | `low: near` のとき低い側の向きを反転していなかった | `build_map.py` で near を反転 |
| F14 | 石畳に星形の目地 | ボロノイの点がランダムで石の大きさがばらつく | ゆらぎのある格子の点（`voronoi(grid=True)`） |
