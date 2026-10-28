# 追従を前提に作った木

2026-10-25。前回の「既存木へ後付けした部分追従」に続き、葉房の役割と支点から組み直した独立試作。

## 見る

[見本｜現在｜専用試作](http://127.0.0.1:8172/codex/billboard-tree/)

- 見本: G02。葉房のまとまりを見る資料。地図構図を同じ位置へ再現した比較ではない。
- 現在: 前回の既存木へ後付けした追従0.5。
- 専用試作: 新しい木。初期追従量0.65。両方に同じ地図・視点・光・仕上げを使う。
- 方位と視点の操作は両方へ伝わる。追従量の操作は右側だけ。
- **専用木の1は「設計上限」**。固定房は動かず、追従房も最大38°。すべての葉が完全に正面を向くという意味ではない。

既に稼働中の8172番サーバーから配信。停止している場合、作業ツリーのルートで次を実行する。

```powershell
python -m http.server 8172 --bind 127.0.0.1
```

## 追従前提で変えたところ

| 部分 | 設計 |
|---|---|
| 幹・枝 | 専用に生成。幹の曲がり・枝の段と房の位置を一緒に決める |
| 固定層 | 内側と各房の下側、76房。幹の周囲の厚みと、カメラに依存しない重なりを担当 |
| 追従層 | 外側の40房。枝先の付け根を支点に回す |
| 葉房の形 | 画像面を2枚つなげ、先端を少し垂らす。房を一体として回し、曲面の形を保つ |
| 追従量 | 房ごとに係数0.7〜0.95を持つ。共通スライダーに掛け、38°で制限 |
| 照明 | 元のような球状の法線と上下の頂点色を持つ。カメラと一緒に照明法線を回さない |
| 葉画像 | 既存のleaf_broad.pngを再利用。画像生成・API・課金はなし |

木はmaple2_s・maple2_tの置換用2種類。どちらも固定76＋追従40＝116房。幹・枝と画像を作り直したため、前回と追従量だけの比較ではない。同じ専用木の追従0との比較も下段のBlender画像でできる。

## 制作と確認

1. 既存Builder・tube・材質処理を再利用してBlenderで生成。生成先はこのフォルダだけ。
2. `_CARD_ID`と、房ごとの中心・支点・向き・係数・角度上限をGLB＋JSONへ出力。
3. 前回のThree.js材質へ任意の支点・係数・上限を追加した。旧メタデータを読んだ場合は、以前と同じ中心回転になる。描画と影は同じ変形を使う。
4. 既存world.jsを専用フォルダへ生成し、本体を変更せず2種類の木だけ置き換える。Root／Passive View／Mediatorの比較UIを再利用。

### 再生成

作業ツリーのルートから実行する。

```powershell
& 'C:\Users\shind\AppData\Local\Programs\blender-4.2.23-windows-x64\blender.exe' -b --factory-startup --python codex/billboard-tree/build.py
python -I -X utf8 codex/partial-billboard/prepare.py 'C:\Users\shind\.codex\worktrees\horror-school\mmotest\codex\billboard-tree'
& 'C:\Users\shind\AppData\Local\Programs\blender-4.2.23-windows-x64\blender.exe' -b --factory-startup --python codex/billboard-tree/preview.py
```

### 確認結果

- Blender 4.2.23でGLB・blendを書き出した。2種類とも`fixed=76, moving=40`。
- GLBを読み、葉の116個のカードIDとJSONの対応が欠落なく残ることを確認。曲面の葉房は928頂点。
- Blenderで俯角20°・45°、方位0°・90°、現在／専用固定／専用0.65／専用上限の16画像を生成。
- 画像を実際に開いた。最初のv1は枝が露出しすぎたため、固定層を増やし、画像の葉が集まる部分を幹周囲に配置したv2へ修正。v2では幹が大きく透ける箇所が減った。外周の房の隙間と一部の枝は残る。
- 支点から頂点までの距離の誤差はBlender確認で最大`0.00000022 m`、固定頂点の丸め誤差は最大`0.00000012 m`。Three.js側は固定房・追従0では元の座標を直接返す。
- 固定版に対する専用0.65／上限の画素変化を確認。正面45°では100,926／105,884画素、正面20°では90,161／93,302画素（RGB最大差3超、1000×800）。品質の点数ではない。
- JavaScriptの構文確認は`node --check`。ブラウザでのGLSLコンパイル・動作確認とは分ける。
- 自動ブラウザ接続は前回のセキュリティ判定で拒否されたため、別ブラウザやPlaywrightで回避していない。新しい比較ページのThree.js実画面をこちらで開いた確認は未完了。
- 同日の会話で、ユーザーが比較ページの「専用の木が表示された」と確認した。専用版の表示開始はユーザー確認済み。カメラ全周・影・接続部の見え方や、正式採用の判断とは分ける。

## 保存物

- `assets/trees.blend`、`assets/*.glb`、`assets/cards.json`: 専用樹形2種。
- `shots/v2/`: 修正後16画像。`shots/v1/`は疎らだった初回の記録。
- `build.log`、`preview.log`、`preview-v2.log`: 生成・撮影記録。
- `renderer-source.json`: 再利用したrendererのハッシュと変更箇所。

## 残る確認

同日の次の評価は「草の生え方がそろっていない気がする。ヤシの木とかで」。葉の付き方・方向と追従を分ける追加試作を[codex/palm-billboard](../palm-billboard/README.md)へ作った。この広葉樹の形は維持し、ページにリンクだけ追加した。

- カメラを一周させたときの動き、枝の付け根の見え方、Three.jsの影の見え方は実画面で確認が必要。
- 固定した房と角度上限を使うため、どの角度からも全面が正面を向く木ではない。
- 今回は樹形の保持を優先。葉は464三角形で、既存maple2_sの160三角形より多い。省ポリ化・描画負荷の改善を確認した試作ではない。
- 葉画像は既存素材で、見本G02の葉そのものを再現したものではない。本体への採用は保留。

## 参考

- [GPU Gems 3: Next-Generation SpeedTree Rendering](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-4-next-generation-speedtree-rendering): 葉カード、房の陰影、影の描画の扱いを参照。コードの転載はない。
- 前回調査したMITの[drei Billboard](https://github.com/pmndrs/drei/blob/master/src/core/Billboard.tsx)と[threejs-billboard](https://github.com/MasatoMakino/threejs-billboard)の比較を継続利用。追加依存は入れず、既存Three.js r160の材質を拡張した。
