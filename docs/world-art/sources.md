# 出典と、その知見を当てた実験

外部の知見は「この作品の実際の作り方」ではない。画面が似たことから元作品の実装を断定しない。

| 問い | 出典 | 種類 | わかったこと | 当てた実験・結果 |
|---|---|---|---|---|
| RO3 のエンジン・描画方式は？ | [Ragnarok Online 2（Wikipedia）](https://en.wikipedia.org/wiki/Ragnarok_Online_2:_The_Gate_of_the_World)、[Gravity × UE3（Unreal Engine ブログ, 2013）](https://www.unrealengine.com/blog/gravity-launches-tower-of-ascension-using-unreal-engine-technology)、[Gravity Neocyon の 3D 新作（Massively OP）](https://massivelyop.com/?p=335495)、[RO3（ppe.pl）](https://www.ppe.pl/gry/ragnarok-online-3/20012) | 〔観察〕二次資料 | RO3 のエンジンは**未確認**（RO2 は UE2.5、Gravity の他作品に UE3・Unity）。 | 画面からの推定にとどめる方針を維持 |
| トゥーン調の水の、岸の泡・寄せる波の定番の作り方は？（2026-10-22） | [Stylized Water Shader（Godot Asset Store）](https://store.godotengine.org/asset/emace-art/stylized-water-shader/)、[Unigine FieldShoreline](https://developer.unigine.com/en/docs/2.17/api/library/fields/class.fieldshoreline)、[Stylized water shader for UE4（80.lv）](https://80.lv/articles/stylized-water-shader-for-ue4) | 販売ページ・エンジンの文書 | 色・泡の量は底までの深さで決める。岸の波は、岸からの距離場（shoreline distance field）を前もって焼き、その値の帯（smoothstep）を時間で動かす | 水の規則 w1（rules/water-w1.md）: 距離場を height.png の G に焼き（build_map.py）、寄せる波の線とレースを距離で描いた。底の深さで作った版は線が島に切れていた |
| 葉カードの陰影をまとまりとして見せる定番の方法は？ | [Foliage Normals（Superhive, 販売ページ）](https://superhivemarket.com/products/foliage-normals)、[同 FAQ](https://superhivemarket.com/products/foliage-normals/faq)、[stylized tree shader（BlenderNation 2022）](https://www.blendernation.com/2022/08/11/building-a-fancy-stylized-tree-shader-in-blender-3-2/)、[cremuss（ArtStation）](https://cremuss.artstation.com/projects/Vyz12R)、[Simon Schreibt: Trees](https://simonschreibt.de/tag/trees/)、[Polycount の議論](https://polycount.com/discussion/comment/2490242) | 〔本人〕〔観察〕販売ページは売り手の主張 | 樹冠全体を包む凸包・球から法線を写す（3ds Max の Normal Thief 以来の定番）。裏面で法線を反転させると黒くなる。 | **E07**: 樹冠全体の中心からの法線は大きな明暗が出るが小房のでこぼこが消える。小房 4 : 樹冠 6 の混合を採用。裏面で反転させない処理は E04 で採用済み |

imozuru（https://github.com/MaryCache/imozuru, commit 14635fb）は `~/.claude/skills/imozuru` に入れてある。指示により、行き詰まったときと知見を集めるときに使う。この 2 つの問いは通常の検索で足りたため使っていない。
