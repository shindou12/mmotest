---
name: ro-look
description: Effigy の背景（マップ・地形・木・岩・光・カメラ）を RO風に作る・直すとき、または「このリポジトリを参照して」「RO風で」「いつもの手順で」と言われたときに使う。
---

# RO風の背景を作る

このリポジトリの手順書に従って作る。自己流で作らない。

1. `docs/ro-look-method.md` を最初から最後まで読む。とくに「2. 守ること」「6. 失敗集」「7. 数値の早見表」。
2. 新しい場面は `public/js/previews/ref-forest.js` を複製して作る。地面は `ro-style.js`、植物は `foliage.js` の `FoliageBuilder`、岩と崖は `ro-rock.js` を使う。
3. `PORT=8091 npm start` のあと、`node tools/ro-look/shot.mjs <URL> out/ours.png` で撮る。見本があれば `python3 tools/ro-look/compare.py <見本> out/ours.png out/cmp` で、並べた画像・重ねた画像・場所ごとの平均色を出す。
4. 差が一番大きいものを1つだけ直して撮り直す。原因（光・材質の色・影・形・配置）を考えてから直す。見本の全体の平均色が ±10% 以内、場所ごとの明るさの比が 0.8〜1.2 になるまで繰り返す。
5. 基準の画面（`lab.html?style=ro` と `ref-forest.html`）より見劣りしないか、手順書のチェックリストで確かめる。
6. 新しくわかった失敗と原因、効いた数値は `docs/ro-look-method.md` の失敗集と早見表に書き足す。

キャラクター（人物）はトゥーンと輪郭線のままにし、背景だけを RO風にする。
