# 板ポリを立体的に見せる技法の整理

## 何を変える技法か

|技法|主に変えるもの|必要な2D素材|向く場所|自由視点での限界|
|---|---|---|---|---|
|Normal / Bump Mapping|光の当たり方|法線画像 / 高さ画像|壁の粒、木目、細かい傷|輪郭と遮蔽は平面のまま|
|Parallax Mapping / POM / Relief Mapping|視線に応じた画像の位置、凹凸の遮蔽|色と高さ。Reliefでは深度の交点を探索|レンガ、敷石、溝、壁の浅い凹凸|裏側、張り出した脚、画像にない側面を復元できない|
|Interior Mapping|窓越しの仮想室内の投影|室内写真や部屋のアトラス|建物の窓、閉鎖された室内の入口|窓の外からの観察用。室内へ自由に入る用途ではない|
|Layered Cards / Multiplane Images|前後の層が動く量と遮蔽|手前・中・奥を分けた画像とアルファ|窓枠、廊下、木、背景、限定された移動範囲|層の隙間や、元の写真に写っていない部分が露出する|
|Directional / View-dependent Impostor|見る方向に対応した物体の姿|同一物体の多方向画像|小物、遠景、木。カメラへの向きは画像選択と組み合わせる|方向の間で跳びやすい。大きい近景では素材の一致が特に必要|
|Depth / Octahedral Impostor|複数方向の画像と深度を再投影し合成|整合した多方向の色・法線・深度|広い角度から見る物体、遠景LOD|正しい収録が前提。見えていなかった面や極端な近接は苦手|
|反射、接触影、光の統一|周囲とのつながり|材質画像、影のマスクなど|どの方法にも必要|形を復元する処理の代わりにはならない|

## この廊下への適用

1. 窓枠・壁・外景を別の層に分け、見込みの細い画像平面を足す。窓の外景は窓ごとに同じ絵を繰り返さず、離れた共通の背景にする。
2. 開いたドアの向こうには Interior Mapping を使う。今回の MIT 実装は一枚の室内写真を仮想の部屋の交点へ再投影する方式で、机ごとの独立した深度は持たない。
3. 椅子は単純な追尾ビルボードでは不足。多方向画像を選ぶところまでを試したが、生成した画像が正しい回転像になっていないため、製品品質の解決とはしない。
4. POM は学校の壁面に使える候補。ただし写真の明るい所を高く、暗い所を低くするだけでは、汚れと陰影まで出っ張ってしまう。意味のある高さ素材を用意してから試す。
5. 画像に描かれた陰影だけに頼らず、枠と壁が同じ光を受け、床に弱く反射し、接触部が暗くなるようにする。

## 一次資料と既存実装

- NVIDIA GPU Gems 2, Per-Pixel Displacement Mapping with Distance Functions。通常の法線表現から視差・遮蔽へ進む考え方と、距離場を使う探索。
  https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-8-pixel-displacement-mapping-distance-functions
- Epic Games Impostor Baker。多方向の色・深度などを収録し、視差を付ける構成。
  https://dev.epicgames.com/documentation/unreal-engine/impostor-baker-plugin-in-unreal-engine
- Three-Fenestra。Three.js用のInterior Mapping。MIT、採用した版とライセンスは ITERATIONS.md と vendor/ に記録。
  https://github.com/codedgar/three-fenestra
- Three.js r160 Reflector。反射用カメラ、反射面でのクリッピング、反射テクスチャの生成を担当する公式実装。
  https://github.com/mrdoob/three.js/blob/r160/examples/jsm/objects/Reflector.js
- Single-View View Synthesis with Multiplane Images, CVPR 2020。画像を深さの異なる平面へ分け、別視点へ合成する研究。
  https://openaccess.thecvf.com/content_CVPR_2020/html/Tucker_Single-View_View_Synthesis_With_Multiplane_Images_CVPR_2020_paper.html

既知の方式を用途ごとに組み合わせる。すべてを一枚のカラー画像から正確に復元できる一つの処理として扱わない。

## 追加調査

開発者自身の制作記事、画像面の組立、True Impostors、深度付きスプライト、室内の家具レイヤーを調べ直した記録: [RESEARCH-2026-10-24.md](./RESEARCH-2026-10-24.md)。前回の椅子の診断に、投影補正と深度補間の不足を追記。今回は実装変更なし。
