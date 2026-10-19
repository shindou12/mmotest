# このリポジトリで作業するときの案内

## 背景のグラフィック（RO風の見た目）

マップ・地形・木・岩・草・光・カメラ・仕上げなど、背景の見た目を作る・直すときは、**必ず先に `docs/ro-look-method.md` を全部読み、その手順と数値に従う**。
「このリポジトリを参照して」「RO風で」「いつもの手順で」と言われたら、この手順書のこと。

- 使う部品: `public/js/previews/ro-style.js`（地面）、`foliage.js`（木・茂み・草）、`ro-rock.js`（岩・崖）
- 新しい場面は `public/js/previews/ref-forest.js` を複製して作る（レンダラー・光・仕上げ・配置の道具が入っている）
- 基準の画面: `lab.html?style=ro`（実験場）と `ref-forest.html`（見本の再現）。これより見劣りしたら手順から外れている
- 確かめ方: `tools/ro-look/shot.mjs` で撮り、`tools/ro-look/compare.py` で見本と比べる。差が一番大きいものを1つずつ直す
- 新しくわかったこと（失敗とその原因・効いた数値）は `docs/ro-look-method.md` の失敗集・早見表に書き足す
- キャラクター（人物）はトゥーンと輪郭線のまま。背景だけを RO風にする
