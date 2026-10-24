# 棚卸し: エリア・環境・敵・ボス（クライアント視点）

調査日 2026-10-21、読み取りのみ。Godot 状態: 済み / 仮 / 未。
前提: Godot 側のエリアは `godot/worldart/scripts/world.gd` の `load_area`。`data/<id>/map.json` があれば第 3 世代の地図、なければ仮の地面。**今 map.json があるのは `f1_field` だけ**（`godot/worldart/data/f1_field/`）。ほかの屋外は「階層の地面色の平面＋輪郭外の岩の列＋木・岩・建物を球/箱で置く」仮（`_build_fallback`）、屋内は箱の壁と平面の床（`_build_grid`）。`public/worldart/maps/` には town_plaza・forest_path・orc_meadow・palm_clearing・south_coast の g3 地図があるが、ゲームのエリア id との対応は未接続。

## 1. エリア表（`public/shared/areas.js` AREAS）

ブラウザの見た目: 屋外 = `public/js/env/open.js`（buildOpen。頂点色の地面 150x150 分割・道・毒沼/流砂の色染め・障害物 `env/obstacles.js`・プロップ `env/props.js`/`flora.js`・草 `landmarks.js makeGrass`・空/遠景/出口の門/ワープポイント `landmarks.js`）、町 = `env/town.js`（685 行、`shared/town-layout.js` の区画・建物が当たり判定にもなる）、野営地 = `open.js buildCamp`、屋内 = `env/grid.js`（箱の壁+松明+床の市松、扉/レバー/宝箱/感圧板/罠のトゲ、`landmarks.js makeLair` のボス部屋魔法陣）。天候は `WEATHERS`/`AREA_WEATHER`（粒子+霧色+日差し+環境音。`game/area.js enterArea`、`render.js weatherParts`）。

| id | 名前 | 層 | 型 | 特記 | Godot |
|---|---|---|---|---|---|
| f1_town | はじまりの街 | 1 | open, layout:'town', sq:5 角丸城壁 | NPC4（衛兵隊長/狩人/賢者/鍛冶屋）、共有ボックス、ゲート(0,0)、建物の当たり判定（box obstacles） | 仮: 平面+建物を灰色の箱で置く。当たり判定は rules.gd push_out_box で済み。town.js の見た目・NPC・ボックス未 |
| f1_field | ひだまりの草原 | 1 | open | 岩/木/池、宝箱2、出口4（町/イノシシ/古井戸/迷宮区） | **済み**（第 3 世代地図 map.json。茂み/草/水）。宝箱の F 操作は済み |
| f1_hunt | イノシシの丘 | 1 | open hunt | 雨（天候）、湧き16、xp1.6倍 | 仮（雨なし） |
| f1_lake | 静かな湖畔 | 1 | open secret | 雨、巨大池、宝箱1、ネームド「ヌシ・ギガスライム」Lv10（elite=3） | 仮（水面なし・ネームド専用演出なし） |
| f1_dun | 古井戸の洞窟 | 1 | grid 15x15 | 精鋭湧き、最奥の大宝箱 C（固有「古井戸の守り刀」） | 仮（箱の壁・床。宝箱は F で開けられる） |
| f1_lab | 第1層 迷宮区 | 1 | grid 31x40+ボス部屋(ARENA 円r20 `lairOf`) | gimmick:'lever'（東の寄り道の奥の L を F で引く→扉D開く）、番兵 K、群れ w、宝箱 | 仮。レバー/扉/宝箱は動く。ボス部屋の魔法陣なし |
| f2_camp | 霧の野営地 | 2 | open camp R22 | NPC2（森番/鍛冶屋）、ボックス | 仮 |
| f2_field | 霧の森 | 2 | open | **霧**（fog 天候）、毒沼6、宝箱2、木20 | 仮（毒沼の見た目/ダメージ/霧なし） |
| f2_dun | 朽ちた樹洞 | 2 | grid | 精鋭湧き、固有「樹霊の外套」 | 仮 |
| f2_hunt | キノコの群生地 | 2 | open hunt | 霧、毒沼3 | 仮 |
| f2_lab | 第2層 迷宮区 | 2 | grid + ARENA_CROSS（十字の間、円r20） | gimmick:'gatekeeper'（門番 G を倒すと扉、罠床 T/t が 1.7 秒ごとに交互作動＝サーバーが円の tele を出す）、番兵 K | 仮。罠床は tele で予告は出るが床の見た目なし |
| f3_camp | オアシスの野営地 | 3 | open camp R28 | NPC2（行商人/鍛冶屋）、ボックス、池 | 仮 |
| f3_field | 砂塵の荒野 | 3 | open | 流砂7、遺跡、宝箱3 | 仮（流砂の減速なし） |
| f3_dun | 埋もれた神殿 | 3 | grid 17x15 | 精鋭、固有「砂王の盾槍」 | 仮 |
| f3_hunt | 蠍の巣 | 3 | open hunt | 砂嵐 | 仮 |
| f3_canyon | 流砂の谷 | 3 | open secret（細長 ell[0.55,1.7]） | 砂嵐、流砂8、ネームド「砂鮫ギルガ」Lv26 | 仮 |
| f3_lab | 第3層 迷宮区 | 3 | grid + ARENA_LONG（長方形 `lairOf` longArena の box） | gimmick:'plates'（左右翼の感圧板 P 2 枚を 50 秒以内に踏む→扉。snap の `pl` 配列で点灯） | 仮。感圧板は箱を置くだけ・点灯なし |

共通の仕組み（クライアントの責務）:
- **出口**: Godot は済み（exits の光る輪＋`move` 送信）。ブラウザは `makePortal`（門の見た目）。
- **ワープポイント/転移門**: ブラウザ `landmarks.js makeWaypoint/makeGate`、`area.js waypointTick/waypointWarp`（近づくと解放→`char.waypoints`、M マップから `wp` 送信）。Godot は `wp` を起動時に 1 回送るだけ（解放・マップ UI なし）= 未。
- **危険地帯**: `HAZARDS`（毒沼=踏むとダメージ+紫の「毒」、流砂=移動遅延）。`loop.js hazardAt`（r-0.3）。`export_gamedata.mjs` は `a.hazards` を書き出すが **rules.gd/game.gd は未使用** = 未。
- **踏破**: `countClear`（迷宮区=ボス/秘境=ネームド/他=15 体）→マップに付きやすい特性。`AREA_BIAS`/`MOB_POOL`。未（ドロップ側 loot は済みのため偏りはサーバー側で効く）。
- **ボス部屋**: `A.lair`（円 r20 or 長方形）に入る(pad -3)とサーバーが `bossStart`。ボス戦中は `wp` 不可。`env.lair` を `makeLair` で魔法陣表示。Godot は B 印の赤い板のみ。
- **町の見た目**: town.js は区画・家（cottage/tall/inn）・教会・ギルド・風車・納屋・露店・街灯・城壁・塔・門楼を手続き生成。Godot へは第 3 世代地図 `town_plaza_g3` を使う方針（docs/world-art）で、ゲームの town-layout との座標合わせが必要。

## 2. 敵とボス

### 2-1 雑魚（`data.js FLOORS[].mobs`、`sim/common.js ARCH`、`sim/mob-attacks.js`）
サーバーが tele（予告）を出し、クライアントは形を描いて時間後に当たり判定（`hurt.js resolveTele`、`data.js inShape`）。クライアントの敵モデルは `models/mob-models.js`（273 行、t ごと）。

| t (ARCH) | 例 | 予告の形（mob-attacks.js） | 備考 | Godot |
|---|---|---|---|---|
| slime | グリーンスライム | 前方 1.2m の円 r2.0 | | 済み(glb mob_slime) |
| beast | フレンジーボア/ミストウルフ/デザートスコーピオン | 扇 arc1.3 len3.6 | | 済み(mob_beast) |
| bat | ケイブバット | 狭い扇 arc0.9 len3 | 高速 | 済み(mob_bat) |
| mushroom | ドクキノコ/ミストマタンゴ | 自分中心の円 r3.6 紫 | 胞子 | 済み(mob_mushroom) |
| knight | 精鋭/ヘルナイト | 前方直線 len4.6 w1.8 | | 済み(mob_knight) |
| golem | サンドゴーレム | 自分中心の円 r3.3 | HP高・低速 | 未(glb 無し→仮の箱) |
| wisp | フォレストウィスプ | **狙われた人の足元**に円 r2.0 | 遠距離 range9 | 未(仮の形) |
| mage | ゴブリンシャーマン/砂漠の呪術師 | 狙った人の周り3つの小円（三角）桃色 | 遠距離 range11 | 未 |
| scorpion | ジャイアントスコーピオン | 細長い線 len5.2 + 先端の毒だまり円 | | 未 |
| sentinel (迷宮区の番兵, look:'player') | 迷宮の近衛騎士/苔むした守り手/砂塵の処刑騎士 | 離れていれば踏み込み突き（線→一気に詰める。m.x を直接書き換え=snap で瞬間移動に見える）、近ければ 3 連斬り扇 | `guard` フラグ(snap[16])＝盾構え。プレイヤーの姿を暗く染めた大型。`makeDarkAdventurer` | 未(ai/guard/look を export していない。Godot は knight モデル代用) |
| treasure | きらめくトカゲ (id 200) | 攻撃なし、逃げ回りコインをまく | `escape` メッセージで地面に潜る演出 | 未(`export_gamedata` の treasure は書出し済み。escape/コイン散布は未) |
| rootknot | 吸い上げの根瘤(minion) | 攻撃なし、動かない | `link:true` でボスへ光の線 | 未 |

湧きの種類: 屋外はランダム湧き（`def.mobs.count+perPlayer`、プレイヤー近く12m以内は避ける）。屋内は印 M(雑魚) G(門番,elite=2) K(番兵) w(群れ3体、足の速い敵) の位置に respawnSec で湧く。snap の elite 値: 1 精鋭 / 2 門番 / 3 ネームド(秘境の主)。kind: 0 mob / 1 add / 2 boss。Godot の `_on_snap` は kind/elite を読んで倍率・名前を付けるまでは済み（精鋭の金枠・ネームド ★・門番の見た目、`enr`/`guard`/`stunPct`/hateT の反映は未）。
ブラウザ側の敵の追加演出: 毒(`poisonUntil`)の持続、ローカル予測ダメージ(localT)、sand 色の粒（loop.js 352）、ヘイトリセットの輪(`hateReset`)、名札(`labels.js makeMobLabel`)。

### 2-2 ボス（`data.js FLOORS[].boss`、`sim/bosses/*.js`、`sim/boss-patterns.js`）
共通: ボスはアリーナ（lair）に入ると出現、HP バー3本(bars)、スタン値(`stunPct`)、`hit` の `st` をサーバーが加算→満タンで STUN（`stun` メッセージ=出ていた tele/弾/印を全部消去+フラッシュ+hitStop+「STUN!」）。`bossStart` バナー、`enrage`(p=2/3)、`bossEv`(バー割れの輪/揺れ)、`bossClear`→崩れ落ち 1.1 秒→爆発→「討伐！」→花火、`bossReset`（全員離脱）、`unlock`。tele の `kd:1` は吹き飛ばし大技。ボスの tele はサーバー側で `BALANCE.bossRange` 倍に拡大済み。

**第1層 コボルド王 グラズ**(t:'knight', appearance:'graz', scale2.8, bars3, brain graz。`bosses/graz.js` 188 行)
- 技: slam(円 r4.5, 激昂で2連) / cone(扇 arc1.9 len11, 激昂で背後にも) / charge(`bossCharge`=直線予告→dash で突進。サーバーが `b.dash` で位置補間) / combo(追いかけ円 3〜5連) / breath(`aim` 照準線→扇状弾7発 `proj`)。
- 固有: 登場の `throw`(線 len30 w5 kd)+`bossAct{p:'throw'}` でクライアントが**大剣が飛ぶ演出**(`net-client.js flyingSword`、モデルの weaponModel を複製)。1本目割れで詠唱「近衛兵召集」(`cast` need>0, `castP` で中断ゲージ, 手下 add を3体)、2本目割れで暴走(spin 円r7.5 / frenzy 4方向扇+足元円 / cleave 広扇 / 走り寄り rush `bossAct p:'rush'` + 道に沿った円)。弱い(HP<30%)人へ `mark`(「！」+赤輪+音)。**王の裁き**: `cast`+`judge`(極太の帯をボスの向きで回すクライアント演出 `fx.add(band)`)→ 本線 line len34 w6 + 横帯の波（多数の tele）。
- モデル/動き: `models/bosses/graz-model.js` ほか(motion/fx/sculpt/graz3: 計 ~900 行)。技ごとのモーションは `bossAct`/`b.act`(motions)。
- Godot: スポーンとモデル(`boss_knight.glb` を knight 全般で使い回し)・HP 札・tele 描画・被弾は済み。**未**: `proj`(弾)/`aim`/`cast`/`castP`/`castEnd`/`bossAct`/`judge`/`mark`/`stun`/`enrage`/`bossEv`/`bossStart`/`bossClear`/`bossReset` の処理、スタンゲージ UI、HP 3 本バー、大剣投げ、技ごとのアニメ、専用の graz モデル、討伐演出。

**第2層 霧の大樹 ユグドラ**(t:'golem', appearance:'yugdra', scale3.0, 十字の間, brain yugdra。`bosses/yugdra.js` 129 行)
- 動かない（根を張る）。通路4本（北東南西）: torrent(狙った人の通路を線 w12 で中心→端, kd)、wheel(4通路を0.9秒ずつ回る)、nova(円r8.5)、rain(全員+ランダム円)、ripple(部屋を横切る細線の波)、spores(胞子の野: 小円22個を3波、cast バー)。
- 固有: 1本目割れ後 `cast{act:'drain', d:600000}` の「吸い上げ」: 4通路の端に根瘤(minion id -1)＝生きている数だけボス回復、全て切るとスタン。クライアントは根瘤からボスへ**光の線**(`link`)。3本目で「森の怒り」。
- Godot: 根瘤/link/drain/cast/モデル(golem glb 無し)すべて未。十字の部屋は grid の B 印で円ではなく `ARENA_CROSS`（lair は円 r20）。

**第3層 砂塵の大蠍 スコルピオ**(t:'beast', appearance:'skorpio', scale3.2, longArena 長方形, brain skorpio。`bosses/skorpio.js` 180 行)
- 技: sting(線 len26 w3.5) / sting3(3連) / pincer(扇 arc1.7 len10) / charge(回廊の端まで線 w6 + dash) / rain。
- 固有: **潜行 burrow**（`bossAct{p:'burrow',tid,d}`、潜っている間 `hit` は無効＝クライアントは砂ぼこりと盛り上がりを出す(loop.js 352 付近)。登場時は追いかけ円、2本目以降は「砂喰らい」`awayMark`）、**頭割り刻印**（`stack`: 黄・内向き矢印・足元に付いて回る円=`stackMarkMesh`、`d` 秒後に `tele`(src0, boss:id, d120) で弾けて人数割り）、**離れる印**（`stack{kind:'away'}` 赤・外向き矢印、`kd`）、3本目で詠唱「大砂嵐」(`cast` need>0, `castP` で中断、失敗すると回廊全体 tele)、`aim` 無し。HP 満タンなら倒れない設定。
- Godot: 全て未（スコルピオのモデルも無い。beast glb 流用）。

**第4層以降（data.js FLOORS[3..9]）**: クリスタロス(`crystalos`, patterns slam/nova/rain/cross)ほか全 10 層の定義はあるが `MAX_FLOOR = 3` なので遊べない。ブラウザにも crystalos のモデルのみ(`models/bosses/crystalos-model.js` 258 行)。**移植対象外でよい**。

ボス技（`boss-patterns.js` の共通技、クライアントは tele の形だけ描けばよい）: shot/combo/sweep/shock/chase/cage/ultimate/slam/cone/charge/nova/ring/rain/cross/spiral/summon/meteor/fissure/checker/haven/barrage。形は 4 種（circle/ring/cone/line）だけ。**Godot の `visuals.gd shape_mesh` は 4 種対応済み**。ただし 1 つの tele に最大数十個の形（rain/checker/spiral）が来るので負荷に注意。
ボスの弾 `proj`(`shoot`): クライアントが同じ軌道で動かし、当たり判定・ガード(`pblock`)はクライアント側（`actions.js updateBossProjs`、`meshes.js bossProjMesh`）。

## 3. ネットワークメッセージ

クライアント→サーバー（`public/js/game/net-client.js` 等の `net.send`、受け側 `sim/messages.js MESSAGES`）:

| t | 中身 | Godot (net.gd/game.gd) |
|---|---|---|
| hello | name,color,lv | 済み |
| st | x,z,a,hp,mhp,lv,sw,sk,wr,dg,gd,arm,rc,cl,wk,wst,pm,pt,dead | 済み（sk/gd/arm/rc/pm/pt は 0 固定） |
| hit | id,dmg,crit,st,tech | 済み（tech 無し） |
| move | to（出口） | 済み |
| wp | to | 部分（起動時だけ。解放/マップ未） |
| down | n | 済み |
| rev | id,v（倒れた仲間への攻撃） | 未 |
| absorb | id | 済み |
| interact | what:lever/chest, id | 済み |
| pblock | id（弾をガード） | 未（弾自体が未） |
| threat / taunt | n / r | 未（盾槍のヘイト） |
| warp | floor（転移門） | 未 |
| box | op:open/put/take/close | 未 |
| chat | text | 未（受信のみ） |

サーバー→クライアント（`grep "t: '"` で sim 全体を確認。計 38 種）:

| t | 内容 | ブラウザ処理 | Godot |
|---|---|---|---|
| welcome / warped | 入室・エリア移動 | enterArea | 済み |
| snap | 0.1s ごと全員/全敵/扉/感圧板 `pl`/bossState `bs` | snapshot.js onSnap | 部分（pl・bs・敵の enr/target/hateT/stunPct/guard 未使用） |
| roster / unlock | パーティ名簿・解放層 | renderParty / world.unlocked | 未 |
| tele | 予告 `sh[]`,d,dmg,c,kd,src | hurt.js onTele | 済み |
| die | 敵死亡 `boss` | onMobDie / bossDeath | 部分（縮小のみ。ボス爆発未） |
| xp / gold / loot | 経験値・金・ドロップ（宝箱含む） | | 済み |
| chat | チャット/システム | | 済み（表示のみ） |
| leave | 退室 | | 済み |
| pdown / revived / prev / bleed | 倒れ・起こされ・力尽き | | 済み（pdown は文字だけ、`prev` 未＝他人の起き上がり演出無し） |
| door | 扉が開く（揺れ+音） | | 済み（揺れなし） |
| weapon | | ※送信箇所なし（sim.js に 1 件） | 未確認 |
| escape | きらめくトカゲが逃げた | | 未 |
| box / boxPut / boxTake | 共有ボックス | | 未 |
| bossStart / bossClear / bossReset | ボス戦の開始・撃破・退却 | バナー/討伐演出 | 未 |
| enrage | 激昂/最終形態（p=2/3） | 輪+粒+揺れ | 未 |
| bossEv | バー割れの輪 {color,sfx} | | 未 |
| bossAct | 技の開始 {p,d,tid} | 技モーション/大剣投げ | 未 |
| cast / castP / castEnd | 詠唱バー・中断ゲージ | ボス HP バー下の詠唱 UI | 未 |
| stun | ボスのスタン | 大演出+全 tele/弾消去 | 未 |
| stack / mark / aim / judge | 頭割り/離れる印・「！」・照準線・溜め帯 | net-client.js | 未 |
| proj / pgone | ボスの弾の生成/ガード消滅 | actions.js | 未 |
| guardStop | ガードブレイク | | 未 |
| hateReset | ヘイトのリセット | 輪 | 未 |

## 4. NPC・クエスト・インタラクト・解放

- **NPC**: `AREAS[].npcs`（id,name,x,z,color,line,role）。町: 衛兵隊長ガレス/狩人ミラ/賢者オルド/鍛冶屋グラム。野営地: 森番セイル、旅の鍛冶屋ボルグ(f2)、行商人ハサン、砂漠の鍛冶屋ナディア(f3)。表示 `area.js buildNpcs`（`models/npc-models.js` 13 行、villager 既定）、頭上に名前と「！依頼あり/？報告できる」`npcMark`。F で会話・クエスト画面(`ui/panels/npc.js` 52 行)、`role:'smith'` は鍛冶屋 UI(`ui/panels/smith.js` 128 行; `items.js smithEnhance/Affix/Skill/Lore`)。Godot: **未**（NPC 配置・会話・鍛冶屋すべて）。
- **クエスト**: `public/js/quests.js`（112 行、12 件前後）。type = kill(敵名+エリア)/chest/boss(層)/visit。`after:` で連鎖。報酬 xp・装備・称号・ポーション。進行は `progress.js questEvent`（`xp` メッセージの `nm`,`ar`,`boss` と `loot src:'chest'`、`enterArea` の visit から）。セーブはキャラデータ。Godot: 未（xp/loot のイベントは来ているので追加は容易）。
- **称号**: `data.js TITLES`/`TITLE_DROPS`、`grantTitle`（ボス初討伐 `t_boss1..3`、ネームド）。未。
- **インタラクト**: F キー。レバー(L,距離4)→`openDoor`→`door` 通知（ブラウザはレバーの棒が倒れる等）。宝箱(chestsOf; big=最奥は固有+通常2個、小=アンコモン以上1個。個人ごと冷却 300s/600s)。共有ボックス(`def.box` 町/野営地、BOX_RANGE4.5、容量60、`box*` メッセージ、他の人が開いている間も更新)。鍛冶屋/NPC は 100% クライアント。Godot は レバー/宝箱の F のみ済み。
- **解放進行**: サーバーの `world.unlocked`（初期1）。層ボスを倒す(`A.n === unlocked`)と `unlock`、転移門(`warp`)で `FLOOR_HUB[n]` へ。出口の `move` は `AREAS[to].floor > unlocked` なら無視。ワープポイントは各エリアで近づくと解放（`char.waypoints`、町/野営地は gate で常時可）。Godot は unlocked を保持しておらず、`wp f1_field` を直接送る試作構成。

## 5. 規模の目安と推奨順

規模（GDScript 行の概算）:
| 塊 | 概算 |
|---|---|
| A. snap の完成（enr/guard/stunPct/hateT/target/pl/bs、精鋭・門番・ネームドの見た目、HP バー、`escape`/`prev`/`hateReset`/`door` 揺れ） | 300 |
| B. 危険地帯（毒・流砂）+ 天候（雨/霧/砂嵐 粒子+霧色）+ 環境の粒 | 400 |
| C. ボス共通基盤（bossStart/Clear/Reset、enrage、bossEv、cast/castP/castEnd UI、stun 演出、スタンゲージ、HP 3 本バー、討伐演出、`proj`/`pgone`/`pblock`、`aim`/`mark`/`stack`/`judge`） | 900 |
| D. ボス3体の固有: graz（大剣投げ・王の裁き帯・走り寄り）、yugdra（根瘤+光の線・drain 表示）、skorpio（潜行の砂ぼこり・刻印の矢印円）+ モデル(glb 書出し=`export_models.mjs` 拡張)、技ごとの動き | 1200 |
| E. 敵モデル追加（golem/wisp/mage/scorpion/sentinel(プレイヤー染め)/lizard/rootknot）+ 部品の歩き | 600 + export 側 |
| F. 屋内の本当の見た目（grid.js 相当: 床の市松・松明・扉・レバー・感圧板の点灯・罠トゲ・宝箱・ボス部屋の魔法陣 lair） | 500 |
| G. 屋外の見た目: 各エリアの第 3 世代地図（Blender 作業が主）、町（town.js 相当／town_plaza_g3 利用）、野営地、出口の門・ワープポイント・転移門 | 600 + 地図 15 枚の制作 |
| H. NPC（配置・名札・会話・クエスト画面）、クエスト進行、共有ボックス、鍛冶屋、マップ UI（ワープ解放） | 1500（UI 含む） |

推奨順（遊べる範囲が広がる順 / 依存順）:
1. **A+B**（snap と危険地帯・天候）= 既存エリアの完成度。サーバー変更なしですぐ効く。
2. **E の一部 + F（屋内）**: 迷宮区が遊べるようになる。レバー/扉/感圧板/罠(gatekeeper)は tele と snap の pl で動く。
3. **C（ボス共通基盤）**: これが無いとどの層もボス戦が成立しない（`proj`/`stun`/`cast`）。まずグラズ（1 層、仕組み最小で `bossAct`/`aim`/`proj`/`cast`/`judge` を全部試せる）。
4. **D**: yugdra → skorpio（`stack`・潜行は新規要素が多い）。
5. **H（NPC・クエスト・ボックス・鍛冶屋）** は戦闘と独立なので並行可（UI 作業が主）。
6. **G（地図）** はアート作業。f1_town と f1_field から着手、層 2・3 は後。

リスク/注意: ①snap/tele の仕様は変えない（ブラウザと同居）。②屋内の lair と longArena は `areas.js lairOf/inLair` を `export_gamedata.mjs` に追加で書き出す必要あり（今は B 印の座標のみ）。③`ai`/`guard`/`look`/`link`/`appearance`/`bars` は `export_gamedata.mjs` の floors に未出力。④`snap` 中の `kd` 付き tele は吹き飛ばし（Godot はのけぞり・ダウン未）に依存。⑤ゴールデンテスト `npm run test:golden` はサーバー側のみなので影響なし。
