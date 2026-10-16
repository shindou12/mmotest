# マップのクオリティを上げる：知見と提案

## 1. 今の作り（屋外）

| 項目 | 今 | 見え方 |
|---|---|---|
| 形 | 楕円＋少しのゆらぎ（wob）。外周に岩の崖を一列 | どのエリアも「丸い広場」に見える |
| 起伏 | ノイズ ×0.35m（ほぼ平ら）。池だけくぼむ | 平らな板の上に物を置いた印象 |
| 装飾の置き方 | 種類ごとに数を決めて、エリア全体に一様な乱数でばらまく（避ける場所だけ除く） | どこも同じ密度。見どころも余白もない |
| 装飾の数 | 例：草原 木70・岩30・花140 × 広さ係数 | 数は足りているが、散らばって効いていない |
| 目印 | 出口の門と転移門だけ | 自分がどこにいるか分かりにくい |

※ サーバーは高さを持たない（当たり・位置は平面）。起伏は見た目だけで、予兆の円などは地面に沿って描く。戦う場所に急な坂を作ると、予兆の円が地面にめり込んだり浮いたりする。

## 2. 集めた知見

1. **密と疎（70/30）**: 画面の大部分は落ち着いた余白で、細かい作り込みは3割ほどに集める。そうすると目が見どころへ向かう。[artwod]
2. **群れで置く**: 木は均等に並べず、むらのあるかたまりにして、何もない場所も残す。幹だけの木を足すと、安く密度を上げられる。[gamedeveloper: forests]
3. **大・中・小**: ひと目で分かる大きな形（ヒーロー）を少し、中くらいを数個、小物をたくさん。遠くから読める輪郭が、細かい表面より効く。目を細めても見どころが分かるか（スクイントテスト）。[skillselion（参考程度）]
4. **目印の三段（ウィニー）**: マップのどこからでも見える大きな目印、その区画で見える目印、足元の小さな目印。隠して、角度を変えて見せ直すと効く。ただし、意味のない目印は目印として働かない。[gamedev.net / openskillindex]
5. **完全な自由は迷わせる**: 開けた草地で目印が草に隠れて迷った例。最初は一本道、途中で分かれて、また合流する骨組みに直して改善した。[moddb: Egyptian fields]
6. **見通しと道しるべ**: 見通しは「何かが見える空間の通り道」。見る理由がないと無視される。明るい場所、次の行き先を縁取る入口、収束する線（道・岩の並び）で、そっと誘導する。[Level Design Book / thecdm]
7. **戦う場所は円く動ける広さ**: 通路より、周りを回れる広場のほうが戦いが面白い。障害物を散らすと道が複数できる。遮るものは少なめがよい。[Level Design Book: encounter・cover / Expeditions: Rome]
8. **硬い形と柔らかい形の対比**: 建物・遺跡の直線と、植物の曲線を並べる。道や光の筋の斜めの線で視線を運ぶ。[garagefarm]
9. **草と風**: 草・木は InstancedMesh で数を出し、根元を固定して、高さに比例してノイズで揺らす。色は根元暗め→先端明るめのグラデーション。[threejs forum / godotshaders]

## 3. 提案

### 3-1. 起伏（見た目だけ。戦う場所はなだらかに）
- **大きな形を足す**: エリアごとに「丘」「くぼ地」「段丘（一段高い台地）」を2〜4個、データで置く（位置・半径・高さ）。高さは 1.5〜4m。
- **戦う場所はなだらか**: 敵の湧く場所と道の周りは傾きを抑える（最大でも 10m で 1m 程度）。急な起伏は外周や、戦わない区画に回す。
- **外周を「崖の一列」から「地形」へ**: 外周は高さを上げて丘や崖として立ち上がり、その上に木や岩を置く（今の岩の一列は減らす）。
- **くぼみと水**: 池のまわりの斜面、乾いた川の跡（砂の階）など。

### 3-2. 形状（区画を作る）
- エリアを、性格の違う **2〜4 の区画** に分ける。例：ひだまりの草原 ＝「入口の広場」「丘の上の古い石碑」「池のほとり」「林の縁」。
- 区画ごとに **地面の色・装飾の種類・密度** を変える。区画のあいだは道でつなぐ。
- 出口へ向かう道は、木の並び・柵・岩で縁取って、次の行き先が見えるようにする。

### 3-3. 装飾の数と置き方
- **一様な乱数をやめて、群れで置く**: 群れの中心をいくつか決め、そのまわりに大→中→小の順で置く（木の林の縁に低木、岩の根元に草と小石）。
- **密と疎**: 区画の端・外周・目印の周りは密に、戦う広場は疎に。全体の数は今より増やすが、置く場所を絞る。
- **根付かせる**: 大きな物の根元には必ず小物（草・小石・落ち葉）を置き、地面から生えて見えるようにする。
- **数の目安（草原）**: 林 4〜6群（各 木8〜15＋低木）、岩場 3群、花畑 2〜3面、小物（小石・草むら）は数百を InstancedMesh で。

### 3-4. 目印（三段）
- **大**: 各階から見える象徴を遠景に1つ（1階＝迷宮区の塔、2階＝霧の巨木、3階＝砂の遺跡）。迷宮区の方向に置き、自然と向かう先を示す。
- **区画**: 区画ごとに1つ（石碑・風車・倒れた巨像・枯れた大木など）。
- **足元**: 宝箱・道標・焚き火の跡など。

### 3-5. 質感・動き（前回の案 A・B・C）
- 地面の塗り分け、風で揺れる草木、階ごとの色味と漂う粒子。上の配置と合わせて効く。

## 4. 段階（ボスモデルのときと同じく、1か所で比べる）

| 段階 | 中身 | 試す場所 |
|---|---|---|
| 段階2 | 起伏の大きな形・群れで置く・根付かせる・地面の塗り分け・風 | ひだまりの草原（f1_field） |
| 段階3 | 区画分け・区画の目印・道の縁取り・密と疎の調整・迷宮の作り込み | 草原＋迷宮1部屋 |
| 段階4 | 遠景の象徴・ボス部屋の舞台・光の筋や水 | 草原＋1階ボス部屋 |

段階2の仕組み（起伏の形・群れの配置）は全エリアに効く作りにして、データ（areas.js）で場所ごとに調整する。

## 5. 自己評価（今の時点の見立て）

| 観点 | 評価 | メモ |
|---|---|---|
| 効き | 高 | 平らさと一様な散らばりが、今いちばん安っぽく見える原因。直せば全エリアに効く |
| 手間 | 中 | 起伏・群れ配置は仕組み1つ。区画・目印はエリアごとの手作業 |
| 危険 | 中 | 起伏と予兆の円のずれ、移動の当たり（サーバーは平面）。戦う場所はなだらかに保つ |
| 重さ | 中 | 小物は InstancedMesh で。低画質では小物と揺れを減らす |
| 記録テスト | 要作り直し | 描画の記録テスト（render.json）と、見た目の画像 |

## 出典
- [Environment art mistakes and how to fix them（artwod）](https://artwod.com/blog/environment-art-mistakes-artists-make-and-how-to-fix-them)
- [Art tips for building forests（Game Developer）](https://www.gamedeveloper.com/art/art-tips-for-building-forests)
- [Environment design principles（GarageFarm）](https://garagefarm.net/blog/environment-design-principles-for-building-immersive-worlds)
- [environment art（skillselion、参考程度）](https://skillselion.com/skills/omer-metin/skills-for-antigravity/environment-art)
- [Should players be hand-held?（gamedev.net）](https://gamedev.net/blogs/entry/2277800-should-players-be-hand-held)
- [Designing for atmosphere - Egyptian fields（ModDB）](https://www.moddb.com/news/designing-for-atmosphere-egyptian-fields)
- [Universal level design techniques（thecdm）](https://blogs.thecdm.ca/techspeak/?p=2488)
- [level design（openskillindex、参考程度）](https://openskillindex.com/skills/vibeforge1111-vibeship-spawner-skills-level-design)
- The Level Design Book: [environment art](https://https-book_leveldesignbook_com.proxy.bugsmash.io/process/env-art) / [composition](https://https-book_leveldesignbook_com.proxy.bugsmash.io/process/blockout/massing/composition) / [encounter](https://https-book_leveldesignbook_com.proxy.bugsmash.io/process/combat/encounter) / [cover](https://https-book_leveldesignbook_com.proxy.bugsmash.io/process/combat/cover)
- [Expeditions: Rome – Building a great combat encounter](https://gamebanshee.com/x6r8c)
- [Low-poly terrain demo（three.js forum）](https://discourse.threejs.org/t/low-poly-terrain-demo-wip/33859)
- [Stylized grass with wind and deformation（Godot Shaders）](https://godotshaders.com/shader/stylized-grass-with-wind-and-deformation/)
