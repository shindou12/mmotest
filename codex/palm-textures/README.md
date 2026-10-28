# 幅広い葉と落ち着いた色

**最新: [flow v3](FLOW-v3.md)**。ユーザー指摘の「側片の流れが逆」を修正。現在の比較は soft → flow。揺れる側も flow。以前の全体案にはこの修正は未反映。

2026-10-25。葉の表示不具合を修正し、ユーザーの「ROをイメージ」「とげっとげ」「彩度がきつい」「実物を調べてデフォルメ」の指示を反映した。

**最新:** さらに「側面に棘を残さず、柔らかく、少し明るく」という指示で[soft v2](SOFT-v2.md)を作成。現在のページは、直前のreference材質と新しいsoft材質を比較する。葉・全体案・風の画像を更新した。以下の初期経緯・保存物と分けて参照する。

## 開く

- [見本 → 前案 → 新しい材質](http://127.0.0.1:8172/codex/palm-textures/): 同じ形・光・視点で画像だけを比較。風とカメラ追従は0。
- [見本 → 前案の無風 → 新案の風](http://127.0.0.1:8172/codex/palm-wind/): ユーザーの希望どおり揺れる側に新案を置いた。無風ボタンで材質だけも比較できる。

画像生成した全体案は比較ページの下段に保存した。特に`concepts/palm-reference-approved.png`に対するユーザーの評価は**「これ、いいね～～～～」**。この画像を方向の基準にし、元ファイルを加工せず保存した。全体案は1枚の生成画像、動く試作は既存の3D幹＋曲面の葉であり、同一のレンダーではない。

## 調査した実物と、そこから変えたこと

- [NParks: Cocos nucifera](https://www.nparks.gov.sg/florafaunaweb/flora/5/6/5618): 葉は上向きから水平・下垂へ移り、多数の細長い小葉を持つ。幹には古い葉の痕が輪状に残る。
- [Royal Botanic Gardens Victoria: Howea forsteriana](https://hortflora.rbg.vic.gov.au/taxon/adad49c0-5340-11e7-b82b-005056b0018f): 弧を描く葉と、下へ垂れる密な小葉。柔らかい傘形の全体像の参考。
- [Identifying Commonly Cultivated Palms: Howea forsteriana](https://idtools.net/tools/1041/index.cfm?entityID=3217&packageID=1109): 羽状葉、小葉の折れと下垂、表裏の色、幹の輪痕。掲載の樹冠・葉の写真URLも調べた。一部の画像取得はタイムアウト等で失敗したため、すべての写真を目視できたという記録にはしない。

前案の尖った印象は、単に葉先が尖ることだけでなく、外向きの独立した葉が等間隔で並び、縁に強い黄緑の明部が付くことから来ると判断した。実物寄りの案では小葉の下垂と重なりを強調。もう一つはユーザー提供のゲーム画像から、幅広くつながった葉面と、深いが柔らかな切れ込みを採った。

生成した全体案2種を提示した後、ユーザーが添付見本由来の案を評価したため、こちらの材質化を優先した。実物寄りの全体案も保存している。全体のカーブは維持し、今回は形状・配置を作り直していない。

## 材質

| 版 | 葉 | 樹皮 | 状態 |
|---|---|---|---|
| `1` | frond-ro-v1.png | bark-ro-v1.png | 尖りと彩度が強いとの評価を受けた前案 |
| `reference` | frond-reference-v1.png | bark-reference-v1.png | ユーザーが評価した全体案から作った新しい材質 |
| `soft` | frond-soft-v2.png | bark-reference-v1.png | 側面を丸くし、葉面を明るく柔らかくした最新の試作 |

切替の正本は`profiles.json`。実行時は`?paint=reference`。色画像はsRGB、glTFのUVに合わせてflipY=false。樹皮は元のアトラスの半幅UVを全幅へ広げるためU方向のrepeatを2とした。葉の透過をそのまま使い、別の手描き風フィルターや全画面の彩度補正は加えていない。

葉の連続した広い面、灰みのある緑とオリーブ、青灰色と灰黄土色の幹の帯を画像として作った。元のGLB・本番のテクスチャ・色規則は変更していない。幹の側面数、葉の数と重なり、先端の形状は既存モデルに由来するため、全体案と完全に同じ形にはならない。

## 生成方法と保存先

組み込みimagegenを使用。APIキー・従量課金・追加インストールなし。正本のゲーム見本B03・G02等は送信していない。今回新しくユーザーが「この画像見本バージョンでも作って」と渡した画像は、その依頼に沿って生成の参照に使った。続く葉・樹皮の生成は、ユーザーが評価した生成全体案を参照した。

- `reference/user-palm.png`: 今回のユーザー提供見本。ローカル研究用。
- `concepts/palm-natural.png`: 植物資料からの実物寄り全体案。
- `concepts/palm-reference-approved.png`: ユーザーが評価した全体案。
- `assets/frond-reference-v1.png`・`bark-reference-v1.png`: 新しい葉・樹皮。
- `PROMPTS.json`: この全体案2種と新しい材質2種の実際の生成プロンプト。
- `shots/v2-reference/`: 前案／新案、俯角40°・18°と方位90°の6画像。
- `preview-reference.log`・`checks.log`: 生成・確認記録。
- `../palm-wind/shots/v3-reference/`: 新材質での無風／弱／中と8秒アニメーション。

前段階で生成した写実寄りの樹皮や別の葉の案は採用せず、生成ツール側の出力に残した。ワークスペースで使用する素材はこのフォルダへコピー済み。

## 葉が消えた原因の修正

ユーザー提供の画面では、風なし・風ありとも幹だけが見えた。実際の材質フックをThree.jsのLambert／Depthシェーダーへ適用すると、風の関数が`aFacingAxis`等の**属性宣言より前**へ挿入されていた。

修正前は描画・影とも`declared_before_use=false`。属性宣言後へ挿入する修正後は両方`true`。GLSLのスコープ規則は[Khronos GLSL ES仕様](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf)で確認した。比較ソースは`../palm-wind/debug/before-*.vert`・`after-*.vert`、結果は`declaration-order.log`。読み込み版を更新し、初回描画を試してからreadyを通知するようにした。

これは確定したソース上の不具合の修正であり、GPU上の表示復旧まで確認したという記録にはしない。自動ブラウザ接続の既存セキュリティ拒否は回避していない。

## 実際に開いた確認

添付2画像、ユーザーが評価した生成全体案、新しい材質を貼った正面40°・低い18°・方位90°のBlender画像、弱い風の連続比較と2秒画像を実際に開いた。幅広い葉の面と幹の帯が読み取れ、前案より縁の黄緑が弱くなった。葉が重なる内側は暗く、既存の18葉は生成全体案より密な印象が残る。

新材質の前案に対する画素変化はchecks.logへ記録。効きの確認であり、品質点数ではない。JavaScriptの構文・参照先・PNGの透過と画像コピーの一致も確認する。

**残ること:** Three.js実画面・GLSLコンパイル・操作の確認、動く材質版へのユーザー評価。本体採用は未決定。全体案の好評価と、動くモデルへの採用判断は分ける。

### 再撮影

```powershell
& 'C:\Users\shind\AppData\Local\Programs\blender-4.2.23-windows-x64\blender.exe' -b --factory-startup --python codex/palm-textures/preview.py
& 'C:\Users\shind\AppData\Local\Programs\blender-4.2.23-windows-x64\blender.exe' -b --factory-startup --python codex/palm-wind/preview.py -- --reference
python -I -X utf8 codex/palm-wind/pack.py --reference
```

再撮影で開いた画像のロックが残る場合は、撮影先を新しい版のフォルダへ変える。
