# W1: ヤシのゆっくりした風

2026-10-25。施策一覧P01の最初の単独試作。**実装・Blender画像確認済み。Three.js実画面と採用判断は未確認。** W2の細かな揺れ、W3の突風、W4のカメラ追従との併用はまだ評価していない。

**最新の材質:** [soft v2](../palm-textures/SOFT-v2.md)。側面の尖りを丸くし、葉面を少し明るく柔らかくした。現在は直前のreference材質を無風側、soft材質を揺れる側に表示。Blender画像とGIFは`shots/v4-soft/`、再生成はpreview.pyとpack.pyへ`--soft`を付ける。

**後続更新:** ユーザー画面で葉が消えていたため、風関数のGLSL属性宣言順を修正した。`debug/declaration-order.log`で描画・影とも宣言が先になることを確認。さらに[新しい材質](../palm-textures/README.md)を作り、ユーザーの指示で風のページを「前案の無風／新案の風」へ変更した。現在は材質も変わる比較なので、風だけを見るには新案の無風ボタンと同じ時刻で比べる。下記の初期記録は旧材質のもの。新材質の画像・GIFは`shots/v3-reference/`、ログは`preview-reference.log`・`pack-reference.log`。

## 開く

[見本 → 同じヤシの無風 → 風の試作](http://127.0.0.1:8172/codex/palm-wind/)

大きな縦並び。無風／弱／中のボタン、再生／停止、最初から、時刻のスライダー。カメラの操作は両方へ伝わり、風の時刻も親画面から共有する。20秒で停止し、再生を押すと最初から再開する。初期は弱い風。両方ともカメラ追従0で、風だけを比較する。

B03はヤシの形の資料で、風の動きを真似した映像資料ではない。ページ下段にはBlenderで撮影した弱・中のアニメーションと静止画像も置いた。

## 仕組み

- 既存専用ヤシpalm2_aのGLB・画像をそのまま読む。アセットの生成・書換えはしない。
- 芯の9断面から8本の短い区間を復元する。各区間を小さく回し、根元から先へ足し合わせる。区間の長さは変えず、先へ行くほど曲がるようにする。
- 断面の幅方向も回し、共有頂点を保つ。付け根は動かさず、先端は動く。葉の面積や幅を伸縮する処理はないが、区間境界の面のわずかな歪みまでは除去していない。
- 旧`public/js/previews/foliage.js`にある「2波を重ね、位置で位相を変える」考え方を使う。葉の向きで位相を変え、すべての葉が一緒に往復することを避ける。新葉の揺れは小さくする。
- 定数はconfig.jsonで共有する。8秒周期、2つの周期成分、共通の風向き。今回の波は比較用に周期的。風の強弱が林を伝わるW3は別施策。
- 葉と影の材質に同じ変形・強さ・時刻を渡す。照明用の法線は以前の固定法線を保つ。
- 色・疑似AOの頂点色を上書きせず、風の属性を2個追加する。通常の葉の描画で使う頂点属性は最大16枠の構成。GPU上の負荷・実際の属性上限は実画面での確認が残る。
- 既存palm-billboard/scene.jsには`?wind=`を指定したときだけ読み込むフックを追加した。既存の比較URLでは風を読み込まない。

## 調査と選び方

- [GPU Gems 3 第6章・EA/DICE](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-6-gpu-generated-procedural-wind-animations-trees): 幹・枝・葉の階層回転と、GPUで見た目の風を作る既知の設計を参照。今回のヤシは8区間に限定した。
- [GPU Gems 3 第16章・Crytek](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis): Main BendingとDetail Bendingの分離を参照。
- [SeedThree](https://github.com/SkyeShark/SeedThree): MIT、樹木・葉カード・風のあるThree.js実装。公開64コミットと6件のPRを確認したが、更新頻度までは確認できていない。WebGPUが前提でalphaの注意書きがあり、r160/WebGLの今回へ導入しない。
- [threejs-grass-water-shaders](https://github.com/boona13/threejs-grass-water-shaders): MIT、草の風を含む小さな実装。READMEはThree.js 0.170以上・GLSL3を前提とし、公開履歴は4コミット。保守の継続性は未確認。ヤシの既存材質へ直接導入しない。

比較の結果、新たなパッケージは追加せず、既存の材質フック・ヤシ形状・2波合成を使う。外部コードの転載なし。キー・課金・インストールなし。

## 再生成

作業ツリーのルートから:

```powershell
& 'C:\Users\shind\AppData\Local\Programs\blender-4.2.23-windows-x64\blender.exe' -b --factory-startup --python codex/palm-wind/preview.py
python -I -X utf8 codex/palm-wind/pack.py
node --check codex/palm-wind/wind.js
node --check codex/palm-wind/ui.js
node --check codex/palm-billboard/scene.js
```

撮影画像を開いた後の再撮影は、Windowsのファイルロックを避けるため新しい版のフォルダを使う。

## 確認結果

- 無風／弱／中を0・2・4秒で撮影し、9画像を保存。弱・中は各96フレーム、12fps、8秒のGIFへまとめた。
- 正面40°の無風・中の2秒画像と、0〜7秒の弱・中の連続比較画像を実際に開いた。幹と付け根の位置を保ち、葉先と影の位置が時刻で変わる。弱は小さな動きで、中は葉の開き方の差が大きい。アニメーションの滑らかさ・速さの実画面評価は残る。
- Blenderの最大付け根移動`0 m`、芯の区間長誤差`0.000000338 m`。
- 先端の最大変位は弱`0.162 m`、中`0.295 m`。形状の確認値であり、品質スコアではない。
- 2秒の無風に対して、弱は53,420画素、中は60,641画素が変化（RGBの最大差3超、1280×720）。2段階で応答することを確認した。
- JavaScript3ファイルの`node --check`は成功。GLSLコンパイル・描画成功を示すものではない。
- 自動ブラウザ接続は以前のセキュリティ判定で拒否されているため、別手段で回避していない。Three.js側の表示・GPUでの変形・操作・影の実画面確認は未完了。GIFはBlenderでの再現であり、Three.jsのキャプチャではない。

## 保存物

- `shots/v1/wind-weak.gif`・`wind-medium.gif`: 8秒のBlenderアニメーション。
- `shots/v1/sequence-*.png`: 1秒ごとの形の比較。
- `shots/v1/none-*.png`・`weak-*.png`・`medium-*.png`: 静止比較。
- `shots/v1/geometry.json`・`pixels.json`: 形状と画素応答。
- `preview.log`・`pack.log`・`checks.log`: 作成と確認の記録。

判定は保留。W1の記録を閉じる条件は、実画面で動きを確認して評価を残すこと。その後W2へ進む。
# 最新の材質

側片が根元へ反り返る問題を直した flow 材質を動く側に指定。[記録](../palm-textures/FLOW-v3.md)。撮影は preview.py -- --flow、pack.py --flow、出力は shots/v5-flow/。
