# ワールドアート（Godot 4 版）

three.js の実行環境（`public/worldart/world.js`）と同じ見た目で、ワールドアートの地図を Godot 4.3 で描くプロジェクトです（L26）。いまは第 1 層「ひだまりの草原」（`f1_field`）が入っています。

## ゲームの試作（L27）
F5 で起動するのは、今のゲームのサーバーにつないで遊ぶ試作です（`scenes/game.tscn`）。先にリポジトリの一番上で `npm start` でサーバーを立ててください。手順・移した範囲は `docs/godot/migration.md`。
地図だけを見るときは `scenes/main.tscn` を開いて F6。

## 開き方（地図だけを見る）
1. Godot 4.3 以降でこのフォルダ（`godot/worldart/project.godot`）を開く。初回はアセットの取り込みに少し時間がかかります。
2. `scenes/main.tscn` を開いて F6（このシーンを実行）。WASD か矢印キーで歩き、Q / E で向きを変え、マウスのホイールで近づく・離れる。
   - 赤い円柱が人物の代わりです。
   - ゲームと同じく、輪郭の外と当たり判定のある木・岩には入れません。出口は通れます。
3. エディタでも `scenes/main.tscn` を開くと地図が組み上がって見えます（`scripts/world.gd` は @tool）。
   - エディタの 3D ビューでは仕上げ（露出 1.25・彩度・上下のぼかし）が入らないので、実行時より暗く見えます。

## 中身
| 場所 | 中身 |
|---|---|
| `data/<地図>/` | 地形 `terrain.glb`、配置 `placements.json`、地図の設定 `map.json`（`tools/worldart/godot/export_godot.py` が書く。手で直さない） |
| `data/assets/` `data/tex/` | Blender で作ったアセットの GLB と、地面の絵 |
| `scripts/world.gd` | 地図を組み立てる（地形・アセットごとの MultiMesh・太陽・環境・シェーダーの全体の値） |
| `scripts/main.gd` | カメラ（俯角 45°・画角 18°・距離 33m）、歩く、仕上げの板、撮影 |
| `shaders/` | three.js と同じ式の材質: 地面 `ground`、葉と草 `foliage`、ふつうの物 `lambert`、岩 `rock`、仕上げ `post`、光の式 `common.gdshaderinc` |

## three.js との対応（同じにするための決まり）
- 太陽の強さは three の強さ / π（Godot の光の色には π が掛かっているため）。
- three の半球光（空の光）は Godot にないため、各材質の中で EMISSION として足し、環境光は 0 にしている。
- 階調は Environment を「線形・露出 1.0」にし、仕上げの板で露出 1.25 → 切り捨て → sRGB → 彩度 0.92 → 上下のぼかし（three と同じ順）。
- 影は Godot の平行光の影（2 分割・ぼかし 1.5）。three は VSM で、F04 などの林の奥で明暗比が少し違う。
- 手前の物を点描で抜く処理（three の歩くときの見やすさ）はまだない。

## 地図を足す・更新する
```sh
python3 -I tools/worldart/godot/export_godot.py <地図>          # Blender で作り直した後に書き出し直す
sh tools/worldart/godot/run.sh --import                          # 画面のない環境で取り込む（エディタで開くなら不要）
sh tools/worldart/godot/run.sh -- --shot=F01,F02 --out=/abs/dir  # 固定ビューを撮る
```
別の地図を見るときは `scenes/main.tscn` の World の `map_name` を変える。

## 仕上げ調整（調整ラボ 3）
`scenes/main.tscn` の起動引数の `--` より後に指定する。撮影時も同じ値が使われる。

```sh
sh tools/worldart/godot/run.sh -- --map=mihon2 --view=B01 --vwarm=12 --diff=0.3 --diffmask=veg --bake=0.5 --srad=6
```

| 引数 | 範囲・初期値 | 内容 |
|---|---|---|
| `--vwarm` / `--vcool` | 0〜30 度 / 0 | 中〜明部の緑を黄へ、暗部の緑を青へ色相移動 |
| `--vdesat` / `--vlift` | 0〜1 / 0 | 明部の彩度を下げる / 明部を持ち上げる |
| `--diff` | 0〜1 / 0 | にじみの強さ。grade の後、上下のぼかしの前に合成 |
| `--diffr` | 画面高に対する比率 / 0.012 | 半解像度の横・縦ガウスぼかしの半径 |
| `--diffmask` | `none`, `depth`, `edge`, `lum`, `veg`, `soft` / `none` | にじみを混ぜる範囲。`veg` と `soft` は植生と地面のマスクを使う |
| `--diffd0` / `--diffd1` | 距離 / 注視点距離の 0.8 倍 / 1.6 倍 | `depth` と `soft` の距離範囲 |
| `--diffe` | 0 以上 / 0.08 | `edge` の輝度差のしきい値 |
| `--diffdebug` | 0 または 1 / 0 | にじみマスクを白黒で表示 |
| `--bake` | 0〜1 / 0 | `skyvis.png` がある地図だけ、地面の空光を可視率で弱める |
| `--srad` | 0 以上 / 地図の `shadowRadius`、なければ 2 | three.js の VSM 半径を Godot の影ぼかし半径へ変換 |

影半径の対応は `Godot blur = clamp(1.5 + (srad - map_default_srad) × 0.25, 0, 7)`。`map_default_srad` は地図の `shadowRadius`、なければ `2`。地図ごとの既定値では Godot の現在のぼかし `1.5` を保ち、そこからの VSM 半径の差を反映する。調整値の正本は `scripts/tuning.gd` にあり、実行中は `set_tuning_value(name, value)` で変更して反映できる。色・にじみがすべて 0 の間は `shaders/post_default.gdshader` を使い、既定画素を保つ。
