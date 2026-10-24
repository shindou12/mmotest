# 夜の校舎の改善記録

## 方針
2D画像を使う制約のまま、静止画と歩行時の両方で説得力を上げる。AAAは目標であり、到達の断言はしない。現段階の版を baseline.html / baseline.js に固定し、比較は方向見本（生成した構図案）｜現在（固定した旧版）｜試作で行う。構図案をゲーム映像の見本や研究の測定正本とは扱わない。

## 今回の順序
1. 壁画像の端が引き伸ばされる不具合、廊下と建具の尺度、透過素材の描画順を直す。
2. Three-Fenestra の既存 GLSL を使って教室を Interior Mapping にする。
3. Three.js r160 の Reflector、EffectComposer、UnrealBloomPass を使い、床・光・暗部をまとめる。
4. 8方向の椅子画像を切り替える既知の directional impostor を試す。生成画像の形が揃わなければ採用しない。
5. 入口、窓際、開いたドア、椅子の前後を実際に歩いて見直し、改善前後を記録する。

## 参考実装と選択
- Three.js r160 / MIT: 既存の導入版を維持し、平面反射と仕上げを公式 addons で実装。反射は描画が一回増えるため解像度を制限する。
  https://github.com/mrdoob/three.js/blob/r160/examples/jsm/objects/Reflector.js
- Three-Fenestra / MIT / d63feeb1d43fc0156d622eeb9f3e115532147113: src/shader/chunks.ts は型を含まない JavaScript のため、内容を変えず vendor/interior-chunks.js に保存。部屋写真を視線と仮想の室内深度に応じて再投影する glslCore を使う。室内画像は事前に光の付いた絵で、実際の室内模型や入室可能な空間ではない。
  https://github.com/codedgar/three-fenestra
- Drei SpriteAnimator / MIT: アトラスから表示領域を切り替える構成を参考にする。Reactの追加依存を導入する必要がないためパッケージ自体は導入しない。
  https://github.com/pmndrs/drei/blob/master/src/core/SpriteAnimator.tsx
- agargaro/octahedral-impostor / MIT: WIP。深度付き多方向キャプチャを必要とするため、生成した2D画像だけから完全な octahedral impostor が得られるとは扱わない。
  https://github.com/agargaro/octahedral-impostor
- NVIDIA GPU Gems 2 / Per-Pixel Displacement Mapping: POM/Relief の用途と限界を確認。表面の高さ用で、大きく裏側へ回る物体を一枚絵だけで完全に復元する方式ではない。
  https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-8-pixel-displacement-mapping-distance-functions

## 使用制約
変更は codex/school-horror 以下。APIキー、従量課金、追加インストールなし。Godot と他ブランチの作業は対象外。

## 実画面での反復結果（今回）

1. 最初の描画では、旧版の横長で黒く抜けた空間から、学校らしい幅と高さに直せた。ただし蛍光灯の点光源が天井を白く飛ばし、椅子が浮いた。
2. 蛍光灯を弱めて位置を下げ、窓光の位置を開口に合わせた。窓からの青い光と枠の影が右壁・床へ入り、暖色の照明との区別が出た。椅子の画像内の余白を考慮して表示位置を下げた。画像ファイル自体は加工していない。
3. Interior Mapping を同じ撮影位置で depth=0 / depth=1.2 に変えて実画面を開いた。窓・机の投影が変わることを確認（shots/door-depth-off.jpg / shots/after-door-depth.jpg）。色の濃い教室画像は最初黒く潰れたため、室内の明るさと横のサンプリング範囲を直した。
4. 椅子を正面側と反対側から実際に開いた（shots/chair-front.jpg / shots/chair-back.jpg）。裏へ回っても正面画像が追尾する問題は減った。ただし生成した8枚の角度・形状は厳密には揃っておらず、切替の跳びは解消していない。完成品の素材として採用確定とは扱わない。
5. WASDの前進とドラッグの見回し、懐中電灯を実操作。描画エラーと警告の取得結果は空配列。node --check の3ファイルは終了コード0。

### 全体を揃えるルールの暫定案

- 冷たい外光と暖かい室内灯の役割を分ける。暗い所も全て黒にせず、材質の中間調を残す。
- 枠だけ明るい無照明素材にしない。同じ場所の壁と枠が同じ光を受け、奥は別の暗さになるようにする。
- 接地、開口の見込み、前後の遮蔽を先に揃える。強いbumpやBloomで奥行きの不足を隠さない。
- 床は全面を鏡にせず、窓や照明が斜めに映る程度に留める。

### 次に必要なこと

AAA品質には未到達。特に近距離の椅子には、同一物体を正しい角度で収録した方向画像と深度が必要。今回の8枚はその代用になり切れていない。自由な視点移動には、POMの高さ画像、深度付きインポスター、複数レイヤーそれぞれに素材制作の制約がある。一枚絵の裏側を自動的に正しく作れる方式として説明しない。

追加で確認した一次資料:
- Epic Impostor Baker: 多方向の色・法線・深度と、視差による改善。
  https://dev.epicgames.com/documentation/unreal-engine/impostor-baker-plugin-in-unreal-engine
- Three.js Transparency: alphaTestと深度バッファの使い分け。
  https://threejs.org/manual/en/transparency.html
- Three.js Post Processing: 既存のPassを組み合わせる。
  https://threejs.org/manual/en/post-processing.html
