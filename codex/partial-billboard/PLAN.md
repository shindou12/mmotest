# 葉カードの部分ビルボード Implementation Plan

> この計画は依存する順に、この会話で実行する。変更・生成先はcodex/partial-billboardのみ。

**Goal:** 既存の広葉樹の形・絵・照明を使い、固定／部分追従／完全追従を比較する。

**Architecture:** Blenderの既存生成関数を読み取り専用で再利用する。葉の四角形ごとに中心・幾何法線・回転軸の補助情報をGLBのカードIDとJSONへ保存する。Three.js側は既存world.jsを試作用に複製し、葉だけに剛体回転を追加する。Root配下の比較画面から同じ視点と追従量を渡す。

**Tech Stack:** 導入済みBlender 4.2.23、Three.js r160、Python標準ライブラリ。追加インストール・APIキー・従量課金なし。

## 1. 調査

- [x] drei Billboard（MIT、React依存）、threejs-billboard（MIT、Pixi依存）を比較する。どちらも主にオブジェクト単位の追従で、既存の一体化された葉カード群へそのまま導入しない。
- [x] douges.devのThree.js樹木解説で、メッシュ全体の追従とカード単位の頂点変形の違いを確認する。平面の線形補間による縮みを避けるため、今回は標準の軸角回転を使う。第三者コードの転載・新規依存の導入はしない。

## 2. Blenderからの出力

- [x] `build.py`から既存`build_assets.py`を`runpy.run_path`で読み、maple2_s・maple2_tだけを専用出力先へ作る。
- [x] 葉の四角形の頂点に`_CARD_ID`属性を保存する。中心と幾何法線はJSONへ、座標はglTFのY-Upに変換する。球状の照明用法線は変更しない。
- [x] `assets/*.glb`、`assets/cards.json`、`assets/leaves.blend`へ保存する。既存の本番生成物を上書きしない。

## 3. Three.jsの変形

- [x] `foliage.js`でGLBのカードIDから中心・幾何法線・補助軸を頂点属性へ展開する。使用する回転は次の式。

```glsl
vec3 delta = position - aCardCenter;
vec3 axis = normalize(cross(aCardNormal, directionToCamera));
float angle = acos(clamp(dot(aCardNormal, directionToCamera), -1.0, 1.0)) * uFollow;
transformed = aCardCenter + delta * cos(angle)
  + cross(axis, delta) * sin(angle)
  + axis * dot(axis, delta) * (1.0 - cos(angle));
```

- [x] 平行・反平行方向では補助軸を使い、ゼロ除算を避ける。インスタンスの回転・等方スケールを考慮して視線をローカルへ変換する。
- [x] カードの球状照明法線を保ち、影用材質にも同じ変形を適用する。影描画時にも主カメラ方向を使用する。
- [x] `prepare.py`で既存world.jsを`world.generated.js`へコピーし、アセット読込・材質設定・比較画面との橋渡しだけを追加する。元ファイルのハッシュと置換箇所数を記録する。

## 4. 比較画面

- [x] `index.html`・`style.css`・`ui.js`・`frame.html`を作る。見本｜現在（追従0）｜試作（追従0.5、0〜1変更可）の順に置く。
- [x] Rootをイベントの受け口とし、Viewは表示値だけを反映する。Mediatorが読込中／表示中／エラーの状態を管理し、両フレームへ同じ視点を渡す。
- [x] B01・近景・横からの視点、方位変更を用意する。原画の外部送信・公開はしない。

## 5. 確認と記録

- [x] Blenderを書き出し先を限定して実行する。
- [x] GLBの属性・カードの対応を読み取り確認する。JavaScriptは`node --check`で構文確認する。
- [x] `preview.py`で同じ木の固定・部分・完全追従をBlender内で描く。これはThree.js実画面の代用として合格判定しない。
- [x] 画像を実際に開いて確認し、`README.md`に出典・起動方法・確認できたこと・未確認を残す。
- [x] Three.jsの画面はブラウザ権限の自動判定が拒否している。別ブラウザやPlaywrightで回避せず、ユーザー側の確認が必要な状態として明記する。
