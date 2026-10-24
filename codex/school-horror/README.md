# 夜の校舎：画像だけで奥行きを作る実験

変更は `codex/school-horror/` 以下。立体の箱・円柱・GLBは使わず、画像面とシェーダーで構成しています。

## 起動と操作

作業ツリーのルートから実行します。

    python -m http.server 8172 --bind 127.0.0.1

- 試作を歩く: http://127.0.0.1:8172/codex/school-horror/?preview=1
- 見本｜現在｜試作: http://127.0.0.1:8172/codex/school-horror/compare.html
- 前の版: http://127.0.0.1:8172/codex/school-horror/current-v2.html?preview=1
- 操作: WASD移動、マウスまたはドラッグで見回し、F懐中電灯、Esc解除、B壁の微細な凹凸。

## 今回の試作（v3）

### 椅子

`image-chair.js` は、座面・裏面・背・支持材を透過画像から切り出し、32枚の固定画像面で組み立てます。カメラへの追尾や方向画像の切替はありません。支持材は直交する2枚の画像面で、法線を丸くする近似を付けています。木の板の小口にも細い画像面を足しました。すべてPlaneGeometryで、円柱モデルなどは置いていません。

Billboard Cloudsの面を分ける考え方を、手で位置を指定した画像部品に応用したものです。論文のモデル自動変換やTrue Impostorsを実装したという意味ではありません。

### 教室

`layered-room.js` は、入口の画像面から仮想の壁・床・天井との交点を求め、それぞれの画像を引きます。家具は別の距離にある画像層との交点から描きます。部屋の箱モデルは作っていません。一枚の完成写真を変形する前の方式と切り替えられます。

構成はJoost van Dongenの原著者解説にある、室内の面と追加の家具レイヤーを参考にしています。
https://joostdevblog.blogspot.com/2018/09/interior-mapping-real-rooms-without.html

## 比較用の引数

|引数|内容|
|---|---|
|`chair=atlas`|前の8方向画像切替。既定は固定した部品画像|
|`room=photo`|前の一枚写真の再投影。既定は室内の面と家具を分離|
|`furniture=0`|室内の家具層を切る|
|`layerDepth=2.1`|家具の手前の層を2.1mへ。既定は1.25m|
|`chairNormals=0`|支持材を丸くする法線の近似を切る|
|`reflection=0`|床の反射を切る|
|`torchShadow=0`|懐中電灯の影を切る。Fで点灯して比較|
|`still=1`|照明の揺れを止める|
|`shot=chair-front`|撮影位置。ほかに`entrance / window / door / door-other / chair-side / chair-back / end`|

例: `?preview=1&still=1&shot=door&layerDepth=2.1`

前の版の固定には `current-v2.html / stage-v2.js` を使います。さらに古い版は `baseline.html / baseline.js` に残っています。

## 残る限界

- AAA品質には未到達です。固定した部品により形の連続性は得られますが、木の曲がりや丸い金属の外形までは再現していません。細い支持材を極端に近くから見ると交差した面が分かります。
- 室内の家具は平面のままです。部屋へ入る、机の裏へ回る操作には対応しません。室内の光は簡略化しており、廊下の懐中電灯を室内で物理的に照らし直す方式ではありません。
- 椅子は廊下と同じ光を受けて影・床反射へ入ります。教室は入口から見える範囲に用途を限定しています。
- 新規インストール、APIキー、従量課金APIは使用していません。新しい画像は組み込み生成です。生成プロンプトは `PROMPTS-V3.md`、見直しは `ITERATIONS.md`、調査資料は `RESEARCH-2026-10-24.md` に記録しました。
