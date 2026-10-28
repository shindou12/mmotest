# 葉の芯を保つヤシ

2026-10-25。ユーザーの「草の生え方がそろっていない気がする。ヤシの木とかで」という評価を受けた独立試作。葉房があちこちを向く問題を、葉の生える位置・方向と、カメラへの補正を分けて扱う。

## 見る

- [見本｜現在｜試作](http://127.0.0.1:8172/codex/palm-billboard/)
- [同じ専用ヤシの固定｜追従](http://127.0.0.1:8172/codex/palm-billboard/same-tree.html)

左はB03下側のヤシをCSSで拡大した資料。クリックで全体を開く。中央は既存palm2_a、右は専用ヤシ。後者2画面は同じカメラ・照明。ドラッグで方位、メニューで視点、スライダーで右の追従量を操作する。地図から切り離した単体比較で、地形・地面の草は対象外。

## 変えたこと

- 幹の頂点に18本の葉を集める。下へ垂れる成熟葉7本、横へ開く葉7本、立つ新葉4本。方位は各層でずらし、小さなばらつきだけを加える。
- 前回の広葉樹のように葉房全体を自由回転させず、**葉の芯の位置・放射方向・付け根・先端を固定**する。
- 葉を9断面の帯として作り、各断面の中心線のまわりで葉面だけをひねる。隣り合う面は頂点を共有し、別々のカードのように境目が開くことを防ぐ。
- 根元・先端は追従0、中間ほど強くする。角度補正32°×断面係数で、成熟葉の最大は22.4°、新葉は14.4°。画面の1はこの設計上限。
- 軸制限ビルボードの方向計算に、両面の葉向けの連続する小さな補正を使う。裏側で180°反転させず、軸方向から見ると補正を弱める。完全追従へ切り替える方式ではない。
- 葉の照明法線は固定。影にも主カメラと同じ変形を適用する。
- 既存frond_palm.png・wood.pngとBuilder・tube・crown_colorを再利用。画像生成、API、課金、追加インストールなし。

専用palm2_a・palm2_b・palm2_lowの3種類を出力。ページで比較するのはpalm2_a。全種類18葉・162断面・葉576三角形。既存palm2_aは葉120三角形のため、負荷削減を示す試作ではない。樹形も変更しており、追従だけの効果はsame-tree.htmlか下段の固定画像と比較する。

## 実際に見て直したこと

B03、既存葉画像、前回の専用広葉樹、今回のBlender画像を開いて判断した。

最初のv1は専用葉が暗かった。v2で頂点色を既存に近づけたが、暗さは残った。面の巻き順が下向きで照明法線と一致しないことを確認し、v3で表を上向きに修正した。v3では黄緑の表面が見え、放射状の形と葉の層を読み取りやすくなった。正面40°、低い18°、方位90°の画像を実際に開いた。

葉が細かく均等に並ぶ既存テクスチャの性質は残る。見本の手描きの葉や太い房を再現したものではない。低い視点では幹の上端が見える箇所も残る。

## 再生成と確認

この作業ツリーのルートから実行する。

```powershell
& 'C:\Users\shind\AppData\Local\Programs\blender-4.2.23-windows-x64\blender.exe' -b --factory-startup --python codex/palm-billboard/build.py
& 'C:\Users\shind\AppData\Local\Programs\blender-4.2.23-windows-x64\blender.exe' -b --factory-startup --python codex/palm-billboard/preview.py
node --check codex/palm-billboard/foliage.js
node --check codex/palm-billboard/scene.js
```

- Blender生成・撮影は完了。現在／専用固定／専用0.7／専用上限 × 3視点の12画像をv3へ保存。
- Blenderで芯の移動誤差`CENTERLINE_ERROR=0.00000000 m`、付け根・先端の移動誤差`ROOT_TIP_ERROR=0.00000000 m`。
- GLBバイナリとJSONの162断面IDが3種類とも欠けずに一致。結果はinspection.log。
- 固定に対する0.7・上限の画素応答はinspection.logへ記録。2段階とも画像が変わることの確認で、品質スコアではない。
- glTF書き出しには既存材質由来の`More than one shader node tex image used for a texture`警告が残る。書き出し自体は成功。画像とSamplerのブラウザでの見え方は未確認。
- 以前の自動ブラウザ接続はセキュリティ判定で拒否されているため、別手段で回避していない。**このヤシのThree.js実画面・GLSL動作はまだ確認できていない。** Blender画像はThree.jsの撮影ではない。

保存先: assets/palms.blend・各GLB・cards.json、shots/v3、build-v3.log、preview-v3.log、inspection.log。v1・v2は修正履歴。既存ページは維持し、リンクを追加した。本体採用は保留。

## 調査と出典

- [drei Billboard実装](https://github.com/pmndrs/drei/blob/master/src/core/Billboard.tsx)、[MITライセンス](https://github.com/pmndrs/drei/blob/master/LICENSE)、[リリース履歴](https://github.com/pmndrs/drei/releases): 軸制限と親座標の考え方を再確認。更新が続くOSSだがReact/R3F依存があり、葉の曲線軸をそのまま扱う部品ではないため導入していない。
- [NVIDIA GPU Gems 3: Next-Generation SpeedTree Rendering](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-4-next-generation-speedtree-rendering): 葉カードと影・両面照明の扱いを継続参照。今回の断面変形そのものを紹介した資料ではない。
- [SpeedTree担当者による葉の向きの説明](https://discussions.unity.com/t/how-do-i-fix-upside-down-leaf-alignment-in-speedtree/1543716): 葉素材の基準方向と、Out・Up・Spiral・Spreadなどを揃える制作上の考え方。商用ツールの説明を参照しただけで、導入・コード転載なし。

SpeedTree公式のfrond_generator・leaf_generatorページは取得が403で失敗した。読めた資料と区別している。
