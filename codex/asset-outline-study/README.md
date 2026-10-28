# 既存アセットの輪郭研究

ヤシ（palm2_a_liked_frond_v4）、広葉樹（maple2_a）、既存のもみ（fir4_a）、岩（boulder_a）、木箱（crate）を、左が元・右が同条件で輪郭を追加した姿として並べる。アセット自体は変更していない。各素材の大きさは最大寸法で揃え、各対のカメラと光を揃えた。葉の裏面の照明は既存の world.js にある法線補正の考え方を再現している。

## 既存の手法

- **対象物のマスクから外形を描く**: three.js 標準 [OutlinePass](https://threejs.org/docs/pages/OutlinePass.html)。対象物を別途描いて画面上で境界を取り、合成する。今回は暗緑色の線に合成方法を調整し、透明な葉板は元画像のアルファをマスクに使う。対象物が１枚のマスクにまとまるので、重なった部分や内部の形の線は基本的に拾えない。マスクやぼかしの解像度と合成によるにじみ、画面上の小さな葉の欠落に注意。
- **逆向きの殻（inverted hull）**: 外側へ少し膨らませたモデルの裏面を描く。たとえば [Xenoblade の輪郭解析](https://scanmountgoat.github.io/xenoblade-rendering-research/outline.html) にある。材質や頂点ごとに制御しやすい一方、頂点法線や隙間が線の連続性に影響し、透明な板の中に描かれた葉の形はそのままでは拾えない。
- **深度・法線の境界検出**: カメラに見える距離や面の向きの変化を画面上で調べ、外形に加え内部の曲がり目にも線を出せる。対象外にも線が出る、細部がうるさくなる、閾値や表示距離で線が変わる可能性があり、対象分けと調整が必要。[技法解説](https://ameye.dev/notes/edge-detection-outlines/)。
- **素材に描き込む線**: 手描きの線や線用のテクスチャを用意する。自動検出だけでは伝えにくい形をアーティストが選べるが、視点や形が変わったときの見え方を確認する必要がある。[Guilty Gear Xrd の制作講演資料](https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf) は外形線と内側の線を別に考えている例。

## 参考実装

- [three.js OutlinePass / MIT](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/OutlinePass.js): 現在の試作で使用。公式 Three.js の追加モジュール。通常の選択マスクは一律材質で描かれるため、今回の葉の透明部分は実験用に考慮を加えた。
- [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) と [OutlineEffect](https://pmndrs.github.io/postprocessing/public/docs/class/src/effects/OutlineEffect.js~OutlineEffect.html): 選択物の輪郭を含む Three.js 向けの保守されている後処理ライブラリ。Zlib と元コード部分に MIT。今回は追加インストールせず公式付属版で小さく試した。

## 所見と未検証

ヤシは葉のまとまりが読みやすくなる。広葉樹は細い輪郭が増えて重く見えやすい。岩と箱は外側が締まるが、同じ暗緑色の線が素材に合うとは限らない。光・影・距離・線幅を変更した最終判断は未実施。比較は単体の平面上であり、既存ワールドへの導入、動作負荷の測定、モバイルと実ゲームの画面距離での検証はしていない。OutlinePass はこのデモでは各ビューで別に実行しているので、この構成のまま実ワールドへ適用する想定ではない。

輪郭強度を 0 と 4 にしたヤシの撮影で 15,598 画素に差が出ることを確認。`shots/strength-0.png` と `shots/strength-4.png` を保存。回転と表示の自動確認は `node codex/asset-outline-study/check.mjs`。
