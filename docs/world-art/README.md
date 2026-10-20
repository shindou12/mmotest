# ワールドアート研究（参考画像のアートスタイルを再現・展開する）

再開するときは **`rulebook.md`（第 3 世代の規則集）→ このファイル → `goal-mihon2.md` の最新のループ** の順に読む。

## 目標
参考画像（Ragnarok Online 3 のキャプチャ、`art/ref/` と `observations.md`）のワールドマップの見た目を解明し、
Blender でのアセット制作から three.js の画面まで、一貫して作れる制作体系にする。人物と製品用 UI は対象外。
**見本の再現は規則を測る手段で、目的は「どの地図にも使える規則」を得ること**（判断基準は rulebook の 1）。

## ファイルの地図
| 場所 | 中身 |
|---|---|
| **`docs/world-art/rulebook.md`** | **第 3 世代の規則集（いま使う規則・数値・判断基準・検証の目標・落とし穴）。最優先** |
| `docs/world-art/templates/map-gen3.json` | 新しい地図の雛形（第 3 世代の光・階調・仕上げ・地面の色入り。組み立てて撮れることを確認済み） |
| `docs/world-art/rules/` | 見本 23 枚の調査（camera-scale・lighting-post・ground-alpha）、アイデア 18 項目の状態（ideas.md）、入／切の比較（ab-L22.md） |
| `docs/world-art/goal-f1_field.md` | ゲームの第 1 層「ひだまりの草原」を遊びの形のまま第 3 世代で作り直した記録（L25） |
| `docs/world-art/goal-mihon2.md` | 見本②の再現のループの記録（L01〜L22）・評価表・差分一覧・不足している参照 |
| `.claude/skills/world-art/SKILL.md` | 作業の手順の要約（スキル） |
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
| `tools/worldart/views.mjs` / `viewsheet.py` | 固定ビューを同じ条件で撮る（1 回の読み込みで全ビュー）/ 比較シート |
| `tools/worldart/rulecheck.py` | 撮り方に左右されない比（材質ごとの日陰/日なた・青の寄り・階調・上の帯の彩度） |
| `tools/worldart/abshoot.sh` / `abcompare.py` | アイデアの入／切を同じ条件で撮る / 数値と差の大きい所の拡大 |
| `tools/worldart/maps/make_mihon2.py` | 見本②の地図の JSON を作る（区画ごとの見本のカメラ・画面の位置で書く） |
| `tools/worldart/maps/dump_area.mjs` / `make_f1_field.py` | ゲームのエリアの形（輪郭・出口・当たり判定・宝箱）を書き出す / それから f1_field の地図を書く |
| `tools/worldart/gameshot.mjs` / `pairsheet.py` | ゲーム本体の今の絵を地図のビューの位置で撮る / 2 つのフォルダを左右に並べる |
| `tools/worldart/compare/` | 歩ける比較ページ（Artifact「見本② 版くらべ」）の組み立て。過去の版は git から取り出す |
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

## 現在の状態（L23）
- **見本②（`mihon2`）**: 区画つきの地図で B01〜B04 を再現（`art/shots/mihon2/L23/sheet.webp`）。明暗比・彩度・緑の色相が B01・B02・B04 で見本とほぼ一致（rules/ab-L23.md）。残りは B03 の明暗比と B01 の色相（rulebook 16）。
- 歩ける比較ページ: https://claude.ai/artifact/A31scCgQs9tWLQ1dhMAgZQ （L20・L21・L21 修正・L22 を同じ場所で切り替え、アイデア 01・02・04・05 の入／切）。
- 第 2 世代の地図（orc_meadow・south_coast・town_plaza・forest_path・palm_clearing）に第 3 世代の規則を当てた `<名>_g3` を作った（`tools/worldart/maps/to_gen3.py`、L24、結果は `rules/gen3-maps-L24.md`）。元の地図は残している（試遊: https://claude.ai/artifact/4RJANYkdaxpV6FNCyB4smZ ）。比較ページで第 2 世代と第 3 世代を同じ場所で切り替えられる。
- 詳細と経緯は `goal-mihon2.md`（L01〜L22）と `experiments.md`（E01〜E34）。

- **ゲームの第 1 層「ひだまりの草原」（`f1_field`）** を第 3 世代で作り直した（L25、`goal-f1_field.md`）。ゲームの今の絵との比較は `art/shots/f1_field/compare_game.webp`、比較ページの地図「ひだまりの草原」で歩ける。

## 次にやること（優先順）
rulebook.md の「16. 未解決・未検証」が正。要約:
1. B03 の明暗比（2.52 対 2.84）と森の奥の暗さ、B01 の緑の色相 +6°。
2. L24 で場面をまたいで成り立たなかった 3 つ（暗部の浮き・方位の違う地図の緑・町の照り返し、rulebook 16 の A〜C）。
3. 町・砂漠・洞窟を規則だけで作る。
4. 残りのアイデア（03・06〜09・11・14・16）の入／切。
