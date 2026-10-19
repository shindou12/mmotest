# 出典と、その知見を当てた実験

外部の知見は「この作品の実際の作り方」ではない。画面が似たことから元作品の実装を断定しない。

| 問い | 出典 | 種類 | わかったこと | 当てた実験・結果 |
|---|---|---|---|---|
| RO3 のエンジン・描画方式は？ | [Ragnarok Online 2（Wikipedia）](https://en.wikipedia.org/wiki/Ragnarok_Online_2:_The_Gate_of_the_World)、[Gravity × UE3（Unreal Engine ブログ, 2013）](https://www.unrealengine.com/blog/gravity-launches-tower-of-ascension-using-unreal-engine-technology)、[Gravity Neocyon の 3D 新作（Massively OP）](https://massivelyop.com/?p=335495)、[RO3（ppe.pl）](https://www.ppe.pl/gry/ragnarok-online-3/20012) | 〔観察〕二次資料 | RO3 のエンジンは**未確認**（RO2 は UE2.5、Gravity の他作品に UE3・Unity）。 | 画面からの推定にとどめる方針を維持 |
| 葉カードの陰影をまとまりとして見せる定番の方法は？ | [Foliage Normals（Superhive, 販売ページ）](https://superhivemarket.com/products/foliage-normals)、[同 FAQ](https://superhivemarket.com/products/foliage-normals/faq)、[stylized tree shader（BlenderNation 2022）](https://www.blendernation.com/2022/08/11/building-a-fancy-stylized-tree-shader-in-blender-3-2/)、[cremuss（ArtStation）](https://cremuss.artstation.com/projects/Vyz12R)、[Simon Schreibt: Trees](https://simonschreibt.de/tag/trees/)、[Polycount の議論](https://polycount.com/discussion/comment/2490242) | 〔本人〕〔観察〕販売ページは売り手の主張 | 樹冠全体を包む凸包・球から法線を写す（3ds Max の Normal Thief 以来の定番）。裏面で法線を反転させると黒くなる。 | **E07**: 樹冠全体の中心からの法線は大きな明暗が出るが小房のでこぼこが消える。小房 4 : 樹冠 6 の混合を採用。裏面で反転させない処理は E04 で採用済み |

imozuru（https://github.com/MaryCache/imozuru, commit 14635fb）は `~/.claude/skills/imozuru` に入れてある。指示により、行き詰まったときと知見を集めるときに使う。この 2 つの問いは通常の検索で足りたため使っていない。
