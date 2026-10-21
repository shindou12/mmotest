# 人物・敵・ボス・武器のモデルと動き: 棚卸し（読み取りのみ）

調べた日: 2026-10-21。参照: docs/godot/migration.md（CP6 は「部品ごとの動きは未」）、ARCHITECTURE.md。

## 1. プレイヤーの骨組みと動きの移し方

### 1.1 部品の階層（public/js/models.js `makePlayer`、L89 付近〜）
```
root (Group)
 ├ ring            足元の輪 (MeshBasic, 半透明)
 └ body            ← 体全体。ダッシュ/ダウン/這いずりでここを回す・上げる
    ├ baseGear / shoulders / (胴, ベルト, コート裾, 首, 襟)  静的
    ├ head (y=1.83)  └ hair(Group), 目, 鼻, 耳
    ├ legs[0..1]     (x=±0.13, y=0.92)  rotation.x だけ使う
    ├ armL / armR    (x=∓0.36, y=1.4)   各 userData.elbow → hand の 3 段
    │    armR.elbow.hand = 右手(剣を持つ), armL.elbow.hand = 左手(弓・盾)
    ├ cape           rotation.x
    └ (後から付く) u.weapon(Group 'kind-grip') → hand の子、u.shield → elbow の子 or 背中、u.armor[] → body/head の子
```
- 参照は `root.userData = {body, legs[2], armL, armR, elbowL, elbowR, hand, handL, head, hair, cape, ring, baseGear, shoulders, weapon, ...}`。
- 材質は `toon()`（MeshToonMaterial + 4 階調）。`compact(body)` が「直下の静的メッシュを材質ごとに結合」するため、動く部品（脚・腕・頭・マント）以外は 1 メッシュに潰れる。`outline()` が各メッシュに裏返しの殻を子として付ける。
- 部品に名前は付いていない（`weapon` 'xxx-grip'、'base-chest-gear'、'player-hair'、'player-hair' だけ）。GLTFExporter 出力のノードは名前なしの Group になるので、いまの player.glb（4.6MB）は部品を名前で引けない。

### 1.2 毎フレームの姿勢の求め方（すべて手続き。キーフレームのクリップは無い）
入口は `animatePlayer(model, s)`（public/js/player-motion.js）。`s` は状態 {t, moving, walkT, kind, combo, swing, spin, sweep, dodge, down, hurt, crawl, guard, gg, motion, motionT, shieldBack, dead, heavy}。順序:
1. 歩き: `walk=sin(walkT*10)` → 脚 rotation.x=±0.75*walk、左腕=-0.6*walk、body.y の弾み、マント、頭の揺れ。
2. `applyAttackMotion`（weapon-motion.js）: sweep > swing > spin > 待機 の優先。武器種ごとに `weaponMotion(kind).swing/afterSwing/rest`（motions/index.js が登録表。近接は motions/melee.js、他は js/weapons/<武器>.js の `motion(rig)` で上書き）。
3. 回避（body を一回転）／這いずり／ダウン／のけぞり の上書き。
4. `updateWeaponPose` (weapon-pose.js): 技中なら `applyTechniquePose`（technique-motion.js: motions/styles.js の STYLES・KEYFRAMES から 12 個前後のつまみ {yaw,pitch,bodyYaw,lean,x,y,z,guard,lift,leg,draw} を時刻補間 → `techniqueMotion(kind)(u,s,t,p)`）、ダウンなら武器を寝かせる、それ以外は `weaponMotion.pose`。
5. 腕は 2 リンク IK（pose-rig.js `aimHand`: 二等辺 2 辺 0.3 の肘の位置を解析的に求め quaternion を setFromUnitVectors）、武器の向きは `orientWeapon`（yaw/pitch/roll から基底行列 → 腕・肘の逆回転を掛ける）。`alignGripHand`（models/grip-hands.js）が握り手を合わせる。
6. 盾: ガードで前へ、竜騎士は背負い（親の付け替え）、盾の光(gauge)の色。
- 規模: 武器ごとの動き js/weapons/*.js の motion 部分 + motions/*.js + pose-rig + weapon-pose + technique-motion + spear-motion ≈ 650 行（weapons/*.js 全体は 2,949 行だがほとんどスキル定義・効果）。
- 技のデータ: shared/techniques.js / tree-motions.js（hits, duration, style）→ shared/motion-catalog.js `MOTION_DURATIONS`（全モーション名）。motions/styles.js に約 58 個の形（STYLES）と KEYFRAMES。

### 1.3 移し方の選択肢
(a) 部品を別ノードで書き出し、姿勢関数を GDScript に移す
(b) 姿勢を glTF のクリップへ焼く
(c) ハイブリッド: 部品は別ノードで書き出し（名前付き）、姿勢計算は GDScript に移植（IK と orientWeapon は Godot の Basis/Quaternion で数行）

**推奨: (c)=(a)。** 理由:
- 状態が連続値（swing 0〜1、motionT、walkT、combo の偶奇、down/hurt の段階、サーバーの技名×武器種 117 通り）で、そのままの式で動く。クリップに焼くと組合せが爆発し（武器 6 種 × 技 117 × レア度ごとの握り位置 × 部位）、通常攻撃の `s.swing` はサーバー側のタイミングに合わせて毎フレーム位相が違うので結局クリップを位相でサンプルするだけになる。
- 元の式は短い（上記 ≈650 行）。移植すれば movement.gd の他の関数と同じ「式は元のまま、説明に元の関数名」という方針（migration.md）に合う。
- IK(`aimHand`) は目標の位置から毎回解くので、クリップだと手の位置が武器の GRIP_Y やスタイルで変わるのに追従できない。
- クリップが向くのは、敵の単純な周期の歩き・羽ばたき（animateMob の sin 式）だが、それも式が 1 行ずつなので GDScript 移植のほうが早く、スタン/予兆の色(emissive)とも同じ場所で扱える。

書き出し側に必要な変更（export_models.mjs）:
1. 部品に名前を付ける（body, head, armL, armR, elbowL, elbowR, hand, handL, legL, legR, cape, hair, baseGear, shoulders, weapon-grip 位置など）。`makePlayer` を触らず、書き出し直前に `userData` の参照から `.name` を付ければよい。
2. `compact()` が潰した静的メッシュ群は body 直下の 1 ノードで構わない（動かない部分）。ただし腕・脚・頭・マントは別ノードのままなのでそのまま使える。
3. ピボット（回転の中心）はノードの原点として既に入っている（arm.position=(±.36,1.4,0) など）ので、GDScript は `rotation` を直接設定するだけ。three.js は Euler XYZ、Godot の `rotation` も既定 XYZ→ 順序を `rotation_order = EULER_ORDER_XYZ` に合わせる。座標系は three.js も Godot も右手系 Y 上だが、glTF 経由で +Z 前方を保つこと（Godot 取り込み時の `-Z` 前方規約との差は既に visuals.gd のモデルで吸収済みか要確認: game.gd は me_node.rotation.y=me.a）。
4. 武器・盾・防具は別 glb にして、`hand`（右手）ノードの子に付ける（GRIP_Y[kind] だけ下げる、弓は左手で rotation.y=-π/2）。

### 1.4 golden-poses.json での検証
- 中身は **骨の行列ではなくハッシュ**: キーは `motion/<技id>/<武器種>`（117 個）と `basic/...`（24 個）、値は sha256 の先頭 24 桁（test/golden/pose-trace.mjs が 13 時刻 × body,head,arm*,elbow*,hand*,legs,cape,weapon,shield の matrixWorld 4x4 を 1e-8 に丸めて JSON 化してハッシュ）。テストは test/golden-poses.test.js。
- よって Godot の結果と直接は比べられない。手順案: pose-trace.mjs の `sample()` と同じ入力列（`base` 状態 + 技 id・時刻、basic の状態一覧）を使い、ハッシュ前の生の行列を JSON に書く別の道具（tools/worldart/godot/export_poses.mjs、新規）を作る → Godot で同じ入力を GDScript に与えて 10 個ほどのノードの全体変換を出す → 許容誤差 1e-4 で比較（Godot のスクリプトは `--headless` 実行。client_test.sh と同じ流儀）。元のハッシュは、export_poses が出す生の値のハッシュが golden と一致することで「書き出しが元の計算と同じ」ことを保証する。
- 全 141 ケース × 13 時刻 = 約 1,800 の姿勢を自動で照合できる。これが移植の完了条件になる。

## 2. モデルの種類と書き出し状況

書き出し（tools/worldart/godot/export_models.mjs）は playwright でゲームを開き、`makePlayer('#448a9b')`・`makeMob(t,...)` を GLTFExporter で書く。輪郭線の殻(BackSide)と半透明板を除き、材質は色だけの MeshStandard（'toon' または光る部品は 'glow'）にする。出力は godot/worldart/data/models/: player.glb（4.6MB, 武器・盾・防具なし, 色固定）、mob_slime/beast/bat/mushroom/knight.glb、boss_knight.glb（第 1 層のボスだが appearance なしの makeMob(boss=true,appearance=F.boss.appearance) なので graz が出ているかは要確認。bossT 'knight' + appearance 'graz'）。FLOORS[0] だけ。

### 2.1 武器（public/js/models/weapon-models.js が各 js/weapons/<武器>.js の `model(kit)` を集める）
`makeWeapon(kind, rarity(0..7), style)`。style の選び方は `weaponStyle(it)`（models.js）: 名前のハッシュで 0〜2、greatsword だけ 4,5 もあり得る、レア度 6 以上の固有は shared/weapon-appearances.js の ID（sword 4〜8, greatsword 6,7）、未登録の伝説/神器は 3。飾りの段階は `visTier(rarity)`（金具・光る縁・材質色が変わる）。
| 武器 | 基本(0) | 形違い | 固有・専用 |
|---|---|---|---|
| sword | base | 1 katana, 2 leaf (models/sword-forms.js) | 3 光の結晶と翼の鍔 / 4 amenomurakumo, 5 durandal, 6 laevateinn, 7 oni_kiba, 8 sosei (unique-swords.js)。new-sword-candidates.js は比較用（本番外） |
| greatsword | base | 1 cleaver, 2 zweihander, 3 flamberge, 4 odachi, 5 falchion (greatsword-forms.js。0 は balanced) | 6 excalibur, 7 dainsleif (unique-greatswords.js) |
| spear | base | 1 ハルバード, 2 三叉槍 | 3 翼のある光の槍 |
| dagger | base | 1 クナイ, 2 クリス | 3 月の双刃 |
| axe | base | 1 髭斧, 2 戦鎚 | 3 ルーンの大三日月 |
| bow | base | 1 リカーブ, 2 ロングボウ（弦と矢は `bowString` で userData.bow に入れ、引くと動く） | 3 三日月と刃の翼 |
- 合計: 基本 6 + 形違い ≈ 14 + 固有 ≈ 11 = 約 31 形 × 飾りの段階 6（材質・縁の追加だけ。ジオメトリの違いは `edge()` の光る縁の有無と材質色）。
- 書き出し: **なし**。Godot 側: **なし**（visuals.gd の仮の `Sword`＝箱だけ。glb がなければ代用）。

### 2.2 防具の見た目（models.js `armorLook`/`setPlayerArmor`, models/armor-looks.js）
look 0=なし、1 フード、2 忍びの襟巻き、3 革の肩当てとマント、4 鎖頭巾と胸当て、5 騎士の兜と大肩当て、6 角兜と重マント（`ARMOR_LOOK_NAMES`）。軽/中/重 × atype の偶奇で決まる。baseGear/shoulders/hair の表示切替と、body/head の子としての追加物。書き出し: なし。Godot: なし（常に素の体）。ほかの人の服の色は自分と同じ（migration.md）。

### 2.3 盾
SHIELD_MODELS（models/shield-models.js）に `kite` の 1 つだけ（盾槍 spear の盾）。ガード中に光る縁(gauge)＋ガードゲージの色。書き出し: なし。Godot: なし。

### 2.4 敵（models/mob-models.js の MOB_MODELS: 10 種 + 知らない t は knight）
slime, beast, golem, wisp, bat, mushroom, scorpion, lizard, rootknot, mage, knight。
動きは `animateMob`（models.js）が userData の部品名（squash, legs, legs2, tail, head, wings(+flap), cap, hover/float+shell, arms, arm, guardArm, cape, sigil, aura）に対し t・st(1=移動 2=予兆 3=攻撃)・stun・flash・enraged で sin 式を当てる共通関数。
- 書き出し済み: slime, beast, bat, mushroom, knight（第 1 層の敵と精鋭）。未: golem, wisp, scorpion, lizard, rootknot, mage（第 2〜4 層）。色は階層の表の色で作り直す（`makeMob(t, color, scale, accent, boss)`）ので、書き出しの色と実行時の色が違う（Godot は glb の色をそのまま使う。visuals.gd:mob は color 引数を無視）→ 要対応。
- Godot: 上の 5 種 + boss_knight を表示するだけ。歩き・羽ばたき・予兆の赤点滅・スタンの黄色は未。

### 2.5 ボス（models/boss-models.js の BOSS_MODELS。appearance キー。FLOORS[i].boss.appearance）
| appearance | 層 | build | 専用 animate | 技の動き(motions) |
|---|---|---|---|---|
| graz | 1 | bosses/graz-model.js (+graz-sculpt.js, sdf.js) | なし（animateMob 共通） | GRAZ_MOTIONS |
| graz3 / graz4 | 比較用 | graz-fx.js buildGraz3/4 | animateGraz3 | GRAZ_MOTIONS |
| yugdra | 2 | yugdra-model.js | animateYugdra | YUGDRA_MOTIONS |
| skorpio | 3 | skorpio-model.js | animateSkorpio | SKORPIO_MOTIONS |
| crystalos (2,3) | 4 | crystalos-model.js | animateCrystalos | なし |
層 5〜10 のボスは appearance なし（ふつうの mob 形 beast/knight/golem/wisp）。技の動きの再生は models/boss-motion.js（キー付きの時刻補間: `'arm.rotation.x'` のような部位パスと `aim.pitch/yaw`、hold, stretch, sp）。
- 書き出し: boss_knight.glb のみ（makeMob の boss=true なので appearance 'graz' がビルドされているはずだが、ファイルの中身は未確認）。yugdra/skorpio/crystalos、クリスタロスの 2,3 段階は未。
- Godot: boss_knight（graz）の表示のみ。技の動き・オーラ(PointLight)・紋様(sigil)・弾と演出は未。

### 2.6 NPC（models/npc-models.js）
`villager` の 1 種だけ = `makePlayer(d.color)`＋輪を隠す。エリア定義の npcs[].model が他の名前でも villager。書き出し: なし。Godot: NPC 自体が未（クエスト・NPC は未）。player.glb を色違いで使えば足りる（材質を `base_color` 差し替え）。

### 2.7 そのほか
落とし物（coin, shard, goldBag, lootItem, lootOrb）は models.js 末尾。書き出しなし。Godot は簡易表示（items.gd）。

## 3. トゥーンと輪郭線

### ブラウザ（public/js/toon.js）
- `toon(color)`: MeshToonMaterial + `gradientMap` = 4 階調 [70,150,215,255]（NearestFilter）。`glow()` = MeshBasic（光る部品）。
- 近景の透過 (`OCC`): カメラと自キャラの間のもの、カメラに近すぎるものを 4×4 のディザで discard。toon/glow 材質と輪郭に onBeforeCompile で注入。
- 輪郭線 `outline(root,w)`: 各 Toon メッシュに「`hullGeo`（頂点を 1e-3 で統合して法線を作り直した版）+ BackSide の黒紫(0x17121f)」を子として付け、頂点シェーダーで 法線方向に `0.0021*width*(-z)` 押し出す（画面でほぼ一定の太さ）。`noOutline` で除外。`compact` が静的メッシュを結合。`Batch` は大量複製用。
- キャラクターはトゥーン + 輪郭線のまま（CLAUDE.md 方針: 背景だけ RO 風）。
### Godot の現状
- 輪郭線なし（export が殻を除く）、トゥーンの階調なし。visuals.gd `model()` は材質を `shaders/flat.gdshader`（ランバート + wa_hemi の空の光、地図と同じ式）の単色に置き換え、光る部品は unshaded。つまり「人物が地図と同じ光で単色に塗られた」状態。トゥーンの 4 階調と黒紫の輪郭は未実装。
- 移植案: (1) `shaders/toon.gdshader`（`light()` で dot(N,L) を 4 段階に量子化 [0.27,0.59,0.84,1.0]/255 に相当）、(2) 輪郭は `next_pass` に反転外殻のシェーダー（`cull_front`、vertex で `VERTEX += NORMAL * 0.0021*w*(-view.z)`）。法線が頂点統合されていない面ごと分かれた形（立方体など）は殻が割れる → three.js の hullGeo と同じ「位置で統合した滑らかな法線」を書き出し時に別メッシュ/UV2 に入れるか、Godot 取り込みで `ArrayMesh` の頂点統合を行う必要がある。(3) OCC のディザ抜きは post 側または専用 discard で別作業。

## 4. 規模の目安と移植の順序

| 段 | 内容 | 規模 | 依存・検証 |
|---|---|---|---|
| 1 | player.glb を名前付き部品で書き出し直し、部品参照を GDScript にまとめる（player_rig.gd） | 小（50 行 + export 修正） | 目で確認 |
| 2 | 共通の動き: 歩き・回避・ダウン・のけぞり・這いずり + 通常攻撃（片手剣=MELEE swing）。`animatePlayer` の 1〜3 と applyMeleePose/Swing、aimHand/orientWeapon | 中（約 250 行） | export_poses.mjs の basic/ のうち sword を照合 |
| 3 | 武器の glb 書き出し: 6 種 × 形（第一段は基本 + 形違い、約 20 形）× 飾りの段階（段 0,3,4,5 の代表の 4 つ程度で足りる）。武器をパラメータ付きでなく**種類ごとに別ファイル** | 中（export スクリプト 80 行、glb 約 100 個になるので、材質を共通にして色だけ後から差す工夫が要る） | 武器の位置は GRIP_Y と pose の整合 |
| 4 | 技のモーション: technique-motion + motions/styles.js（データはそのまま JSON に書き出して使う）+ melee の technique + 武器別 motion (weapons/*.js の motion: greatsword, spear, dagger, axe, bow, spear-motion) | 中〜大（約 400 行） | golden 照合: motion/*（117）|
| 5 | トゥーン + 輪郭線のシェーダー | 中 | 見た目の比較（compare.py ではなく人物用の撮影） |
| 6 | 防具の見た目 6 + 盾(kite) + 他プレイヤーの色/装備の反映（snapshot の装備情報） | 小〜中 | |
| 7 | 敵: animateMob の共通式（20 行）+ 層 2〜4 の mob 追加書き出し（6 種）、色を実行時に反映 | 小〜中 | model-trace の頂点数照合 |
| 8 | ボス: yugdra/skorpio/crystalos の build 書き出し + animate + boss-motion の再生（キー補間）+ 技のデータ書き出し + オーラ/紋様 | 大（ボスごとに 1〜2 日。boss-motion は 77 行 + 各 motion データ 約 200 行） | |
| 9 | NPC villager（player.glb の再利用）、落とし物の見た目 | 小 | |

総量の目安: GDScript 約 800〜1,200 行、書き出しスクリプト約 200 行、新規 glb 約 40 ファイル。最大の危険は (i) 材質を色だけにして書き出した場合のプレイヤー色の動的な差し替え（色が焼き込み: player は '#448a9b' 固定。`makePlayer(color)` の `cloth/clothD/coat` は色から計算されるため、書き出し時に材質名で役割（cloth, clothD, coat, hair）を付け、Godot で `base_color` を差し替える形にする）、(ii) glb の大きさ（player.glb 4.6MB は `lock()` の髪・目などの曲面が三角形を多く持つため。LOD/低分割の `?low` が使えるか）、(iii) 輪郭線の殻と hullGeo の法線。

## まとめの位置づけ
- Godot の現状: 静的モデルの表示だけ（player 1 + mob 5 + boss 1）。動き・武器・防具・盾・NPC・トゥーン/輪郭は未。
- 主なファイル: public/js/models.js, player-motion.js, weapon-motion.js, weapon-pose.js, pose-rig.js, technique-motion.js, motions/{index,melee,styles}.js, models/*.js, toon.js, test/golden/pose-trace.mjs, tools/worldart/godot/export_models.mjs, godot/worldart/scripts/game/visuals.gd。
