# 森の輪郭のなじませ方

`outline-forest` の独立コピー。上は固定色、下は輪郭が乗る画面の色を暗くするか、固定色かを選べる比較。線の幅・強さ・不透明度・方式と茂み・草のON/OFFは両方に同時反映。輪郭のぼかしは外形方式のみ。殻方式では葉・茂み・草は対象外。周囲の色の暗部を線に使うので、元が暗い部分では差が小さくなる。元のゲーム本体・アセットは変更しない。

画面色を元に線の色を作る既存例: [3D Game Shaders For Beginners: Outlining](https://github.com/lettier/3d-game-shaders-for-beginners/blob/master/sections/outlining.md)（画面色と色係数を使う説明）。[Epicのスタイライズド描画の解説](https://dev.epicgames.com/documentation/unreal-engine/stylized-rendering-post-processing?application_version=4.27)も深度からの輪郭検出を紹介している。前者のコードをコピーせず、既存のThree.js輪郭合成に乗算系の比較を追加した。

`node codex/outline-blend/check.mjs` で各方式を撮影、エラーなし。`node codex/outline-blend/verify-params.mjs` で強さ0・6のRGB差（2を超える画素）が外形68049、深度法線98122、殻2258。画像は `shots/`。近距離や暗背景、輪郭が重なった場合の品質・実ゲームの負荷は未評価。

ガッシュ風は画面全体を対象とする試験で、Kuwahara 型の局所平均で細部を塊に寄せ、彩度を少し抑える。絵の具や筆の物理的な再現ではない。スライダーを0から上げると下の画面だけに適用。上と同じ輪郭条件にして絵画風だけを比べたい場合、線の色を「固定色」にする。参考: [Three.js の絵画風作品での Kuwahara の利用](https://tympanus.net/codrops/2026/04/24/susurrus-crafting-a-cozy-watercolor-world-with-three-js-and-shaders/)、[Adobe の Kuwahara フィルター解説](https://experienceleague.adobe.com/en/docs/substance-3d-painter/using/effects/filters/advanced-filters/anisotropic-kuwahara)、[ガッシュ絵具の特徴](https://www.carandache.com/us/en/how-to-paint-with-gouache)。特定の外部コードはコピーしていない。

`node codex/outline-blend/verify-effects.mjs` で不透明度0・1の差64690画素、ぼかし0・2の差113690画素、ガッシュ風0・1の差611421画素。撮影画像は `shots/`。強くかけると葉や地面の細部が消えるので、まず弱めで評価する。
