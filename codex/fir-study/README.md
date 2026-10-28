# 柔らかいもみの木

2026-10-26。ROの樹木画像と、実物のもみの資料を参考にした比較試作。既定はv5。比較の「現在」は前回v4。変更・生成物はcodex内。

- 単体: http://127.0.0.1:8172/codex/fir-study/
- 砂浜: http://127.0.0.1:8172/codex/fir-study/coast.html
- 台帳: `catalog.json`
- 作り方・出典: `PLAN-v5.md`
- 画像生成の指示全文: `PROMPTS.md`。組み込みimagegenを使用。APIキー・従量課金・追加インストールなし。
- 見て直した記録: `ITERATIONS.md`

## 構造

Blenderで幹→大枝→小枝→葉房を組んだGLB。組み立てはbuild.pyとhierarchy.py、設定はsettings-v5.json。カメラへ追従するビルボードではなく、角度の固定された立体の枝葉。既存のBuilder・tubeを再利用し、元の生成器自体は変えていない。

`assets/fir_soft_v5.blend` が編集用。GLB、画像、設定、生成スクリプトも同じフォルダ内で追跡できる。最終版は34本の大枝・136本の小枝・265房・10896三角形。枝のRGBA画像は生成結果を加工せず保存し、曲がり・幅・切り出しはメッシュとUVで行う。

砂浜版は `codex/palm-coast/` の描画器と配置設定を参照する。`fir4_c[1]` の1本だけを置き換え、ヤシ3本、他の配置、現在と試作のカメラを保持する。公式アセットや地図へはまだ採用していない。

## 再生成・確認

リポジトリルートで、既存のBlender 4.2.23、Python、Nodeを使う。

```powershell
& 'C:/Users/shind/AppData/Local/Programs/blender-4.2.23-windows-x64/blender.exe' --background --python codex/fir-study/build.py -- --version v5
& 'C:/Users/shind/AppData/Local/Programs/Python/Python313/python.exe' -I -X utf8 codex/fir-study/prepare_world.py
& 'C:/Users/shind/AppData/Local/Programs/node22/node.exe' codex/fir-study/capture.mjs v5
& 'C:/Users/shind/AppData/Local/Programs/node22/node.exe' codex/fir-study/capture_world.mjs v5
```

撮影にはルートを配信する8172番のHTTPサーバーが必要。既存のPlaywrightを使い、ドラッグによる90度ずつの回転と、上面・低い横を撮る。画像を開いて確認済み。

最終結果: 単体6方向、砂浜5方向、`PAGE_ERRORS=[]`。差し替え1本、ヤシ3本、他の配置一致、カメラ一致。画像は `shots/v5/` と `shots/world-v5/`、ログは同階層の `browser-log.json` と `capture-*-v5.log`。

## 残る点

見本より葉房内の細部が強い。低い横では上部のカードの隙間が見える。砂浜の背面カメラでは周囲の木に隠れるため、背面自体の確認には単体の回転撮影も使った。風・LOD・大量配置の負荷検証は未実施。BlenderのglTF書き出しに同じ画像のサンプラーに関する警告が残るが、使用中の画像設定は同じで、実画面の読み込み・透過・影を確認している。
