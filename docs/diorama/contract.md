# 箱庭（diorama）の取り決め

角の丸いボクセルのミニチュア箱庭（M-0188）。生成（Blender）・絵（アトラス）・実行画面（three.js）の 3 つが、ここに書いた形でつながる。

## 目指す見た目
- 机の上に置いたミニチュアの箱庭。台座ごと見える。ローポリ 3D、ブロックの角は丸い。
- 絵は手描き風（面は大きな色の塊、細部は境目に寄せる）。写実の写真素材にしない。
- 光で本物らしさを足す（HD-2D）: 浅い被写界深度（ティルトシフト）、やわらかい影、光る物だけのブルーム、暖かい主光と冷たい影、うすい霧、周辺減光。
- 人物もローポリの立体（ドット絵にしない）。

## 座標
- 1 マス = 1.0（Blender も three.js も同じ長さ）。Blender は Z が上、glTF の書き出しで Y が上になる。
- 以下は three.js の座標で書く: マス (i, k) は x が i〜i+1、z が k〜k+1、上面の高さは y = h（整数のブロックの段）。
- 地図の大きさは 48 × 48 マス。配列は `index = k * W + i`。

## ステージ（5 つ。地形の作りそのものが違うこと）
| id | 名前 | 地形 | 主な材 | 物 | 光 |
|---|---|---|---|---|---|
| meadow | 草原と湖 | なだらかな丘、湖と小川、高さの差は小さい | grass, dirt, stone, sand | 広葉樹、花、岩、木の橋 | 昼の暖かい光 |
| canyon | 砂漠の峡谷 | 平らな台地（メサ）を深い谷が切る、層の見える崖、底にオアシス | sand, sandstone, redrock | サボテン、枯れ木、岩の柱、石のアーチ | 夕方の低い橙の光 |
| snow | 雪山 | 険しい峰と尾根、凍った湖、段になった崖 | snow, ice, stone | 針葉樹、氷の柱、雪をかぶった岩 | 青白い光、雪が舞う |
| volcano | 火山 | 中央に火口、放射状の溶岩の川、黒い岩の段 | basalt, ash, lava（光る） | 枯れ木、黒曜石の柱、冷えた溶岩の橋 | 暗い空、溶岩が赤く照らす |
| skyisles | 浮島 | 空に浮く大小の島、あいだは空（マスなし）、島を橋がつなぐ、島の下は逆さの円すい | turf（青緑の草）, cloudstone, crystal（光る） | 巨大きのこ、水晶、つる、滝 | 紫がかった夕空、水晶ときのこが光る |

## 生成物
```
public/diorama/stages/<id>.glb     見た目（ブロック・物・台座）
public/diorama/stages/<id>.json    歩行と光のデータ
public/diorama/stages/index.json   ["meadow","canyon","snow","volcano","skyisles"] と表示名
public/diorama/models/hero.glb     人物
public/diorama/tex/atlas.png       手描きのアトラス（2048 × 1024、256px のマスが 8 × 4）
public/diorama/tex/atlas.json      { "tile": 256, "cols": 8, "rows": 4, "tiles": { "<名前>": [列, 行] } }
```

### GLB の中身
- メッシュの名前: `terrain`（地面と崖と台座）、`props`（木・岩など動かない物）、`glow`（溶岩・水晶・光るきのこ。実行画面がブルームの対象にする）、`water`（水面の板。あれば）。
- UV はアトラスのマスを指す（マスの内側 4px を避ける）。絵は GLB に入れない（実行画面が atlas.png を貼る）。
- 頂点色 `COLOR_0` に、奥まりの暗さ（AO）とブロックごとのわずかな明るさのむら（±6%）を入れる。
- 角は丸める（ベベル 0.12〜0.18、分割 2）。平らにつながる面のあいだには線を作らない（ブロックの区切りは絵が描く）。
- 1 ステージの三角形は 25 万まで。

### <id>.json
```json
{
  "id": "meadow", "name": "草原と湖", "seed": 1, "size": [48, 48],
  "height": [/* W*D。上面の y。マスがない所は -1 */],
  "surface": [/* W*D。足元の材の名前の番号（materials の添字） */],
  "materials": ["grass", "sand", "..."],
  "blocked": [/* W*D。木の幹や岩で通れないマスは 1 */],
  "liquid": [/* W*D。0 なし、1 水（浅く歩ける）、2 溶岩（入ると戻される）、3 氷 */],
  "waterLevel": 3.8,
  "spawn": [24, 24],
  "light": {
    "sunDir": [0.5, 0.8, 0.3], "sunColor": "#fff1d6", "sunPower": 3.0,
    "skyColor": "#bfe3ff", "groundColor": "#6b5a48", "hemiPower": 0.9,
    "bgTop": "#8fc7f5", "bgBottom": "#e9f3fb", "fog": "#dfeefa", "fogDensity": 0.006,
    "bloom": 0.35, "exposure": 1.0
  },
  "ambience": "meadow",
  "particles": "pollen"
}
```
- `ambience` は meadow / desert / snow / volcano / sky のどれか。`particles` は pollen / dust / snow / ember / spark のどれか。

## アトラスのマス（名前は固定）
| 行 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| 0 | grass_top | grass_side | dirt | stone | sand | sandstone_side | redrock | cobble |
| 1 | snow_top | snow_side | ice | basalt | ash | lava | obsidian | planks |
| 2 | turf_top | turf_side | cloudstone | crystal | bark | leaves | pine | cactus |
| 3 | mush_cap | mush_stem | deadwood | flowers | water | pedestal | rock | spare |

- `*_side` は上の縁に草・雪がかぶった崖の横の面（上のブロックだけに使う。下は dirt・stone など）。
- どのマスも左右につながる。`*_top` と面いっぱいの材（dirt, stone, sand など）は上下にもつながる。
- 1 マスにブロック 1 つぶんの絵（ブロックの縁に、うすい影と明るい縁を描く）。

## 歩き方（実行画面）
- 1 段（高さの差 1）は自動で上る。2 段以上はジャンプ（1.3 段まで）でも上れない崖。下りは何段でも落ちる。
- `blocked` と `height = -1`（空）は入れない。空に落ちたら、最後に立っていたマスへ戻す。
- 水は浅く入れて足音が変わる。溶岩は入ると戻される。氷は少しすべる。

## 効果音（WebAudio の合成。音声ファイルは使わない）
- 足音: `surface` の材ごとに音色を変える（草・土・砂・石・雪・氷・木・水）。歩幅に合わせる。
- ジャンプ、着地（落ちた高さで強さ）、水に入る、溶岩で戻される、ステージの切り替え。
- 環境音: meadow（風と鳥）、desert（乾いた風）、snow（吹雪の低い風）、volcano（低いうなりと泡）、sky（高い風と水晶の音）。
- 出典: 合成の考え方は ZzFX（MIT、Frank Force）を参考にする。コードは写さない。

## 出典
- three.js の後処理（EffectComposer・UnrealBloomPass・BokehPass、ティルトシフトのシェーダー）: https://threejs.org/docs/
- ティルトシフトの作り方の相談: https://discourse.threejs.org/t/how-to-have-a-tilt-shift-effect-on-a-3d-scene/40606
- ZzFX: https://github.com/KilledByAPixel/ZzFX
