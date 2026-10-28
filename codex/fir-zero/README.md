# もみの木・ゼロからの試作

2026-10-27。既存の木の形や配置には合わせず、柔らかな手描き風の色を手がかりに独立して設計した試作。

- 編集用Blender: `assets/fir-zero.blend`
- 表示用: `assets/fir-zero.glb`
- 幹、根、枝の骨格と曲面の葉房カード: `build.py`
- 生成画像と指示: `PROMPTS.md`
- 比較と回転: `index.html`
- 確認画像: `shots/8172/`。正面、左右、背面、横、真上を開いて確認。
- Sites: https://fir-forest-study-20261026.shindou-kazuma12.chatgpt.site/codex/fir-zero/index.html

Blender 4.2.23で制作。葉と樹皮は組み込みimagegenの画像を使い、画像を加工せずにGLBへ埋め込んだ。APIキー、従量課金、追加インストールなし。

## 修正と残る課題

最初は上部の幹と尖った枝先が露出。葉房を柔らかくし、上部に房を追加した。葉の裏面が黒くなる問題は法線の向きの扱いを直し、修正前後の画像差を確認。樹皮を付けた後、GLTFの透明材質が深度を書かず幹が葉の手前に透けたため、葉の深度書き込みを有効にした。

完成イメージに比べると、葉房の繰り返しと細かい模様がまだ目立つ。枝の段の隙間も低い視点では見える。独立試作であり、既存ワールドにはまだ配置していない。

## 再生成と確認

```powershell
& 'C:/Users/shind/AppData/Local/Programs/blender-4.2.23-windows-x64/blender.exe' --background --python codex/fir-zero/build.py
& 'C:/Users/shind/AppData/Local/Programs/node22/node.exe' codex/fir-zero/capture.mjs
```

確認にはワークツリーのルートを8172番で配信するHTTPサーバーが必要。6視点で8352三角形、ページエラー0。標準・横・真上とドラッグ回転を実行。

Sites配布先でも実際のモデル、ドラッグ回転、真上表示を確認。`shots/host/log.json` は `errors=[]; failure=null`。公開先の画像 `shots/host/comparison.png` と `top.png` も開いて確認した。配布先のThree.jsは `vendor/three/` を使い、以前の404を避ける。
