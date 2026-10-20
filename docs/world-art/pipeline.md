# 新しいアセットと地図を作って画面に出す手順

規則と数値は **`rulebook.md`（第 3 世代）**。ここは操作の順番・確認点・よくある失敗です。新しい地図は `templates/map-gen3.json` から始めます（下の 3 の「既存の JSON を複製」の代わり）。

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
9. 確認点: 数値は rulebook の 13.2（見本と同じ道具 refstats・rulecheck で測った値。第 2 世代の「輝度比 2.9〜3.4・彩度 ≈0.4」は R 系列の動画から取った値で、撮り方で変わる）。樹冠が画面に入っている、影の塊がある、手前の物が人物を隠さない、歩いて水に入らない。

## 3b. 第 2 世代の地図を第 3 世代の規則へ移す
`python3 -I tools/worldart/maps/to_gen3.py <名> …` → `<名>_g3.json`（元は残す。手で直さず、元の地図か規則か to_gen3.py を直す）→ `build_map.py -- <名>_g3`。アセットの置き換え（maple2・fir3・rock_s）も to_gen3.py の REP。アセットを足したら `build_assets.py` を全部実行し直す（決定的なので、変わるのは直した物だけ。変わった GLB を一覧で確かめる）。

## 4. 検証のループ（第 3 世代、見本②で使った手順）
1. `node tools/worldart/views.mjs <地図> art/shots/<地図>/Lnn <ビュー,…>`（見本のカメラ B01… と固定ビュー oblique/side/top/walker/near/far@基準。1 回の読み込みで撮る。サーバーがなければ立てる）
2. `python3 -I tools/worldart/viewsheet.py art/shots/<地図>/Lnn art/shots/<地図>/Lnn/sheet.png`
3. `python3 -I tools/worldart/refstats.py <撮影> <見本>` と `python3 -I tools/worldart/rulecheck.py <撮影> <見本>`（同じ道具で両方を測る）
4. 入／切: `sh tools/worldart/abshoot.sh art/shots/ab` → `python3 -I tools/worldart/abcompare.py <切> <入> <拡大.png>`
5. 記録: `goal-<地図>.md`・`rules/ideas.md`・この文書の 5・`rulebook.md`。`python3 -I tools/worldart/pack_shots.py <フォルダ>` で webp に。
6. 歩ける比較: `python3 -I tools/worldart/compare/build.py <出力> [L22 のコミット]` → 出力の index.html を Artifact のページに、残りを files に。

## 4b. 実験のしかた
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
| F6 | 崖が敷石・タイルに見える | 岩肌の絵がボロノイの網目（同じ大きさの閉じた網目） | 横の層 + 縦の割れ目の絵。第 3 世代の rock_face は縦に伸ばした大小の板・途切れる割れ目・大きなむらで敷石に見せない（rulebook 7.1） |
| F7 | 水の面にひびの線 | 水のノイズに岩肌の絵を流用 | なめらかな絵（砂）をノイズに使う |
| F8 | 地面が「×」の模様 | 十字の縦の草カード | 外へ倒した 5 枚の房 |
| F9 | 全体がくすんで灰色 | 仕上げで全体の彩度を下げた | 地色の彩度と光の色で作る |
| F10 | 房の中まで真っ暗 | 葉が自分の影を受けている | 第 2 世代の丸い房の木は、葉は影を受けない（落とすだけ）。第 3 世代の段の房の木（maple2）は受ける方がよい（rulebook 4.3） |
| F11 | 規則を足したら関係ない木の位置が変わった | 乱数を全規則で共有 | `rule_rng(名前)` で系列を分ける |
| F12 | `const` の初期化前参照で画面が真っ黒 | `placeCamera()` が後で定義した `OCC` を使った | 共有の値はファイルの先頭で定義する |
| F13 | もみがリュウゼツランの束に見える | シダの葉の絵が細長いひし形 | 根元の広い三角形 + とがった小羽片（`leaf_frond`） |
| F15 | 絵を変えたのに画面が変わらない | GLB は書き出しの時点の絵を埋め込む | `textures*.py` のあと `build_assets.py` も実行する |
| F16 | 画面の位置で置いた木が手前で巨大になる | 段差で注目点の地面が 0 でなくなり、高さ 0 前提の逆算がずれた | `build_map.py` が注目点の地面を 0 にそろえる。台地の上の木は `base` で高さを渡す |
| F17 | 樹冠がすかすかのレース、枝が黒く透ける | 葉の絵の不透明な部分が 20〜30% | 葉の塊の絵（円の中 85%）にする |
| F18 | 葉が地紋（雑音）に見える | アセットを縮めて置いた / 絵が細かすぎる | 実寸で作る。いちばん細かい形は画面で 3〜4px 以上 |
| F19 | 崖の岩が台地の上に並ぶ | `low: near` のとき低い側の向きを反転していなかった | `build_map.py` で near を反転 |
| F20 | 別の地図で砂浜が草地になる | 地形の高さの基準を地図全体でずらした（水面・砂の帯の基準も動く） | 高さをそろえるのは `terrain.anchor: true` の地図だけ。規則を変えたら全部の地図を撮り直す |
| F21 | 崖が灰色の歯（柱）の列や積んだ板に見える | 崖を「置いた岩の列」で作った。見本の崖は岩肌の一部に草が乗っているだけ（ユーザーの指摘、L15） | 崖は地形の面そのもの: `relief`（面の起伏）+ 角ばった板と真っすぐな割れ目の `rock_face`（ground.rock = "face"、4.5m で貼る）+ 上半分に草 `drape`。置く岩は崖の足元の点景だけ |
| F22 | 見本と並べると物がみな大きい | 尺度を物どうしで決め、人物（画面の高さ 0.12 = 1.7m）から測っていなかった（L10） | 見本の人物の高さから 1m が画面の何割かを出し、天幕・木箱・樹冠・ヤシの幅を格子で測って合わせる。木を縮めて骨だけになるなら、小さく詰まった別の木を作る |
| F23 | 低い崖の面が草と岩の三角の歯の列に見える（とくに歩行者・横のビュー） | 岩・草の垂れを頂点ごとに決めて補間した。崖の面が 1〜2 マスしかなく、三角の対角線で境がのこぎり状になる。補間した法線でも同じ | ground.rockPix: 岩は画素ごとに三角の面の向き（dFdx/dFdy の外積）で決め、苔は三方向から貼ったノイズの斑で抜く。頂点の草の垂れ（drape）は面が広い崖（B03）だけに使う。草の絵も三方向から貼る |
| F24 | 草の房の色や葉の明るさが、設定を変えても思ったように変わらない（L22 で発見、L21 までの全撮影に影響） | three.js はシェーダーを onBeforeCompile の関数の文字列で使い回す。同じ関数の中で分岐する材質（草・葉・岩）は、設定が似ていると先に作られた方のシェーダーを共有する | 材質ごとに `customProgramCacheKey` で分岐の組み合わせをキーにする（world.js の fixMaterial）。シェーダーに分岐を足すときは必ずキーにも足す |
| F25 | 露出を変えても絵が 1 画素も変わらない、自前の階調圧縮（tone "lum"）の効果を測ったつもりが別のものを測っていた（L22 で発見） | three r160 の OutputPass は CustomToneMapping の定義を作らない。自前の曲線は呼ばれず、階調の圧縮も露出もない「0〜1 で切るだけ」になっていた | 階調の方式を足したら、露出を 2 段変えて画素が変わるかをまず確かめる。world.js は OutputPass に分岐を足して定義を固定した。見本②は linear（露出を掛けて切るだけ）に決めた |
| F26 | 色相を直したのに数値が動かない・場所によって合ったり合わなかったりする（L23） | 画面全体の日なたの色相は、明るい土の道の割合（構図）で動く。太陽の色を変えても地色の色相はほとんど動かない | 色相は同じ材質（緑）の日なた/日陰で比べる（rulebook 1.3）。色は地色（草の grassTint・葉の foliage.tint）で直し、光の色では直さない |
| F14 | 石畳に星形の目地 | ボロノイの点がランダムで石の大きさがばらつく | ゆらぎのある格子の点（`voronoi(grid=True)`） |
