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

## 現在の状態
`experiments.md` の「履歴」の最後の行が最良版。
