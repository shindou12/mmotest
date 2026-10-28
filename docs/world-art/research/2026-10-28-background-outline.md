# three.js で「背景」に輪郭線を入れてトゥーン／絵画調に統一する方法

結論から言うと、今回の条件――**45°見下ろしでカメラ回転が少ない、背景の木や草に alpha-test の板ポリゴンを多用、three.js r160**――では、背景全体を `OutlinePass` や inverted hull だけで囲うより、**「線を出す対象を分類した depth + normal + ID のスクリーンスペース輪郭」＋「葉だけ別扱い」＋「弱めの接地 AO」**が最も破綻しにくいです。

特に重要なのは、**葉の透明境界をそのまま全部「線」と解釈しないこと**です。Sable は遠景ほど輪郭を薄くして奥行きを作り、Borderlands は外周線とテクスチャに描いた内部線を分離し、Rollerdrome は専用 renderer で edge detection と line rendering を制御しています。つまり、市販タイトルでも「画像中の全エッジを均一な線にする」のではなく、**何を線として読むかをアート側で限定する**設計が中心です。 citeturn21view2turn21view3turn21view4

また three.js r160 の `OutlinePass` をコードレベルで見ると、選択物をマスク化するための専用 override material を使う構成で、元マテリアルの alpha-map / alpha-test をそのまま再現する経路にはなっていません。したがって **cutout の葉をそのまま選択対象にすると、葉の形ではなくカードや不適切なマスクが輪郭処理に混ざる可能性がある**、というのが今回の用途での大きな注意点です。これは r160 の実装からの推論です。 citeturn23view0

## 市販ゲームの事例

以下は「背景そのものに線を使う作品」と、「線そのものではないが背景をイラストとして成立させる近似表現」を分けて見たものです。公開資料で色・幅の具体的な数値が確認できないタイトルについては、推測で埋めず「非公開」としています。

| 名前 | 何をしているか／何に線を入れるか | 出典の URL | 今回使えそうな点 |
|---|---|---|---|
| **Hi‑Fi Rush** | Tango Gameworks はキャラクターだけでなく**環境を含むゲーム全体**に専用の deferred toon renderer を使用。UE4 の既存 pass をカスタムし、toon light、shadow、comic shader などを組み合わせて 3D 世界を 2D 的に見せている。公開記事からは、木・岩などの個別カテゴリごとの輪郭色・線幅ルールまでは確認できない。 citeturn21view0 | <https://80.lv/articles/the-making-of-hi-fi-rush-s-3d-toon-rendering-style> | 「人物だけ outline、背景は通常 PBR」ではなく、**背景側の lighting / shadow / postprocess まで同じ文法にする**ことが重要、という好例。単独の輪郭 pass だけを足すより参考になる。 |
| **Sable** | 輪郭線を単なる装飾ではなく**遠近感とスケール感を作る要素**として使う。環境のグリッド状の線やオブジェクト配置も輪郭が読みやすくなるよう設計。特に重要なのが、**距離が増すほど outline の opacity を落とす**処理。色・正確な px 幅は公開記事では明記されていない。 citeturn21view2 | <https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability><br><https://gdcvault.com/play/1027721/The-Art-of-Sable-Imperfection> | 今回の固定見下ろしマップに非常に相性がよい。**遠景の木・建物の線を消して画面密度を下げる**設計をそのまま応用できる。 |
| **Rollerdrome** | Roll7 は独自の **NoComply renderer** を開発。Unity の紹介によれば、スタイル実現に「かなりの edge detection と line rendering」を使い、少ないポリゴンと小さな gradient texture から色面＋輪郭を作る。特定の木／地面カテゴリの線ルールや具体的な色・幅は公開資料では未詳。 citeturn21view3 | <https://unity.com/resources/rollerdrome> | **postprocess edge detection を製品レベルでアートディレクションする例**。単純 Sobel ではなく、専用 renderer として線を扱う発想が参考になる。 |
| **Denshattack!** | 開発チームはスタイルを flat shading、強い線、黒い shadow を中心に構築。アセット間で共用する master texture 群に、**cel-shaded asset 用の黒線を与える outline texture**を設けている。つまり「画面を Sobel で全部囲う」だけでなく、**アセット側で線を描き込む**方式が強い。植生はスタイル維持が難しい要素として言及されている。 citeturn21view1 | <https://80.lv/articles/interview-how-denshattack-blends-tony-hawk-jet-set-radio-with-trains> | 木・岩・建物の「見せたい内部線」を texture に逃がせる。**葉カードに post outline を掛け過ぎない**ための有力な設計。 |
| **Borderlands** | 非常に参考になる事例。Gearbox は**各アセットに暗い外周線**を付け、さらに diffuse texture 内にも ink stroke を描いた。外周の太い線は UE3 内で geometry に沿って procedural に生成し、内部線は hand-painted。岩もまず ink で描いてから 3D 化した例がある。線を増やしすぎると人物の魅力を損なうため、Lilith では細線を減らし、Brick では増やすなど**対象ごとに線密度を変えた**。さらに AO で物体を地面に馴染ませている。 citeturn21view4 | <https://www.cgw.com/Publications/CGW/2009/Volume-32-Issue-11-Nov-2009-/A-Fine-Line.aspx><br><https://www.gdcvault.com/play/1012220/Borderlands-and-the-11th-Hour> | 今回かなり有効。**外周線＝shader、内部線＝texture、接地＝AO**に役割分担することで、「全部 Sobel で拾って画面がうるさい」問題を避けられる。 |
| **Valkyria Chronicles** | SEGA の CANVAS 系表現は「硬い黒 contour を全物体に付ける」より、**水彩・鉛筆画的な面と影で背景まで同一の絵として成立させる**方向。開発資料では環境と人物で異なる強さの shadow を必要としたことも説明されており、リアルな均一 shading より画材的な階調を優先している。これは「輪郭線に近い画面分離」の例として見るのがよい。 citeturn17search24turn17search27 | <https://www.gamedeveloper.com/design/emotions-and-war-the-valkyria-chronicles-interview><br><https://nintendoeverything.com/valkyria-chronicles-4-producer-on-when-development-started-what-makes-this-entry-different-canvas-system-more/> | **背景は必ずしも線で囲わなくてよい**という重要な比較対象。地面・草は線を減らし、AO、影、色面、紙／絵具系処理で分離したほうが画面が整理される。 |
| **Genshin Impact 系の再現研究** | 公開された第三者による Unity 再現では、キャラクター outline を **scene depth + scene normal** の差で抽出し、不必要な顔の線を抑えるため depth 側を操作している。これは背景処理の公式資料ではなく、むしろ「人物には線、背景には同程度の線を掛けない」という比較材料として有用。 citeturn20search3 | <https://adrianmendez.artstation.com/projects/wJZ4Gg> | **normal/depth edge を無条件に全画面へ適用しない**設計の参考。人物と背景で edge policy を分けるべき。 |
| **Guilty Gear Xrd 系** | 主にキャラクター向けだが inverted hull の実運用資料として重要。Arc System Works は vertex color で不要な line を消し、谷形状で線が浮く問題も局所的な line width 調整で解決している。つまり inverted hull も「一律 extrusion」ではなく**頂点単位で描く／描かないを制御**する。 citeturn21view6 | <https://www.docswell.com/s/ASW_Academy/5LVY67-GG-Toonline-Eng><br><https://www.arcsystemworks.com/guilty-gear-xrds-art-style-the-x-factor-between-2d-and-3d-talk-from-gdc-2015-is-now-available-online/> | 建物や大岩には応用できるが、**alpha card の葉には向かない**。木なら幹・太枝だけ hull、葉は別方式、という分業がよい。 |

ここから見える共通点は、**「線を全物体・全距離・全ディテールに同じ強さで出す」タイトルはむしろ少ない**ことです。Sable は距離で消し、Borderlands は対象によって内部線密度を変え、Guilty Gear は vertex 単位で不要線を抑制します。背景用の線は、エッジ検出アルゴリズムそのものより**線を出さない規則**のほうが重要です。 citeturn21view2turn21view4turn21view6

## 切り抜き葉の輪郭線

alpha-test の葉カードは、背景輪郭で最も事故が起きやすい部分です。通常の「不透明メッシュ」を前提とした depth/normal edge detector にそのまま投入すると、**葉の細かな穴、細枝、1 px 未満の alpha fragment が全部エッジ候補**になります。Godot の公式資料でも foliage/fence には hard cutout 型の Alpha Scissor が適している一方、hard alpha edge は aliasing を起こすため、alpha-to-coverage 系の対策が用意されています。 citeturn23view2

| 名前／方法 | 何をしているか | 出典の URL | 使えそうな点 |
|---|---|---|---|
| **alpha-aware depth / normal prepass** | color pass と**まったく同じ alpha texture・alphaTest threshold で `discard`**してから depth / normal / ID を書く。透明部分には depth も normal も書かない。 | three.js r160 `OutlinePass`: <https://github.com/mrdoob/three.js/blob/r160/examples/jsm/postprocessing/OutlinePass.js> citeturn23view0 | 最低限必要。葉カード全面が四角く outline される事故を防ぐ。 |
| **OutlinePass の cutout 対応を自作** | r160 の stock `OutlinePass` は selected object 用に専用 mask material を使うため、元マテリアルの alpha cutout をそのまま反映する設計ではない。そこで material ごとの `map / alphaMap / alphaTest` を引き継ぐ custom depth/mask material を用意する。これはソースからの実装上の推論。 citeturn23view0 | <https://github.com/mrdoob/three.js/blob/r160/examples/jsm/postprocessing/OutlinePass.js> | 今の OutlinePass を継続利用するなら最優先修正。 |
| **低周波 foliage mask / proxy canopy** | 実際の葉カードは outline source から除外し、木冠を包む低ポリ球・楕円・簡略 canopy mesh のみを ID/depth mask に描く。visible color は元の葉カードのまま。 | Sable の「readability のために線と object placement を設計」という考え方と整合する。 citeturn21view2 | **今回最もおすすめ。** 個々の葉ではなく「木の塊」に 1 本だけ線が出る。 |
| **outline 用 alpha を別チャンネル化** | RGB/A の visible alpha と別に「線を拾ってよい大きな形」を G/B channel 等へ保持。細穴・葉脈は outline mask では埋める。 | Borderlands が外周線と内部 ink を別系統で扱った実例が参考になる。 citeturn21view4 | proxy mesh を増やしたくない場合に便利。 |
| **alpha-to-coverage** | hard cutout のサンプル境界を MSAA coverage に変換して jaggy を抑える。three.js r160 の Material にも `alphaToCoverage` 用の設定があり、一般的な alpha anti-aliasing として foliage に有効。Godot 公式資料も Alpha Edge Blend / Clip を alpha-to-coverage と説明している。 citeturn23view1turn23view2 | <https://github.com/mrdoob/three.js/blob/r160/src/materials/Material.js><br><https://docs.godotengine.org/en/stable/tutorials/3d/standard_material_3d.html> | **表示中の葉のギザギザ**には有効。ただし「線を減らす」手段ではないので outline mask 自体は別途整理する。 |
| **texture に輪郭を描く** | 葉の塊の外側だけに暗い border を texture 自体へ描く。postprocess は葉を無視する。 | Borderlands は texture 内の ink と procedural exterior line を併用。Denshattack! も outline 用 texture をアセット pipeline に持つ。 citeturn21view4turn21view1 | 固定寄りのカメラなら非常に強い。葉カードとの相性がよく、最も predictable。 |
| **inverted hull** | solid mesh の外殻を反転して silhouette を描く。 | Arc System Works の資料では valley や unwanted line を vertex color で制御。 citeturn21view6 | 幹、岩、建物には良いが、**葉カード本体には原則使わない**。 |

典型的な失敗と対策は次のようになります。

| 症状 | 主因 | 実用的な対策 |
|---|---|---|
| **葉の中が黒い点々だらけ** | alpha の小穴、1～2 px の葉片をすべて depth/normal edge として拾っている。 | foliage では normal edge を無効化し、**proxy canopy の silhouette のみ**を見る。あるいは outline-mask 用 alpha を blur → threshold して小穴を埋める。 |
| **遠景の木がチラチラする** | 1 pixel 未満になった alpha detail がフレームごとに残ったり消えたりする。hard alpha edge 自体も aliasing しやすい。 citeturn23view2 | alpha mipmap、alpha-to-coverage、距離による outline fade、遠距離 foliage LOD、outline mask の低解像度化を併用。 |
| **葉カードが長方形に囲われる** | auxiliary mask/depth pass が元 material の alpha discard を再現していない。r160 `OutlinePass` はここを特に確認すべき。 citeturn23view0 | custom mask material で元の alpha map + threshold を再現する。 |
| **草原が真っ黒になる** | 数百・数千の grass blade の silhouette を全部抽出している。 | 草は原則 outline 対象外。**地面との contact darkening と toon shading だけ**にする。重要な背の高い草束だけ別 ID。 |
| **木の葉の後ろに線が透ける／変な halo** | visible pass と depth/normal/mask pass の cutout 条件が一致していない。 | alpha threshold、UV、LOD、side、depth write を auxiliary pass と完全一致させる。 |
| **細い葉の線だけ太すぎる** | 1～3 px の uniform dilation が、葉自体より太い。 | foliage class だけ thickness を 0～1 px、または opacity のみ。建物・岩とは別 parameter にする。 |

今回の木なら、私は **葉カード自体を輪郭検出から除外し、「木冠 proxy」＋幹だけを線対象**にします。45°固定カメラなら proxy が多少実形状と違っても気づかれにくく、細かい葉を正確に outline するよりはるかに「イラストの木」に見えます。

## 黒ではない色付き輪郭

ここはかなりおすすめです。Unity Toon Shader の公式実装も、単色 outline だけでなく**body color を outline color に blend**する仕組みと outline color map を持っています。したがって「黒線ではなく、物体自身の色を暗くした線」は実績のある設計です。 citeturn22view2turn22view1

| 名前／方法 | 何をしているか | 出典の URL | 使えそうな点 |
|---|---|---|---|
| **Base Color × dark factor** | foreground object の base color を取得し、`0.35～0.65` 程度に暗くして線色に使う。Unity Toon Shader の “Blend Base Color to Outline” と同じ発想。 citeturn22view2 | <https://docs.unity3d.com/Packages/com.unity.toonshader@0.10/manual/Outline.html> | 木なら暗い緑、岩なら茶灰、建物なら壁色の暗色になり、背景全体が黒く割れない。 |
| **Outline Color Map** | asset ごとに outline 用色 texture を持つ。Unity Toon Shader 0.14 は明示的に Outline Color Map を提供。 citeturn22view1 | <https://docs.unity3d.com/Packages/com.unity.toonshader@0.14/manual/Outline.html> | 木の葉は緑褐色、石は紫灰色など、アート側で完全に決められる。 |
| **object ID → color LUT** | auxiliary pass で object/class ID を出し、fullscreen pass で ID から outline color を lookup。 | surface ID を用いた edge 処理の実装例として Omar Shehata の WebGL outlines が参考になる。 citeturn22view0 | thousands of objects でも material を増やさず、`foliage / rock / building / heroProp` ごとに色を統一できる。 |
| **scene color の同一面だけ平均して暗くする** | edge pixel 周囲から、同じ ID または近い depth の color だけを bilateral に平均し、それを暗くする。 | stock `OutlinePass` は基本的に global な edge color を使うため、local-color outline には custom composite が必要。 citeturn23view0 | terrain texture や vertex color が多いワールドに適する。 |
| **texture ink** | diffuse/albedo 内へ暗色の線を直接入れる。Borderlands ではこの internal ink と procedural exterior outline を併用。 citeturn21view4 | <https://www.cgw.com/Publications/CGW/2009/Volume-32-Issue-11-Nov-2009-/A-Fine-Line.aspx> | 岩の割れ目、木の幹、建物の板目など、「Sobel に判断させたくない線」に最適。 |

three.js の fullscreen outline pass なら、最小形はこんな考え方です。

```glsl
// edge: depth / normal / ID から作った 0..1 の輪郭マスク
// baseColor: 線の「手前側」にある物体の色
vec3 baseColor = sampleForegroundColor(uv);

// 単なる黒ではなく、自身の色を暗くする
vec3 outlineColor = baseColor * 0.45;

// ごく少し黒を混ぜると彩度過多になりにくい
outlineColor = mix(outlineColor, vec3(0.02), 0.10);

vec3 finalColor = mix(sceneColor, outlineColor, edge * outlineOpacity);
```

ポイントは `texture(sceneColor, uv)` を無条件に使わず、**depth edge の手前側の色を採る**ことです。たとえば緑の木と青空の境界で「現在 pixel が空側」だった場合、単純に現在 pixel を暗くすると青い outline になります。四近傍または八近傍から最小 depth の sample、あるいは foreground ID と一致する sample を選び、その色を暗くすると安定します。

さらに背景向けには、完全な RGB multiplication より、明度だけを強く落として彩度を少し残すほうがアニメ背景らしくなります。実装を軽くしたいなら RGB のままで十分ですが、色管理を詰める段階では perceptual color space 側で lightness を下げる設計も候補になります。

## 距離制御と対象選択

背景では「線幅を一定にする」より、**距離に応じて線の役割そのものを弱める**ほうが重要です。Sable は実際に遠距離で outline opacity を fade させています。Unity Toon Shader も、near distance では設定した最大幅、far distance では幅 0 になる camera-distance control を公式に持っています。 citeturn21view2turn22view1

| 名前／方法 | 何をしているか | 出典の URL | 使えそうな点 |
|---|---|---|---|
| **distance opacity fade** | `edge *= 1 - smoothstep(near, far, viewDepth)` のように遠景ほど透明にする。Sable が採用している考え方。 citeturn21view2 | <https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability> | **最優先。** 遠くの森が線の網にならない。 |
| **distance thickness fade** | Unity Toon Shader は nearest で最大 outline width、farthest で width=0 にする設定を持つ。 citeturn22view1 | <https://docs.unity3d.com/Packages/com.unity.toonshader@0.14/manual/Outline.html> | 建物や大岩の近景だけ 1.5～2 px、遠景 0～0.5 px にできる。 |
| **screen-space px width** | Sobel/sample offset を framebuffer texel 単位で決めれば、基本的には画面上の幅を管理できる。 | WebGL depth + normal postprocess の実装例: <https://github.com/OmarShehata/webgl-outlines> citeturn22view0 | 見下ろしカメラなら tuning が容易。world-space hull より予測しやすい。 |
| **selected object list** | three.js r160 `OutlinePass` は `selectedObjects` を起点に outline 対象を限定する構造。 citeturn23view5 | <https://github.com/mrdoob/three.js/blob/r160/examples/jsm/postprocessing/OutlinePass.js> | 少数の重要 object だけなら最も簡単。 |
| **surface / object ID buffer** | geometry の surface ID を auxiliary buffer に出し、ID discontinuity を outline 判定に使う。Omar Shehata の実装には depth/normal と surface ID を利用する派生手法と selective outline の例がある。 citeturn22view0 | <https://github.com/OmarShehata/webgl-outlines> | 今回はこれが最も柔軟。カテゴリ ID だけでも十分。 |
| **class mask** | 個体 ID ではなく `0=none, 1=rock, 2=building, 3=treeProxy, 4=heroProp` のような 8-bit class を出す。 | 上記 surface-ID 手法を簡略化した実装方針。 citeturn22view0 | 大量 vegetation に向く。色・幅・normal sensitivity・distance fade を class ごとに変えられる。 |
| **stencil** | geometry pass 時に stencil ref をカテゴリ別に書き、outline composite を stencil 条件付きで適用する。 | three.js の標準 pass をそのまま使うより custom render pipeline 向け。 | 色や ID が不要で「描く／描かない」だけなら軽量。ただし multi-class のアート制御は ID texture のほうが扱いやすい。 |

今回なら object ID を全オブジェクトに一意に振る必要はありません。むしろ**カテゴリ ID**で十分です。

例えば:

```text
0  = outline 無し
1  = 建物
2  = 岩
3  = 木の幹
4  = 木冠 proxy
5  = 大型プロップ
6  = キャラクター
```

そして class ごとの値を texture/LUT で持ちます。

```text
class       depthEdge normalEdge idEdge widthNear widthFar opacity
building      1.0       0.7       1.0       1.5      0.4     0.70
rock          0.9       0.5       0.8       1.2      0.2     0.55
trunk         1.0       0.4       1.0       1.0      0.0     0.55
canopyProxy   0.8       0.0       1.0       0.8      0.0     0.35
grass         0.0       0.0       0.0       0.0      0.0     0.00
ground        0.4       0.0       0.0       0.5      0.0     0.15
```

特に **foliage の `normalEdge = 0`** が効きます。葉カードは法線がカードごとに大きく違うので、normal Sobel を許すと「葉の塊」ではなく「カードの配置」が線として見えてしまうからです。葉は proxy silhouette だけ、岩・建物は depth + normal、という分業がよいです。

## オープンソース実装

「今も使える実装」という条件では、outline 系は選択肢が多い一方、**汎用の Kuwahara／水彩 postprocess を、現行 three.js/Unity/Godot 向けに継続保守している成熟 OSS パッケージはかなり少ない**というのが今回の調査結果です。したがって painterly 側は「現役の postprocessing framework 上に小さな custom effect として載せる」のが現実的です。

| 名前 | 何をしているか | ライセンス／維持状況 | 出典の URL／使えそうな点 |
|---|---|---|---|
| **pmndrs/postprocessing** | three.js 用の EffectComposer / fullscreen effects 基盤。独自 depth/normal/outline/painterly pass を統合する土台として強い。 | **Zlib**。現行リポジトリと公式 docs が維持されている。 citeturn22view4 | <https://github.com/pmndrs/postprocessing><br>今回なら stock effect をそのまま使うより、**custom ID-outline effect の土台**としておすすめ。 |
| **three-stdlib** | three.js `examples/jsm` 系を standalone package として扱うライブラリ。OutlinePass 等の three.js example 系実装を利用しやすい。 | **MIT**。pmndrs 管理。 citeturn22view5 | <https://github.com/pmndrs/three-stdlib><br>既存 `OutlinePass` を起点に改造したい場合。 |
| **OmarShehata/webgl-outlines** | Three.js / PlayCanvas で **depth + normal** の post outline。surface ID を使った改良版と selective-object の例も含む。FXAA まで含む。 citeturn22view0 | **MIT**。非常に良い技術資料だが、pmndrs のような継続的フレームワークというより**reference implementation**として見るのが安全。 | <https://github.com/OmarShehata/webgl-outlines><br>今回の custom outline の出発点として特に有用。 |
| **N8python/n8ao** | three.js 向け SSAO。作者自身が temporal stability と artist control を重視。optional neural denoise は contact shadow を sharp にしつつ temporal stability を改善する設計。 citeturn22view3 | **CC0‑1.0**。現行 repository を確認できる。 | <https://github.com/N8python/n8ao><br>「線ではない暗い接地縁」に非常に相性がよい。 |
| **pmndrs SSAO** | depth / normal buffer を使う SSAO。distance/proximity threshold・falloff、world-unit threshold など細かく調整できる。 citeturn23view3 | pmndrs/postprocessing の **Zlib**。 | <https://pmndrs.github.io/postprocessing/public/docs/class/src/materials/SSAOMaterial.js~SSAOMaterial.html><br>既に pmndrs composer を使うならこちらでもよい。 |
| **UnityURPToonLitShaderExample / NiloCat** | URP 用 toon shader。outline utility、outline pass、Z offset 等の実装をコードで追える。 citeturn22view6 | **MIT**。500 超の commit を持つ実践的 educational repo。 | <https://github.com/ColinLeung-NiloCat/UnityURPToonLitShaderExample><br>three.js に port する際の hull/clip-space outline 参考資料。 |
| **toon-rp** | Unity 向け stylized/toon 専用 Scriptable Render Pipeline。custom lighting、shadow、stylized rendering を pipeline レベルで扱う。 citeturn22view7 | **MIT**。継続的に大規模開発されている OSS。 | <https://github.com/Delt06/toon-rp><br>「輪郭だけでなく照明も同じ画風にする」という Hi‑Fi Rush 型の設計参考になる。 |
| **Bay Ride** | 2026 年に更新されている Three.js の**painted seaside** 実装。町、木、草、海などを含む painterly scene 全体をコードで構築。 citeturn22view8 | **MIT**、2026 年時点で活発なプロジェクト。 | <https://github.com/StarKnightt/bay-ride><br>汎用 shader library ではないが、**Three.js で背景全体を絵画調にする現行コード例**として面白い。 |
| **Summer Cycle** | Three.js で toon-shaded countryside を実装。GLSL、procedural graphics、trees 等を含む。 citeturn22view9 | **MIT**、2026 年の現行プロジェクト。 | <https://github.com/StarKnightt/summer-cycle><br>three.js で「キャラではなく風景全体」を stylize する構成の参考。 |
| **Sonara の Papari–Kuwahara pass** | WebGL2 renderer に Papari–Kuwahara painterly pass を実装している現行コード例。 citeturn16search6 | **PolyForm 系**で、OSI の意味での permissive OSS としては扱えないため、依存先としては今回の OSS リストから除外推奨。 | ソース実装の読み物としては有用だが、ライセンス要件を確認してコードを流用しないこと。 |

ここは少し重要で、**Kuwahara を入れるために古い専用ライブラリへ依存する必要はありません**。今回必要なのは fullscreen fragment shader 一枚なので、`pmndrs/postprocessing` の custom `Effect` として持つほうが保守しやすいです。輪郭検出前に Kuwahara を掛けると depth/normal とは無関係なので edge geometry は保てますが、最終画面全体へ強く掛けると細い葉や UI 周辺まで絵具化します。そのため私は **1/2～1/4 解像度で弱く処理 → 元画像と 20～40% 程度 blend**するところから始めます。

さらに、Kuwahara の結果を outline の下に置くのが基本です。

```text
scene render
    ↓
toon / lighting
    ↓
weak painterly filter
    ↓
contact AO
    ↓
selective colored outline
    ↓
AA / final composite
```

これなら線まで Kuwahara に食われず、Borderlands の「gouache の面の上に ink」という構造にも近くなります。Borderlands の開発者自身が、inked outline が gouache 的な painting の上に乗る構造として説明しています。 citeturn21view4

## 線の代わりに重なりを沈める

ここは、背景では**輪郭線以上に重要**だと思います。

Borderlands の制作資料でも、ambient occlusion がキャラクターやオブジェクトを環境に「座らせる」役割を持ち、silhouette outline は foreground/background を分ける役割を持つと説明されています。つまり AO と outline は同じものではなく、**AO は接地・重なり、outline は形の読み取り**を担当させると整理しやすいです。 citeturn21view4

| 名前／方法 | 何をしているか | 出典の URL | 使えそうな点 |
|---|---|---|---|
| **SSAO / N8AO** | 周囲 geometry に遮蔽された crevice、接地部、重なりを暗くする。N8AO は temporal stability と artist control を重視し、contact shadow の sharpness を改善する option も持つ。 citeturn22view3 | <https://github.com/N8python/n8ao> | 木の幹と地面、岩と地面、建物の基礎を自然に沈める。**黒線を減らしても形が読める**。 |
| **small-radius SSAO** | sampling radius を小さくし、world distance / proximity threshold を厳しくすると、大規模な“汚れ”ではなく接触付近だけを暗くできる。pmndrs SSAO はこれらの parameter を公開している。 citeturn23view3 | <https://pmndrs.github.io/postprocessing/public/docs/class/src/materials/SSAOMaterial.js~SSAOMaterial.html> | トゥーン背景には通常の広い SSAO よりこちらが向く。 |
| **one-sided depth edge darkening** | depth discontinuity の**遠い側だけ**を暗くする。輪郭を両側へ描くのではなく、「手前の物体が後ろの面へ落とした細い影」のように見せる。 | depth-buffer edge detection の基本構造は WebGL outlines と共通。 citeturn22view0 | 「線っぽさ」をかなり減らせる。草・地面・壁の境界にも使いやすい。 |
| **depth edge dilation + soft blur** | depth 差を検出後、背景側へ 1～4 px 程度だけ広げて blur。 | postprocess edge 技術の派生。 citeturn22view0 | Ragnarok 系の「重なりの下だけ濃い」感じを作りやすい。 |
| **AO を色付きにする** | pure black を掛けず、base color を少し暗く・少し低彩度にした色へ寄せる。 | Borderlands の hand-painted shading と AO の組み合わせが参考になる。 citeturn21view4 | watercolor / gouache 系背景と馴染みやすい。 |
| **foliage を AO source から制限** | alpha-card の全葉を AO geometry として強く扱わず、幹・太枝・canopy proxy を主な遮蔽源とする。 | foliage の hard alpha edge が pixel-level detail を大量に生む問題への実装上の対策。Alpha Scissor 自体は foliage 向けだが hard edge を持つ。 citeturn23view2 | 木の葉の下が煤のように真っ黒になるのを防止。 |

one-sided depth darkening は、今回かなり試す価値があります。通常の Sobel outline は「境界の両側」を線にしてしまいますが、こちらは例えば、

```glsl
float z0 = linearDepth(uv);

float zMin = min(
    linearDepth(uv + vec2( texel.x, 0.0)),
    min(
        linearDepth(uv + vec2(-texel.x, 0.0)),
        min(
            linearDepth(uv + vec2(0.0,  texel.y)),
            linearDepth(uv + vec2(0.0, -texel.y))
        )
    )
);

// center が周辺より奥にある場合だけ。
// 「前景の物体の後ろ側」へ暗さを付ける。
float behindEdge =
    smoothstep(depthThreshold0, depthThreshold1, z0 - zMin);

vec3 sunkColor = sceneColor * 0.75;
sceneColor = mix(sceneColor, sunkColor, behindEdge * strength);
```

これを少しだけ dilation / bilateral blur すると、**「黒い漫画線」ではなく「前景物が後ろの色を押し沈めている」**感じになります。

見下ろしゲームでは、キャラクターや木・岩の足元を常に見るため、この方法と小 radius AO が特に効きます。地面そのものを outline するより、**地面は線なし＋接触部だけ沈める**ほうが画面が散らかりません。

## three.js r160 向けの推奨構成

最終的には次の三案を推します。優先順位もこの順です。

| 推奨 | 構成 | 木・岩・地面・草・建物 | 長所 | 注意点 |
|---|---|---|---|---|
| **本命：Selective ID Outline + AO** | **alpha-aware depth + normal + class-ID buffer → selective colored outline → N8AO / small-radius AO** | **木:** 幹＋canopy proxy のみ線、葉カード自身は線なし。**岩:** depth+normal 線。**地面:** 原則線なし、段差だけ弱く。**草:** 線なし。**建物:** 外周＋大きな crease のみ。 | 最も安定し、three.js の postprocess と相性がよい。Sable 型の距離 fade、Rollerdrome 型の edge renderer、colored outline を全部組み合わせられる。Sable の遠距離 fade と surface-ID ベース WebGL outline は特に直接参考になる。 citeturn21view2turn22view0turn22view3 | stock `OutlinePass` の alpha-card 処理には頼らず auxiliary buffer を自作するほうがよい。 |
| **アート優先：Texture Ink + 弱い Silhouette** | **岩・幹・建物の内部線を texture に描く + postprocess は外周だけ + AO** | **木:** 葉 texture に大きな塊の境界だけ ink、個々の葉は囲わない。**岩:** 割れ目は texture、外周だけ shader。**地面/草:** ほぼ線なし。**建物:** texture の構造線＋弱い silhouette。 | Borderlands / Denshattack 型。**線を出したい場所をアーティストが決められる**ので最も画面を整理しやすい。Borderlands がまさに internal ink + exterior procedural line を分離している。 citeturn21view4turn21view1 | asset 制作工数は増える。ただし固定カメラなので投資効果は高い。 |
| **絵画寄り：Contact Darkening + Painterly + 最小限の線** | **small-radius AO + one-sided depth darkening + 弱い Kuwahara/gouache pass + hero object のみ outline** | **木:** 幹と外側 canopy にごく薄い線。**岩:** 接触影中心。**地面/草:** 完全に線なし。**建物:** silhouette だけ。 | Valkyria Chronicles 的な「背景は線で囲いすぎず、面・接地・画材感で統一」に寄せられる。線の密度が低いため alpha foliage と非常に相性がよい。 citeturn17search27turn22view3 | Kuwahara を強く掛けると葉や texture detail が“油の塊”になるので、低解像度・弱 blend 推奨。 |

**私ならまず本命案を実装します。**

具体的には、現在の `OutlinePass` を背景用には外し、color render とは別に次の三情報を作ります。

```text
A. linear depth
B. view-space normal
C. class ID
```

ただし葉だけは、

```text
visible foliage cards ───────→ color pass
              │
              └─ outline buffer には入れない

low-poly canopy proxy ───────→ class ID / depth only
tree trunk ──────────────────→ depth / normal / class ID
```

とします。

edge detector は一種類ではなく、

```glsl
float edge =
      depthEdge  * classDepthWeight
    + normalEdge * classNormalWeight
    + idEdge     * classIdWeight;

edge = saturate(edge);

// Sable 型
edge *= 1.0 - smoothstep(outlineFadeNear,
                         outlineFadeFar,
                         linearDepth);

// 黒ではなく foreground の色を暗く
vec3 outlineColor = foregroundBaseColor * outlineDarkness;

finalColor = mix(sceneColor,
                 outlineColor,
                 edge * classOpacity);
```

という構成にします。Sable が遠距離で outline opacity を落とす設計、Unity Toon Shader が camera distance に応じて width を 0 まで減らせる設計は、この用途にそのまま対応しています。 citeturn21view2turn22view1

初期値としては、**背景の線は人物よりかなり弱く**するのがよいです。人物を 2～3 px 相当にしているなら、建物・大岩を約 1～1.5 px、木冠を 0.5～1 px 相当、遠景で 0、草は 0、地面はほぼ 0、という階層から始めると整理しやすいでしょう。これは特定ゲームの公開数値ではなく、今回の画面条件に対する実装上の出発点です。

そしてその下へ **小 radius の N8AO** を薄く入れます。N8AO は temporal stability と artist control を明示的な目標としており、接触影の sharpness を保つ option も持つので、alpha foliage が多い three.js scene で「線ではなく形を沈める」用途にかなり適しています。 citeturn22view3

最後に painterly 感を追加する場合も、最初から Kuwahara を主役にはしません。**toon shading → 弱い painterly filter → AO/contact darkening → sparse colored outline**という順番にし、Kuwahara は 1/2～1/4 解像度で低周波の色面だけをまとめる役に限定します。Borderlands の「gouache 的な面＋ink」、Sable の「距離で消える線」、Valkyria Chronicles の「線だけに依存しない画材感」を組み合わせる方向です。 citeturn21view4turn21view2turn17search27

この条件では、**「葉一枚一枚に正しい輪郭線を引く」ことを目標にしない**のが最も大きなポイントです。人物は輪郭で読む、建物・岩・幹は中程度の輪郭で読む、木は「樹冠の大きな塊」で読む、草と地面は AO・影・色面で読む――という情報階層にすると、人物の toon outline と背景が喧嘩せず、画面全体を一枚のイラストとして揃えやすくなります。Sable、Borderlands、Guilty Gear の公開資料はいずれも、最終的な品質を決めるのが「エッジを検出できるか」ではなく**どの線を残し、どの線を消すかという制御**であることを示しています。 citeturn21view2turn21view4turn21view6