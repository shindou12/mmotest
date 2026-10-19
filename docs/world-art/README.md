# ワールドアート研究（参考画像のアートスタイルを再現・展開する）

再開するときは、このファイル → `experiments.md` の最後 → 「次にやること」の順に読む。

## 目標
参考画像（Ragnarok Online 3 のキャプチャ、`art/ref/` と `observations.md`）のワールドマップの見た目を解明し、
Blender でのアセット制作から three.js の画面まで、一貫して作れる制作体系にする。人物と製品用 UI は対象外。

## ファイルの地図
| 場所 | 中身 |
|---|---|
| `docs/world-art/observations.md` | 参考画像の ID・観察・計測・未解決の問い |
| `docs/world-art/hypotheses.md` | 仮説と競合仮説、先行研究（`docs/ro-look-method.md`）の検証状態 |
| `docs/world-art/experiments.md` | 実験 ID ごとの変更・固定条件・結果・結論、履歴 |
| `docs/world-art/style-spec.md` | 制作仕様（確定した規則と数値） |
| `docs/world-art/pipeline.md` | 新しいアセット・地図を作って画面に出す手順 |
| `tools/worldart/textures.py` | テクスチャを描く（Python + numpy + PIL、シード固定）→ `public/worldart/tex/` |
| `tools/worldart/blender/build_assets.py` | アセットを Blender で作る → `art/blender/assets.blend` と `public/worldart/assets/*.glb` |
| `tools/worldart/blender/build_map.py` | 地図の仕様から地形と配置を作る → `public/worldart/maps/<名>/` と `art/blender/<名>.blend` |
| `tools/worldart/blender/preview.py` | GLB を Blender に読み戻して並べて描く（書き出しの往復の検査） |
| `public/worldart/maps/<名>.json` | 地図の仕様（カメラ・光・地形・道・区域・配置・仕上げ）。手で書く唯一の入力 |
| `public/worldart/world.js` + `index.html` | 実行環境（three.js r160） |
| `tools/worldart/shot.mjs` / `compare.py` / `refstats.py` | 撮影・見本との比較・色の計測 |
| `art/shots/` | 撮影と比較の画像（webp） |

## 実行方法
```sh
npm ci                                   # three と ws
# Blender 4.2 LTS が要る（このセッションでは /opt/blender-dl に展開し /usr/local/bin/blender にリンク）
python3 -I tools/worldart/textures.py                                          # 1. テクスチャ
blender -b --factory-startup --python tools/worldart/blender/build_assets.py   # 2. アセット
blender -b --factory-startup --python tools/worldart/blender/build_map.py -- orc_meadow   # 3. 地形と配置
PORT=8091 node server.js &                                                      # 4. 表示
#   http://localhost:8091/worldart/index.html?map=orc_meadow          （walk=1 で WASD で歩ける）
node tools/worldart/shot.mjs "http://localhost:8091/worldart/index.html?map=orc_meadow" art/shots/orc_meadow/vNN.png
python3 -I tools/worldart/compare.py art/shots/orc_meadow/vNN_cmp.png art/ref/R01.webp art/shots/orc_meadow/vNN.png --gray
python3 -I tools/worldart/pack_shots.py   # PNG を webp にしてからコミット
```
依存: Blender 4.2.23 LTS、Node 22、three 0.160、Python 3（numpy, PIL）、playwright（/opt/node22 の全体インストール）。

## 現在の状態（最良版）
- orc_meadow（R01 の再現）: `art/shots/orc_meadow/v13.webp`
- south_coast（同じ規則で作った別の地図・崖と海）: `art/shots/south_coast/v07.webp`、歩いたとき `walk_sheet.webp`
- town_plaza（同じ規則で作った町の通り）: `art/shots/town_plaza/v03.webp`
- 3 枚の並び: `art/shots/all_v.webp`
- **forest_path（B03 の再現、第 2 世代のアセット）: `art/shots/forest_path/v28.webp`** ← いまの主な対象
- **palm_clearing（第 2 世代の規則で作った新しい地図、B02 が手がかり）: `art/shots/palm_clearing/v05.webp`**
- まとめ: `art/shots/batch2_summary.webp`
- 詳細と経緯は `experiments.md` の「履歴」。

## 残っている主な差（未完了）
- orc_meadow と R01: 輝度比 2.65（見本 3.08）、日なたの草の色相 61°（見本 67°・彩度 0.38 対 0.49）、
  見本の上端の海と大きな暗い樹冠、拒馬の杭の明るい木口が白すぎる、オークの村の小物（骨の山・杭・樽）がない。
- R06〜R18 はファイルがなく数値で比べていない（海辺と町は目視の規則のみ）。洞窟（R14〜R17）は手を付けていない。
- 実機の FPS は未計測。家に当たり判定がない（通り抜けられる）。

## 次にやること（優先順）
1. 町を見本の密度に: 手すり・花箱・屋台・ドーマー窓、R04 のドーム状の石の家。家の当たり判定（今は歩いて通り抜けられる）。
2. 葉の絵の質: もみの上の段が細い、ヤシの葉の中肋。樹冠の日なたの黄色いハイライト。
3. 草の房を日陰で暗い星に見せない、道の縁に草を食い込ませる。
4. 見本の R06〜R18 のファイルを受け取り、`refstats.py` で数値の目標を地図の種類ごとに取り直す（とくに R07 と R12）。
5. 画角の再測定（町の建物の縦線で）。
6. 重さ: 草の房の LOD（E05 で効果が小さいと確認済み）、葉の板の数。

