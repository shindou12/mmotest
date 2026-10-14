# 浮遊城エテルナ — コードの構成

武器・クラス・形違い（バリエーション）・モデル・モーションを「データを書いて登録する」だけで
足せるように分けてある。ここでは、どこに何があるか（モジュール図）と、足し方を書く。

## 全体の図

```
server.js ──────────────► public/shared/sim.js（World: サーバーのシミュレーション）
                               │
public/shared/ ─ data.js（武器種・装備・敵・称号の表）/ balance.js / areas.js
   （サーバーとブラウザの共通） techniques.js / tree-motions.js（技の時刻とモーション）
                               skill-timings.js / motion-catalog.js

public/js/main.js（ログイン・ゲームの API・window.__game）
   │
   ├─ game/            ゲーム本体（1ファイル1つの役目）
   │   ├─ state.js        自分・他人・敵などの状態（入れ物）
   │   ├─ util.js         rnd / now / angDiff など
   │   ├─ ui-bridge.js    画面（ui/app.js）への窓口（DOM にはさわらない）
   │   ├─ render.js       three.js のシーン・カメラ・fx・audio
   │   ├─ save.js         セーブ（キャラクターの保存と読み込み）
   │   ├─ stats.js        能力値の計算（S）・バフ
   │   ├─ input.js        キーボード・マウス・タッチ
   │   ├─ net-client.js   サーバーとのやりとり
   │   ├─ area.js / snapshot.js   エリアの入れ替え・サーバーの状態の反映
   │   ├─ combat.js       ダメージ計算・命中
   │   ├─ hurt.js         被弾・ガード・回避・ダウン
   │   ├─ actions.js      攻撃・強攻撃・スキル・飛び道具（combat 文脈 = スキルに渡す道具）
   │   ├─ tree-effects.js 武器ツリーの共通部分（バフ・クールタイム・旧データの移し替え）
   │   ├─ variants.js     スキルの形違い
   │   ├─ progress.js / loot.js / items.js / labels.js
   │   ├─ loop.js         毎フレームの更新
   │   ├─ weapon-fx.js    ★ 武器ごとの効果の差し込み口（フック）
   │   └─ weapons/<武器>.js ★ 武器ツリーの効果（フックの登録）。index.js で読み込む
   │
   ├─ weapon-tree.js   武器ツリーの仕組み（熟練度・振り分け・効果のまとめ）
   ├─ weapons/<武器>.js ★ 武器ツリーのデータ（段・ノード）・スキル・能力値。index.js が登録表
   ├─ skills.js / advanced-skills.js   Q/E スキルの動き
   │
   ├─ models.js        モデルの組み立て（プレイヤー・武器・防具・敵・落とし物）
   ├─ models/
   │   ├─ kit.js          ★ 形の道具（mesh・sphere・extrude・finish・bowString など）
   │   ├─ weapon-models.js ★ 武器の形の登録表（kind → base と styles）
   │   ├─ armor-looks.js  ★ 防具の見た目の登録表（look → 関数）
   │   └─ mob-models.js   ★ 敵の形の登録表（t → 関数。知らない t は knight）
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
   │   └─ bow.js / spear.js / melee.js   武器ごとの動きの関数
   │
   ├─ toon.js / fx.js / env.js / audio.js   見た目・効果・地形・音
   └─ ui/app.js, ui/core.js                 画面
```

依存の向き: `ui` → `game` へは `ui-bridge.js` だけを通す。`game/*` の中心の処理（combat・hurt・stats・
actions・loop など）は、武器の名前やノードの id を知らず、`weapon-fx.js` のフックを呼ぶだけ。
武器ごとの中身は `game/weapons/<武器>.js` に閉じている。

## 武器ごとの効果（フック）の仕組み

`game/weapon-fx.js`:

- `registerWeaponFx(wk, { フック名: 関数 })` で登録する。
- 呼ぶ側の使い分けは次のとおり。
  - `fxCall(名前, ...)` は全部を呼ぶ。
  - `fxSome(名前, ...)` はどれかが true を返したら止める（横取り）。
  - `fxReduce(名前, 値, ...)` は値を順に変える（倍率・加算）。
- 全武器のフックを呼び、各フックは自分のクラス・ノードが有効なときだけ働く。持ち替えた直後に残るバフや設置物も、これでそのまま働く。
- 呼ぶ順は登録した順が基本。もとの計算順（掛け算の順で小数の端数が変わるもの）を保つために、`ORDER` で武器の順を決めている場面がある。

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

正確な一覧と引数は `game/weapons/*.js` の実装と、呼んでいる側（`grep -n "fx\(Call\|Some\|Reduce\)" public/js/game`）を見る。

## 足し方

### 武器の種類を足す

1. `public/shared/data.js` の `WEAPONS` に1項目足す。
   - 項目: 名前・射程・速さ・重さ・`melee` / `ranged` / `twoHanded` など。
   - サーバーとブラウザの両方が使う。
2. `public/js/weapons/<wk>.js` を作る。`export default { wk, tree, skills, mods, legacy? }` の形にする。
   - `tree`: 段とノード。
   - `skills`: ツリーの Q/E スキル。
   - `mods(st, br, mods)`: ツリーが足す能力値。
   - `public/js/weapons/index.js` の `WEAPON_DEFS` に1行足す。並び順がツリー画面の順になる。
3. `public/js/game/weapons/<wk>.js` を作る。`registerWeaponFx('<wk>', { ... })` で効果を登録する。
   - スキルに渡す道具（`combat` 文脈）を足すときは `Object.assign(combat, { ... })`。
   - `public/js/game/weapons/index.js` に `import './<wk>.js';` を1行足す。
4. 形: `public/js/models/weapon-models.js` の `WEAPON_MODELS` に `<wk>: { base(k) {...}, styles: {...} }` を足す。
   - 持つ位置は `pose-rig.js` の `GRIP_Y` に足す。
5. 動き: 近接武器なら何もしなくてよい（`motions/melee.js` の動きになる）。
   - 独自の構えにするときは `motions/<wk>.js` に `pose` / `swing` / `technique` を書いて、`motions/index.js` の `WEAPON_MOTIONS` に登録する。
6. 初期スキル（Q/E）は `public/js/skills.js` と `shared/data.js` の `WEAPON_SKILL_POOL` に足す。

### クラス・マスター・パッシブ（武器ツリーのノード）を足す

1. `public/js/weapons/<wk>.js` の `tree.rows` にノードを足す（id は `<略号>_<名前>`）。
   - 能力値だけのパッシブは、ノードに `mods: [lv1, lv2]` を書けば済む。
   - lv3 の分岐（A/B）で能力値が変わるときは、そのファイルの `mods()` に書く。
2. 動きのある効果は `public/js/game/weapons/<wk>.js` のフックに書く。
   - クラスは `W.ks1 === 'id'`、マスターは `W.ks2 === 'id'`、パッシブは `W.lv('id')` / `W.br('id') === 'A'` で判定する。
   - 新しい場面が必要なら、呼ぶ側に `fxCall('名前', ...)` を1か所足す（`weapon-fx.js` の説明を参照）。
3. 技のモーションが要るなら `public/shared/tree-motions.js` に時刻（hits・duration・style）を足し、姿勢を `motions/styles.js` に足す。

### スキルの形違い（バリエーション）を足す

- `public/js/game/variants.js` と `shared/data.js` の `SKILL_VARIANTS` に足す。

### モデルを足す・差し替える

- 武器の形: `models/weapon-models.js` の `WEAPON_MODELS[kind]`。
  - `base(k)` が基本の形（style 0）。
  - `styles[1|2|3](k)` が形違い（3 は伝説・神器の専用形）。
  - 形違いの前に共通の道具を作るときは `prep(k)` を書く。
  - `k` には材質と道具が入る（`g`・`steel`・`gold`・`grip`・`gem`・`edge`・`handle`・`blade`・`glowM` など）。
- 防具の見た目: `models/armor-looks.js` の `ARMOR_LOOKS[look](k)`。
  - 名前は `models.js` の `ARMOR_LOOK_NAMES` に足す。
- 敵の形: `models/mob-models.js` の `MOB_MODELS[t](k)`。
  - 動かす部位は `k.parts` に入れる（動きは `animateMob`）。
- 形の道具（`mesh`・`sphere`・`capsule`・`cone`・`cyl`・`lathe`・`extrude`・`finish`・`bowString`）は `models/kit.js`。

### モーションを足す・編集する

- 技の時刻（いつ当たるか）: `public/shared/techniques.js`（Q/E 技）と `public/shared/tree-motions.js`（武器ツリー）。
  - `hits`・`duration`・`style` を書く。
  - サーバーと同じ時刻を使う。
- 技の姿勢: `public/js/motions/styles.js`。
  - `STYLES[style] = (i, sign) => [振りかぶり, 当たり]` と書くと、hits の各時刻でこの2つの姿勢を通る。
  - 時刻を自分で並べたいときは `KEYFRAMES[style] = [{ at, ...つまみ }]`。
  - 一回転で終わる動きは `FULL_TURN` に足す。
  - つまみ（yaw・pitch・bodyYaw・lean・x・y・z・guard・lift・leg・draw）は `BASE` に並んでいる。
- 武器ごとの構え・通常攻撃の振り: `motions/<武器>.js` と、その登録表 `motions/index.js`。
- 盾槍の連続した姿勢は `spear-motion.js`（時刻は `shared/skill-timings.js`）。

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

性能は `node e2e/perf.mjs` で測る（1フレームの更新・描画の時間）。リファクタリング前の値は `e2e/fixtures/perf-before.json`。
