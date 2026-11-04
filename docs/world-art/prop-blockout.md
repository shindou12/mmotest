# 板と金具のアセットの作り方（形は Opus、絵は下絵から image_gen）

樽（M-0164）と木箱（M-0165）で通った手順。スキル `.claude/skills/prop-blockout` の本体。

**今の扱い:** 試行中。規則集（`rulebook.md`）には採用していない。確かめたのは three.js の 1 つの地図、1 つの向きだけ。

**対象:** 板・金具・角材でできた物（箱、樽、棚、荷車など）。
**対象外:** 岩や切り株のような不定形の物。展開図が細切れになるので、Tripo や投影を考える。

## 分担
| 作業 | 誰が |
|---|---|
| 見本を測る、形、展開図の配置、下絵、見た目の判断 | Opus が自分で |
| 絵の生成と、数値での確かめ | Luna（`luna.sh`、札は `templates/atlas-paint-card.md`） |

形を札で Luna に渡さない。岩（M-0163）は、見本なしで札に言葉で書いて任せて失敗した。

## 手順

### 1. 見本を用意して測る
- 見本の画像がなければ、作る前にユーザーに頼む。斜めからの 1 枚でも作れる（木箱）。三面図なら輪郭まで測れる（樽）
- 大きさを 1 辺や高さに対する割合で測る（例: 枠の太さ 15%、金具 25%）
- 全体の大きさは `rulebook.md` の 3.2 で確かめる
- 背景が透明な画像は白に重ねてから使う（黒く読み込まれることがある）

### 2. 形を 3 段階で作る
脚本は `tools/worldart/blender/<物>_blockout.py`。形の脚本は物ごとに新しく書き、撮影と焼き込みは `barrel_blockout.py` から import する。

- **1 段目:** 全体の輪郭と大きな量。見本と並べて比べる
- **2 段目:** 部品（板、枠、斜め材、たが）。ばらつきは小さく、数値で入れる
- **3 段目:** 輪郭に効く細部（金具、鋲）

段階ごとに撮って見本と並べる。形は幅の広い面までにして、細かいものは絵に描く（`rules/fence-m0156.md`）。ゲームの画面は約 83 画素/m で、3〜4 画素（約 5cm）より細いものは見えない。

### 3. 灰色のままゲームのカメラに置く
下の「ゲームで撮る」の手順で、今のアセットの隣に置く。色の絵がない GLB は真っ白になるので、灰色の小さな絵を貼る。

### 4. 展開図に数値で配置する
1024 四方に、部品ごとの場所を数値で決めて `layout.json` に書き出す。

- 木目が同じ向きになるように、部品をまっすぐ置く
- 部品の間は 8 画素あける
- 同じ金具は 1 枚の絵を共有してよい
- 三角形の数と部品の数を報告する

### 5. 形の情報を焼いて下絵を作る
`bake_guides`（`barrel_blockout.py`）で奥まり（AO）と角（`guide_ao.png`、`guide_edge.png`）を焼き、部品ごとの色に重ねる（`tools/worldart/crate_paint.py` が見本。樽は `barrel_paint.py`）。

- 下絵の数値: AO の下限 0.45、角の明るさ 0.30、角のしきい値 0.55
- 組み立てると隠れる所は、平らに塗りつぶす。焼いた線が残ると絵が乱れる
- 絵を共有する部品は焼かない。重なって濁るので、手で描く

### 6. Luna に塗らせる
`templates/atlas-paint-card.md` を複製して、部品の読み方の段落を書き換える。下絵と見本の両方を入力画像にする。見本が小さければ拡大して渡す。

出力先は `art/painted-gen/<物>_<チケット>/` にする（Luna は `.agents` の下に書けない）。数値の条件を満たさない絵は Luna が作り直す。

### 7. 貼ってゲームで比べる
Blender の `--atlas` で GLB にして、今のアセットの隣で撮る。見本、作った物の 2 方向、ゲームの画面を 1 枚に並べて判断する。

差が一番大きいものを 1 つ直す。展開図を変えない形の直しなら、塗り直さなくてよい。

### 8. 記録する
`docs/world-art/rules/<物>-<チケット>.md` に、結果の数値、新しくわかったこと、見本との差を書く。ここの「よくある失敗」に増えた分を足す。本番の置き換えとゲームでの採否はユーザーが判断する。

## よくある失敗
| 症状 | 原因 | 対処 |
|---|---|---|
| ゲームで真っ白 | GLB に色の絵がない | 灰色の小さな絵を貼る |
| 奥まりが穴に見える | 壁が黒く、奥まりが深い | 深さを減らし（木箱は 5cm → 2.5cm）、壁を濃い茶にする |
| 板のすき間から草が透ける | 箱の中が空 | 暗い箱を中に入れる |
| 金具の下に小さな耳が見える | 箱形の金具の内向きの面に金具の絵 | 内向きの面は暗い絵にする |
| 帯が白く光る | 段差の面が絵の縁の擦れを拾う | 段差の面は帯の内側の色の場所に置く |
| 鋲が五角形に見える | 辺が少ない | 六角形以上にする |
| C ドライブの直下に PNG ができる | Blender の出力先が相対パス | 絶対パスにする |

## ゲームで撮る
一時の地図は `public/worldart/maps/painted_glade.json` と `painted_glade/`（`height.png`、`terrain.glb`、`placements.json`）を別の名前に複製して作る。周りの置き物を減らし、`placements.json` の `assets` に `[x, y, z, 回転, 大きさ]` で置く。`close` のビューは z=2.8、x=-6〜0 あたりが映る。

**一時の地図と GLB はコミットしない。**

worktree で撮るときは、`node_modules` のジャンクションを作り、サーバーを別に動かしてから撮る:

```bash
W=$(cygpath -w "$PWD/node_modules"); S=$(cygpath -w /c/Users/shind/mmotest/node_modules); cmd //c mklink //J "$W" "$S"
```

```bash
PORT=8094 /c/Users/shind/AppData/Local/Programs/node22/node.exe server.js
```

```bash
export PLAYWRIGHT_MODULE="file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs"; /c/Users/shind/AppData/Local/Programs/node22/node.exe tools/worldart/shot.mjs "http://localhost:8094/worldart/index.html?map=<地図>&view=close" "<絶対パス>/game_close.png" 1532 869
```

撮影は 1 回 2 分ほどかかる。worktree を消す前にジャンクションを外す（`cmd //c rmdir`）。

## まだ決めていないこと
- 三角形の上限（樽 1,104、木箱 250）
- 絵の大きさ（512 は未確認）
- 絵に描き込む明暗の強さと、規則集の「光を焼かない」の関係
- Godot での見え方
- 複数の地図で並べたときの統一感（`rulebook.md` の 1.2 の採用条件に届いていない）
- 板や金具でない物に使えるか

## 実例
- 樽: `rules/barrel-m0164.md`、`tools/worldart/blender/barrel_blockout.py`、`tools/worldart/barrel_paint.py`
- 木箱: `rules/crate-m0165.md`、`tools/worldart/blender/crate_blockout.py`、`tools/worldart/crate_paint.py`
