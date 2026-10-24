---
name: world-art
description: Ragnarok Online 3 風のワールドマップ（public/worldart、Blender → three.js）を作る・直す・見本と比べるときに使う。「ワールドアート」「見本②」「worldart」「新しい地図」「規則集」「アートスタイルを量産」と言われたとき。
---

# ワールドアートを作る・直す（第 3 世代の規則）

自己流で作らない。規則と数値は文書にある。

1. `docs/world-art/rulebook.md` を最初から最後まで読む（規則・数値・判断基準・検証の目標・落とし穴）。食い違ったら rulebook が優先。
2. 新しい地図は `docs/world-art/templates/map-gen3.json` を `public/worldart/maps/<名>.json` に複製して、地形・道・区域・木・小物だけを書く。光・階調・仕上げ・地面の色は規則なので変えない。
3. 組み立て: `blender -b --factory-startup --python tools/worldart/blender/build_map.py -- <名>`（`PLACED` で各アセットの数を確かめる）。アセットやテクスチャを変えたら `build_assets.py`（`--only 名,名`）と `textures.py` / `textures2.py` を先に。
4. 撮る: `node tools/worldart/views.mjs <名> art/shots/<名>/Lnn <ビュー,…>`。比べる: `viewsheet.py`（並べた絵）、`refstats.py`・`rulecheck.py`（見本と同じ道具で数値）。数値の目標は rulebook の 13.2。
5. 差が一番大きい所を 1 つだけ直し、全ビューを撮り直す。規則を変えるときは入／切で比べる（`abshoot.sh` → `abcompare.py`）。採用の条件は rulebook の 1.2（効く向き・複数の場面・副作用なし・見本の範囲）。推測で一致にしない。
6. 記録する: ループの記録と評価表は `docs/world-art/goal-<地図>.md`、アイデアの状態は `docs/world-art/rules/ideas.md`、失敗は `docs/world-art/pipeline.md` の 5（F 番号）、規則が変わったら `rulebook.md`。撮影は `pack_shots.py` で webp にしてからコミット。
7. 新しい仕組み（シェーダーの分岐・階調の方式）を足したら、値を 2 段変えて画素が変わることを先に確かめる（F24・F25）。

人物と製品の UI は対象外。比較用の歩ける Artifact は `tools/worldart/compare/build.py` で組み立てる。
