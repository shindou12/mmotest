# 夜の校舎：画像だけで奥行きを作る実験

変更は `codex/school-horror/` 以下。箱やGLBは使わず、画像を貼る平面とシェーダーで構成しています。

## 起動

作業ツリーのルートから実行します。

    python -m http.server 8172 --bind 127.0.0.1

- 歩く: http://127.0.0.1:8172/codex/school-horror/
- 見本｜現在｜試作: http://127.0.0.1:8172/codex/school-horror/compare.html
- 操作: WASD移動、マウスまたはドラッグで見回し、F懐中電灯、Esc解除、B壁の微細な凹凸切替。

## 採用した既知の手法

|対象|手法|実装|
|---|---|---|
|窓・ドア|壁の開口、前後に離した画像、窓台と見込みの細い画像平面|stage.js|
|ドアの向こう|Interior Mapping。視線と仮想室内の交点から室内写真のUVを求める|interior.js / Three-FenestraのMIT実装|
|椅子|Directional impostor。物体から見たカメラ位置で8方向アトラスを選ぶ|stage.js|
|木床|平面反射に低い強さと軽いぼかしを付ける|floor-reflection.js / Three.js公式Reflector|
|仕上げ|明暗、冷たい窓光と暖かい蛍光灯、控えめなBloom|Three.js公式EffectComposer / UnrealBloomPass / OutputPass|

新規インストール、APIキー、従量課金のAPI利用はありません。画像は組み込み画像生成の出力を保存しています。`vendor/three-fenestra-LICENSE.txt` に導入したGLSLのライセンスを保存しました。参考実装の比較と判断は `ITERATIONS.md` を参照してください。

## 比較用の引数

`?preview=1&still=1&shot=door&depth=0` で室内視差なし、`depth=1` であり。`reflection=0` で床の反射を切ります。撮影地点は `entrance / window / door / chair-front / chair-back / end`。`still=1` は照明の揺れを止めます。

## 現在の限界

- AAA品質には未到達です。椅子の8枚は生成画像で、同一物体の厳密な回転撮影ではありません。方向の境界で形が跳び、近距離や上からの見下ろしに限界があります。
- Interior Mapping は入室できる実空間ではなく写真の再投影です。机それぞれの遮蔽や自由な回り込みまでは復元しません。
- 大きい板の表面にはPOMが適していますが、今回のカラー画像には信頼できる高さ画像がありません。色をそのまま高さと見なした強い変形は採用していません。壁のbumpは小さい表面感のみです。
- 比較左の画像は方向を示す生成した構図案で、到達したゲーム画面ではありません。
