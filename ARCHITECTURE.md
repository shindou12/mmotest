# 浮遊城エテルナ — コードの構成

武器・クラス・形違い（バリエーション）・モデル・モーションを「データを書いて登録する」だけで
足せるように分けてある。ここでは、どこに何があるか（モジュール図）と、足し方を書く。

## 全体の図

```
server.js ──────────────► public/shared/sim.js（World: プレイヤー・エリア・毎フレーム・状態の配信）
                               └─ sim/  役目ごとのメソッドと登録表（World に足す）
                                   ├─ messages.js     ★ プレイヤーからのメッセージ（t ごとの登録表 MESSAGES）
                                   ├─ boss-patterns.js ★ ボスの技（技ごとの登録表 BOSS_PATTERNS）
                                   ├─ boss-brains.js  ★ ボスごとの行動ロジック（登録表 BOSS_BRAINS。中身は bosses/<名前>.js）
                                   ├─ mob-attacks.js  ★ 敵の攻撃の形（敵の形 t ごとの登録表 MOB_ATTACKS）
                                   ├─ mobs.js / boss.js / area-tick.js / interact.js   敵・ボス・エリアの毎フレーム・レバーや宝箱
                                   └─ common.js       共通の道具と定数
public/shared/ ─ data.js（武器種・装備・敵・称号の表）/ balance.js / areas.js
   （サーバーとブラウザの共通） techniques.js / tree-motions.js（技の時刻とモーション）
                               skill-timings.js / motion-catalog.js

public/js/main.js（ログイン・ゲームの API・window.__game）
   │
   ├─ game/            ゲーム本体（1ファイル1つの役目）
   │   ├─ state.js        自分・他人・敵などの状態（入れ物）
   │   ├─ util.js         rnd / now / angDiff / deg / lerp など
   │   ├─ ui-bridge.js    画面（ui/app.js）への窓口（DOM にはさわらない）
   │   ├─ render.js       three.js のシーン・カメラ（cam）・画面→地面の変換・霧・描画・fx・audio
   │   ├─ save.js         セーブ（キャラクターの保存と読み込み）
   │   ├─ stats.js        能力値の計算（S）・バフ
   │   ├─ input.js        キーボード・マウス・タッチ
   │   ├─ net-client.js   サーバーとのやりとり
   │   ├─ area.js / snapshot.js   エリアの入れ替え・サーバーの状態の反映
   │   ├─ combat.js       ダメージ計算・命中
   │   ├─ hurt.js         被弾・ガード・回避・ダウン
   │   ├─ actions.js      攻撃・強攻撃・スキル・飛び道具。スキルに渡す文脈を役目ごとの小さな形で持つ
   │   │                    （senses 見る・狙う / strikes 当てる / feedback 見せる・鳴らす / selfCare 回復・バフ / party 挑発）
   │   ├─ meshes.js       戦闘で使う見た目（矢・斧の幻影・ボスの弾・弓の照準・罠・旗・手の位置など）を作る
   │   ├─ tree-effects.js 武器ツリーの共通部分（バフ・クールタイム・旧データの移し替え）
   │   ├─ variants.js     スキルの形違い
   │   ├─ progress.js / loot.js / items.js / labels.js
   │   ├─ loop.js         毎フレームの更新
   │   ├─ weapon-fx.js    ★ 武器ごとの効果の差し込み口（フック）
   │   ├─ weapon-api.js   ★ 武器の効果に渡す道具（player・field・attack・tree・show・party・register の小さな形）
   │   └─ weapons/index.js  各武器のファイルの effects に道具（weapon-api）を渡して、効果を登録させる
   │
   ├─ weapon-tree.js   武器ツリーの仕組み（熟練度・振り分け・効果のまとめ）
   ├─ weapons/<武器>.js ★ 1つの武器のすべて（ツリー・Q/E・強攻撃・武器スキル・形・構え・効果）。weapons/index.js が登録表
   ├─ skills.js / advanced-skills.js   スキルの集まり（強攻撃・武器スキルは各武器のファイルから集める）
   │
   ├─ models.js        モデルの組み立て（プレイヤー・武器・防具・敵・落とし物）
   ├─ models/
   │   ├─ kit.js          ★ 形の道具（mesh・sphere・extrude・finish・bowString など）
   │   ├─ weapon-models.js ★ 武器の形の登録表（kind → base と styles）
   │   ├─ armor-looks.js  ★ 防具の見た目の登録表（look → 関数）
   │   ├─ mob-models.js   ★ 敵の形の登録表（t → 関数。知らない t は knight）
   │   ├─ boss-models.js  ★ 専用ボスの登録表（appearance → build / animate）。造形は bosses/ に置く
   │   ├─ shield-models.js ★ 盾の形の登録表（WEAPONS[kind].shield の名前 → 関数）
   │   └─ npc-models.js   ★ NPC の見た目の登録表（エリアの npcs[].model → 関数。なければ villager）
   │
   ├─ player-motion.js 体の動き（歩き・のけぞり・ダウン）の取りまとめ
   ├─ weapon-motion.js 攻撃の振り（どの動きを優先するか）
   ├─ weapon-pose.js   手首・武器の向き（技 → ダウン → 武器ごとの構え）
   ├─ technique-motion.js 技のモーションの計算（キーフレームを作って補間）
   ├─ pose-rig.js      腕の IK（aimHand）・武器の向き（orientWeapon）・GRIP_Y
   ├─ spear-motion.js  盾槍の連続した姿勢
   ├─ motions/
   │   ├─ index.js        ★ 武器ごとの体の動きの登録表（pose / swing / technique）
   │   ├─ styles.js       ★ 技の姿勢のデータ（STYLES / KEYFRAMES）
   │   └─ melee.js        近接の動き（武器ごとの上書きは js/weapons/<武器>.js の motion）
   │
   ├─ env.js           エリアの見た目の組み立て（buildArea）
   ├─ env/
   │   ├─ props.js        ★ 飾りのプロップの登録表（PROPS: 木・岩・花…）
   │   ├─ obstacles.js    ★ 障害物の登録表（OBSTACLES）・危険地帯・宝箱・ボックス
   │   ├─ open.js / grid.js  屋外（フィールド・町・野営地）/ 迷路（ダンジョン・迷宮区）
   │   ├─ landmarks.js    空・転移門・ワープポイント・ボスの部屋・草・遠景
   │   ├─ ambient.js      漂う粒子 / kit.js  地形の道具（決まった乱数・高さ・文字の札）
   ├─ toon.js / fx.js / audio.js   トゥーンの材質・効果・音
   └─ ui/
       ├─ app.js          画面の部品（View）を作り、Mediator（状態と操作の裁定）を動かす
       ├─ panels/*.js     ★ 画面ごとの Presenter（items・inventory・tree・map・npc・smith・hud・touch・minimap・floats・messages・settings）
       └─ core.js / helpers.js  View・Root・Mediator の土台 / 共通の道具
```

端（外の仕組み）への依存:
- three.js は `game/render.js`・`game/meshes.js`・`game/labels.js`（名札）と、models・env・fx・toon・motions・pose-rig（見た目と姿勢の部品）だけが使う。
  戦闘・被弾・能力値・入力・状態（combat・hurt・stats・input・state・actions・loop・weapons/*）は three.js を import しない。
- DOM は `ui/`（と名札の canvas）、WebSocket は `net.js` だけ。

依存の向き: `game` → `ui` へは `ui-bridge.js` だけを通す。`game/*` の中心の処理（combat・hurt・stats・
actions・loop など）は、武器の名前やノードの id を知らず、`weapon-fx.js` のフックを呼ぶだけ。
武器ごとの中身は `js/weapons/<武器>.js`（の effects）に閉じている。武器の効果のファイルは具体的なモジュール（state・stats・combat…）を import せず、
`game/weapon-api.js` が作る小さな形（ポート）を引数で受け取る（依存性の逆転）。

### sim の import の深さ

ブラウザのソロモードは `shared/sim.js` を `import()` で読み込む。モジュールが見つかる段（sim.js から何段目か）が深くなると、
読み込みが終わるまでのフレーム数がわずかに変わり、時計を固定した記録テスト（戦闘の golden）の結果が変わる。

- sim.js は、分ける前と同じモジュール（motion-catalog・techniques・balance・data・areas）を直接読む。
- `sim/common.js` は何も import しない。
- 武器のファイル（`js/weapons/*.js`）も sim.js から3段目で見つかるようにしてある（sim.js が `js/weapons/index.js`・`common.js`・`game/util.js`・`tree-motions.js` を直接読む）。
  武器のファイルが新しいモジュールを読むときも同じく、sim.js からの段を3段目までに保つ（`python3` などで数えられる。sim.js が1段目）。
- `sim/*.js` から新しいモジュールを読むときは、sim.js からも直接読むか、戦闘の golden（`npm run test:golden`）で差が出ないことを確かめる。

### 層と依存の向き（依存性の逆転）

```
  組み立て役        main.js → game/wiring.js（中心の処理のポートを埋める） / game/weapon-api.js（武器の効果の道具） / actions.js の combat（スキルの道具）
       │ 差し込む
  中心の処理        combat・hurt・stats・loop・actions・input・tree-effects・variants・items・loot・progress
       │ 読むのは game/ports.js の入れ物だけ（state・stats・view・screen・link・field・rules）
  拡張する部分      武器のファイル（js/weapons/*.js: 効果は effects(api)）・スキル（c を受け取る）・登録表（models・motions・env・sim）
       │
  端（具体的な実装） state・save（状態とセーブ）・render・meshes・labels（three.js）・ui-bridge / ui（DOM）・net-client / net（通信）
                    area・snapshot（エリアとサーバーの状態の反映）
```

- 中心の処理は、具体的なモジュールを import しない。`game/ports.js` の入れ物から `state.me`・`stats.S`・`view.fx`・`rules.dealDamage` のように読む。
  中身は `game/wiring.js` が起動のときに差し込む（書き換わる値は getter）。描画や通信を差し替えて、中心の処理だけを動かすこともできる。
- 中心の処理に新しい道具を渡すときは、`game/wiring.js` に1行足す。
- 入れ物は読み込みの時点ではまだ空なので、中心の処理のファイルの一番外側（関数の外）では入れ物を使わない。
- スキルに渡す道具（actions.js の combat）とガードゲージの初期値は、ポートが埋まったあとに組み立て役が作る（`buildCombat()`・`initGuard()`）。

## 武器ごとの効果（フック）の仕組み

`game/weapon-fx.js`:

- `register(wk, { フック名: 関数 }, { フック名: 順 })` で登録する（`register` は install(api) が受け取る `api.register`）。
- 呼ぶ側の使い分けは次のとおり。
  - `fxCall(名前, ...)` は全部を呼ぶ。
  - `fxSome(名前, ...)` はどれかが true を返したら止める（横取り）。
  - `fxReduce(名前, 値, ...)` は値を順に変える（倍率・加算）。
- 全武器のフックを呼び、各フックは自分のクラス・ノードが有効なときだけ働く。持ち替えた直後に残るバフや設置物も、これでそのまま働く。
- 呼ぶ順は登録した順が基本。もとの計算順（掛け算の順で小数の端数が変わるもの）を保つために、各武器が第3引数で場面ごとの順を書いている。
  新しい武器は順を書かなければ、順の付いた武器のあとに呼ばれる（ほかのファイルは直さなくてよい）。

主なフック（場面）:

| フック | 使い方 | 場面 |
|---|---|---|
| `stats(S, WT)` / `afterStats` | 直接書き換え | 能力値の計算 |
| `dmgMult(k, W, o, mb, crit)` | reduce | 与ダメージ倍率 |
| `critAdd` / `critAlways` / `critAfter` | reduce / some | 会心 |
| `onHit(mb, dmg, crit, o, mult)` | call | 当てたとき |
| `onHurtFirst` / `onHurt` / `onHurtCharging` / `dr` / `incoming` / `cheatDeath` | call / reduce / some | 被弾 |
| `onGuard` / `guardCounter` / `steadyGuard` / `guardKeep` / `guardRegen` | call / some / reduce | ガード |
| `heavy` / `heavyStart` / `heavyAfter` / `heavyOverride` / `heavyNeedsFull` | call / some | 強攻撃 |
| `swingAspd` / `swingExtra` / `swingLate` / `swingLast` / `reach` / `swingColor` | reduce / call | 通常攻撃 |
| `afterCast` / `afterCastLate` / `cooldownDt` | call / reduce | スキル |
| `justDodge` / `onDodge` | call | 回避 |
| `aura(dt, W)` / `tick` | call | 毎フレーム |
| `shoot` / `arrowTick` / `arrowEdge` / `arrowHit` / `arrowGone` | call / reduce | 矢 |

正確な一覧と引数は `js/weapons/*.js` の effects の実装と、呼んでいる側（`grep -n "fx\(Call\|Some\|Reduce\)" public/js/game`）を見る。

## 足し方

### 武器の種類を足す

新しい武器は、**`public/js/weapons/<wk>.js` を1つ足して、`public/js/weapons/index.js` の `WEAPON_DEFS` に1行足すだけ**。ほかのファイルは直さない。

`public/js/weapons/<wk>.js` は `export default { wk, kindOrder, stats, tab, glyph, tree, skills, mods, legacy, heavy, weaponSkills, model, motion?, effects }` を書く。
登録表（WEAPONS・HEAVY・WEAPON_SKILLS・WEAPON_MODELS・WEAPON_MOTIONS・武器の効果）は、どれも `WEAPON_DEFS` から集めて作られる。

- `stats`・`kindOrder`: サーバーと共通の数値（名前・射程・速さ・重さ・握る位置 grip・盾 shield・両手持ち・スキルの候補 skillPool など）と、`WEAPONS` での並び順。
  `shared/data.js` の `WEAPONS` に集まる。サーバー（Node）もこのファイルを読むので、three.js や DOM は直接 import しない。
- `tab`・`glyph`: 武器ツリー画面のタブの並びと、装備アイコンの文字。
- `tree`・`skills`・`mods`・`legacy`: 武器ツリー（段とノード、Q/E スキル、ツリーが足す能力値、旧ツリーからの移行）。
- `heavy`: 強攻撃（`run(c, lv)`）。`weaponSkills`: 武器に付くスキル（id → `{ name, kind, cd, run(c) }`。id は `stats.skillPool` に書く）。
- `model(kit)`: 形を返す関数。`kit` に three.js と形の道具（`THREE`・`mesh`・`sphere`・`cone`・`cyl`・`lathe`・`extrude`・`bowString`・`toon`）が入る。
  返す形は `{ base(k), styles: { 1, 2, 3 }, prep? }`（`base` が基本の形、`styles` が形違い）。
- `motion(rig)`（近接と違うときだけ）: 構えを返す関数。`rig` に `THREE`・`aimHand`・`orientWeapon`・`ease`・`applyMeleePose`・`spearPose` が入る。
  返すのは `{ pose, swing, technique, afterSwing, rest }` の書いたものだけで、近接の動きを上書きする。
- `effects`: 武器ツリーの効果。`function effects({ player, field, attack, tree, show, party, register })` の中で
  `register('<wk>', { フック: 関数 }, { フック: 順 })` で登録する（使える道具は `game/weapon-api.js` の一覧）。
  - スキルに渡す道具（`combat` 文脈）を足すときは `attack.extendCombat({ ... })`。
  - 能力値 S は計算し直されるので、分割代入せず `player.S` で読む。
- 初期武器のスキルを `skillPool` の1つ目から変えるときだけ、`shared/data.js` の `STARTER_SKILL` にも足す。

### クラス・マスター・パッシブ（武器ツリーのノード）を足す

1. `public/js/weapons/<wk>.js` の `tree.rows` にノードを足す（id は `<略号>_<名前>`）。
   - 能力値だけのパッシブは、ノードに `mods: [lv1, lv2]` を書けば済む。
   - lv3 の分岐（A/B）で能力値が変わるときは、そのファイルの `mods()` に書く。
2. 動きのある効果は `public/js/weapons/<wk>.js` の effects のフックに書く。
   - クラスは `W.ks1 === 'id'`、マスターは `W.ks2 === 'id'`、パッシブは `W.lv('id')` / `W.br('id') === 'A'` で判定する。
   - 新しい場面が必要なら、呼ぶ側に `fxCall('名前', ...)` を1か所足す（`weapon-fx.js` の説明を参照）。
3. 技のモーションが要るなら `public/shared/tree-motions.js` に時刻（hits・duration・style）を足し、姿勢を `motions/styles.js` に足す。

### スキルの形違い（バリエーション）を足す

- `public/js/game/variants.js` と `shared/data.js` の `SKILL_VARIANTS` に足す。

### モデルを足す・差し替える

- 武器の形: `js/weapons/<武器>.js` の `model`（`models/weapon-models.js` の `WEAPON_MODELS[kind]` に集まる）。
  - `base(k)` が基本の形（style 0）。
  - `styles[1|2|3](k)` が形違い（3 は伝説・神器の専用形）。
  - 形違いの前に共通の道具を作るときは `prep(k)` を書く。
  - `k` には材質と道具が入る（`g`・`steel`・`gold`・`grip`・`gem`・`edge`・`handle`・`blade`・`glowM` など）。
- 防具の見た目: `models/armor-looks.js` の `ARMOR_LOOKS[look](k)`。
  - 名前は `models.js` の `ARMOR_LOOK_NAMES` に足す。
- 敵の形: `models/mob-models.js` の `MOB_MODELS[t](k)`。
  - 動かす部位は `k.parts` に入れる（動きは `animateMob`）。
- 専用ボスの形: `models/boss-models.js` の `BOSS_MODELS[appearance]`。`build(body, accent)` と必要な `animate(parts, state)` を登録する。
  - 階層のボス定義の `appearance` を `game/snapshot.js` が渡す。通常の敵の `t` と戦闘処理は変えない。
  - 統合範囲は `docs/boss-models.md`、次の武器の棚卸しと制作順は `docs/weapon-model-roadmap.md`。
- 盾の形: `models/shield-models.js` の `SHIELD_MODELS[形]`。武器の表の `shield` にその名前を書く。
- NPC の見た目: `models/npc-models.js` の `NPC_MODELS[名前](d)`。エリアの `npcs` に `model: '名前'` を書く（なければ villager）。
- 形の道具（`mesh`・`sphere`・`capsule`・`cone`・`cyl`・`lathe`・`extrude`・`finish`・`bowString`）は `models/kit.js`。

### モーションを足す・編集する

- 技の時刻（いつ当たるか）: `public/shared/techniques.js`（Q/E 技）と `public/shared/tree-motions.js`（武器ツリー）。
  - `hits`・`duration`・`style` を書く。
  - サーバーと同じ時刻を使う。
- 技の姿勢: `public/js/motions/styles.js`（データだけ）。
  - `STYLES[style] = { pose: [振りかぶり, 当たり] }`（どの当たりも同じ）か `{ hits: [[振りかぶり, 当たり], ...] }`（当たりごと）と書くと、hits の各時刻でその姿勢を通る。
  - 時刻を自分で並べたいときは `KEYFRAMES[style] = [{ at, ...つまみ }]`。
  - 一回転で終わる動きは `FULL_TURN` に足す。
  - つまみ（yaw・pitch・bodyYaw・lean・x・y・z・guard・lift・leg・draw）は `BASE` に並んでいる。
- 武器ごとの構え・通常攻撃の振り: `js/weapons/<武器>.js` の `motion`（`motions/index.js` が近接の動きに上書きして集める）。
- 盾槍の突きの技は `shared/skill-timings.js` に時刻と `thrust`（突きの形: stroke・dash・repeat）を書くだけ。新しい形のときだけ `spear-motion.js` の `THRUST_CURVES` に足す。盾槍の連続した姿勢は `spear-motion.js`（時刻は `shared/skill-timings.js`。`spin: true` の動きは回転として扱われ、ほかのプレイヤーからも回って見える）。

### 敵・ボスの技・メッセージを足す（サーバー）

- 敵の攻撃の形: `public/shared/sim/mob-attacks.js` の `MOB_ATTACKS[t]` に関数を足す。
  - 予兆の形の配列を返す。自分で予兆を出したときは `null` を返す。
  - 登録のない t は `default`（前へ一直線）になる。
  - 見た目は `public/js/models/mob-models.js` の `MOB_MODELS[t]` に足す。
- ボスの技: `public/shared/sim/boss-patterns.js` の `BOSS_PATTERNS[名前]` に関数を足す。
  - 戻り値は次の行動までの秒数。
  - `public/shared/data.js` のボスの `patterns` / `p3` に名前を書くと使われる。
- ボスごとの行動ロジック（brain）: `public/shared/sim/bosses/<名前>.js` を作り、`boss-brains.js` の `BOSS_BRAINS` に登録して、
  `data.js` のボスに `brain: '<名前>'` と `bars`（HPバーの本数）を書く。見本は `bosses/graz.js`（仕様は `docs/design/boss-sheets/graz.md`）。
  - brain が持つもの: `spawn` / `tick`（true で行動しない）/ `patterns`・`gap`・`chain`（技の選び方）/ `moves`（ボス固有の技）。
  - brain の無いボスは今までどおり共通ロジック（激昂 65% → 最終形態 35%）で動く。
  - 共通の部品（`sim/boss.js`）: `startCast`（詠唱バー・中断ゲージ）/ `markTarget`（狙い替えの「！」。挑発で取り返せる）/ `rushTo`（走って近づく）。
    画面側は `game/net-client.js` の `bossEv` / `cast` / `castP` / `castEnd` / `mark` / `judge` と、`ui/panels/hud.js` のボスの欄。
  - `sim.js` から `boss-brains.js` と `bosses/*.js` を直接 import しておく（下の「sim の import の深さ」）。
- ボスの技ごとの動き: `public/js/models/bosses/<名前>-motion.js` にキーフレームを書き、`boss-models.js` の外観に `motions` として登録する。
  - キーは `'部位.rotation.x'` などの値と、武器の向き `'aim.pitch'` / `'aim.yaw'`。技名はサーバーの `bossAct` の `p`（詠唱は `cast`）。
  - 再生は `models/boss-motion.js`（どのボスでも共通）。サーバーの予兆の発動時刻に振り下ろしが合うように時刻を書く。
  - 配列の部位は `'arms.0.rotation.x'` のように番号で書く。`hold: true` は最後の姿勢のまま取り消されるまで続く（吸い上げの構え）。
- ボスの手下: `data.js` のボスに `minions: [{ t, name, color, link?, scale? }]` を書き、`spawnMob(A, -1 - 番号, ...)` で出す
  （敵の番号が負の数＝手下。`mobDef` が引き分ける）。見た目は `MOB_MODELS[t]`、動き方は `sim/common.js` の `ARCH[t]`。
- ボス部屋の形: `areas.js` の迷宮区のマップの先頭（`ARENA` / `ARENA_CROSS`）。ボスごとに別の形にできる。
- プレイヤーからのメッセージ: `public/shared/sim/messages.js` の `MESSAGES[t]` に関数を足す。
  - 送る側は `net.send({ t, ... })`。

### 飛び道具の形を足す

- `public/js/game/meshes.js` の `PROJ_SHAPES[形]` に { make, wave, tick } を足し、スキルや効果で `strikes.proj({ shape: '形', ... })` と書く。

### エリアの飾り・障害物を足す

- 飾り: `public/js/env/props.js` の `PROPS[種類]` に関数を足す。
  - エリア定義（`shared/areas.js`）の props に名前を書く。
- 障害物: `public/js/env/obstacles.js` の `OBSTACLES[種類]` に関数を足す。
  - 当たり判定の形は `shared/areas.js` の obstaclesOf が決める。

### 画面（パネル）を足す

1. `public/js/ui/panels/<名前>.js` に `export function install<名前>(ui)` を書く。
   - `ui` から部品（View）を受け取り、`P.<名前> = () => {...}` で描画を足す。
2. `ui/app.js` で部品を作り、install を呼び、Mediator の状態（`mediator.states`）に足す。

## テスト

| コマンド | 中身 |
|---|---|
| `npm test` | node のテスト。`test/golden-*.test.js` を含む |
| `npm run test:golden` | ブラウザ（Playwright）のテスト。戦闘・画面・描画 |

`npm test` の golden（`test/fixtures` に期待値）:

- golden-sim: サーバーの決まった流れ。
- golden-skills: スキルの結果。
- golden-poses: 姿勢。
- golden-models: モデルの形。

`npm run test:golden` の内訳:

- `e2e/combat.golden.e2e.mjs`
  - 時計を固定したブラウザで、全武器・全クラス・全マスター・全スキルの258場面を動かす。
  - 送ったメッセージと状態が記録どおりか確かめる。
- `e2e/app.golden.e2e.mjs`: セーブ・画面・町からスキルまで。
- `e2e/render`: 描画。

時計を固定する仕組みは `e2e/lib/harness.mjs` にある。

- `performance.now`・`Date.now`・タイマー・`requestAnimationFrame` を固定する。
- `Math.random` はブラウザ側が 0.5、World の中は決まった種の乱数。

性能は `node e2e/perf.mjs` で測る（1フレームの更新・描画の時間と FPS）。リファクタリング前の値は `e2e/fixtures/perf-before.json`。

分けるときは、golden テストのほかに、分ける前と後を同じ入力で動かして結果を比べた（一時的なスクリプト。リポジトリには入れていない）。

- サーバー: ボスの全技 × 3層 × 3段階、敵の全種類 × 精鋭、全メッセージ。
- 画面: 全パネル・全タブ（鍛冶屋・ボックス・会話・転移門を含む）の DOM。
- エリア: 全エリア × 天候 × 草の量の形・色・位置・高さ。
