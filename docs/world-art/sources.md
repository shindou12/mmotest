# 出典と、その知見を当てた実験

外部の知見は「この作品の実際の作り方」ではない。画面が似たことから元作品の実装を断定しない。

## 草刃の描画（M-0184）
- [Grass Rendering Series 1: Theory](https://hexaquo.at/pages/grass-rendering-series-part-1-theory/) と [Part 2: Full Geometry Grass in Godot](https://hexaquo.at/pages/grass-rendering-series-part-2-full-geometry-grass-in-godot/): 短い草のシェルと背の高い草の刃形状を使い分ける。Godot 側の刃は複数段のテーパー形状にし、法線を上向きへ寄せ、根元を地面色へ混ぜる。
- [2Retr0/GodotGrass](https://github.com/2Retr0/GodotGrass)（MIT）と [Procedural Grass in Ghost of Tsushima（GDC 2021）](https://gdcvault.com/play/1027214/Advanced-Graphics-Summit-Procedural-Grass): 草を刃ごとに配置し、細胞状の房で高さ・傾きなどを共有する構成の参考。ここでは seed 固定の Voronoi 房を使い、8m 区画の MultiMesh に配置した。
- [Grass normals matching ground（Polycount）](https://polycount.com/discussion/comment/2725691): 草の法線を地面に近づけて、草が別の材質に見えにくくする考え方。ここでは根元を上向き、先端を上向き 70% に混ぜ、地面と同じ色・太陽・空光の関数を使う。

| 問い | 出典 | 種類 | わかったこと | 当てた実験・結果 |
|---|---|---|---|---|
| RO3 のエンジン・描画方式は？ | [Ragnarok Online 2（Wikipedia）](https://en.wikipedia.org/wiki/Ragnarok_Online_2:_The_Gate_of_the_World)、[Gravity × UE3（Unreal Engine ブログ, 2013）](https://www.unrealengine.com/blog/gravity-launches-tower-of-ascension-using-unreal-engine-technology)、[Gravity Neocyon の 3D 新作（Massively OP）](https://massivelyop.com/?p=335495)、[RO3（ppe.pl）](https://www.ppe.pl/gry/ragnarok-online-3/20012) | 〔観察〕二次資料 | RO3 のエンジンは**未確認**（RO2 は UE2.5、Gravity の他作品に UE3・Unity）。 | 画面からの推定にとどめる方針を維持 |
| トゥーン調の水の、岸の泡・寄せる波の定番の作り方は？（2026-10-22） | [Stylized Water Shader（Godot Asset Store）](https://store.godotengine.org/asset/emace-art/stylized-water-shader/)、[Unigine FieldShoreline](https://developer.unigine.com/en/docs/2.17/api/library/fields/class.fieldshoreline)、[Stylized water shader for UE4（80.lv）](https://80.lv/articles/stylized-water-shader-for-ue4) | 販売ページ・エンジンの文書 | 色・泡の量は底までの深さで決める。岸の波は、岸からの距離場（shoreline distance field）を前もって焼き、その値の帯（smoothstep）を時間で動かす | 水の規則 w1（rules/water-w1.md）: 距離場を height.png の G に焼き（build_map.py）、寄せる波の線とレースを距離で描いた。底の深さで作った版は線が島に切れていた |
| トゥーン調の水の、沖のきらめき・反射の定番の作り方は？（2026-10-22） | [Stylized Toon Water（Godot Shaders）](https://godotshaders.com/shader/stylized-toon-water/)、[fBm Toon Water（Godot Shaders）](https://godotshaders.com/shader/fbm-toon-water)、[Specular highlights on water（gamedev.net）](https://gamedev.net/forums/topic/614608-specular-highlights-on-water) | シェーダーの共有・掲示板 | きらめきは、動くノイズで揺らした法線の鏡面反射（Phong）をしきい値で切って白い点にする（Super Mario Sunshine もノイズ＋条件）。見る角度で色を変えるフレネル（1 − n·v） | 水の規則 w1 の沖の反射: 横に長い波の法線でトゥーンの鏡面反射ときらめき、フレネルで空の色 |
| 葉カードの陰影をまとまりとして見せる定番の方法は？ | [Foliage Normals（Superhive, 販売ページ）](https://superhivemarket.com/products/foliage-normals)、[同 FAQ](https://superhivemarket.com/products/foliage-normals/faq)、[stylized tree shader（BlenderNation 2022）](https://www.blendernation.com/2022/08/11/building-a-fancy-stylized-tree-shader-in-blender-3-2/)、[cremuss（ArtStation）](https://cremuss.artstation.com/projects/Vyz12R)、[Simon Schreibt: Trees](https://simonschreibt.de/tag/trees/)、[Polycount の議論](https://polycount.com/discussion/comment/2490242) | 〔本人〕〔観察〕販売ページは売り手の主張 | 樹冠全体を包む凸包・球から法線を写す（3ds Max の Normal Thief 以来の定番）。裏面で法線を反転させると黒くなる。 | **E07**: 樹冠全体の中心からの法線は大きな明暗が出るが小房のでこぼこが消える。小房 4 : 樹冠 6 の混合を採用。裏面で反転させない処理は E04 で採用済み |

imozuru（https://github.com/MaryCache/imozuru, commit 14635fb）は `~/.claude/skills/imozuru` に入れてある。指示により、行き詰まったときと知見を集めるときに使う。この 2 つの問いは通常の検索で足りたため使っていない。

## もみの見本（2026-10-23、`art/ref/trees/`）
研究の参考に使う見本で、外部へ公開しない。
- T01: YouTube のサムネイル（`i.ytimg.com/vi/3NeAoBqD3MM/maxresdefault.jpg`、「Ragnarok Online 3 HD Open-world Gameplay & Latest Trailer」、プロンテラ南門）
- T02〜T04: 4Gamer の記事の画像（トレーラーのキャプチャ、`www.4gamer.net/games/854/G085427/20250731033/SS/031.jpg`・`032.jpg`・`030.jpg`、ギルドリーグの戦場）

## 画面の見え方の研究（M-0175）
- 手描き風の環境の手法: [Turning a 2D illustration into a 3D environment](https://80.lv/articles/turning-a-2d-illustration-into-a-3d-environment-with-a-hand-painted-look)、[Forest Waypoint in UE4](https://80.lv/articles/forest-waypoint-in-ue4-creating-stylized-landscape-and-materials)、[Stylized Pacific Northwest forest](https://80.lv/articles/take-a-walk-in-a-stylized-pacific-northwest-forest-visualized-in-3d)
- RO3 の開発元と紹介: [mmos.com](https://mmos.com/news/raagnarok-online-3-revealed-in-first-gameplay-trailer)、[4Gamer の G-STAR 2025 の記事](https://www.4gamer.net/games/854/G085427/20251114027/)
- Samsara Saga の紹介（第三者の掲載）: [Discord の掲載](https://discordhunt.com/en/servers/989587246111944755)

## スタイライズの手法の試し（M-0178）
- 原神の環境の描き方（miHoYo の講演の資料）: [Unity Dojo 2021 の資料（Docswell）](https://docswell.com/s/UnityJapan/KWRPQ5-210617-unity-dojo20211mihoyozhenzhongyi)
- 影の縁に色を差す: [Colored penumbras](https://nailsaglamer.pages.dev/blog/colored-penumbras)
- 影と日なたを分けて色を付ける・Kuwahara の使いどころ: [Stylized Rendering in Unreal（The Rookies）](https://www.therookies.co/entries/7431)
- Kuwahara の仕組み（WebGL）: [On Crafting Painterly Shaders](https://blog.maximeheckel.com/posts/on-crafting-painterly-shaders)
- 絵に Kuwahara を掛けて塗った見た目にする（Blender）: [80.lv の解説](https://80.lv/articles/tutorial-how-to-make-any-texture-look-painterly-in-blender/)
