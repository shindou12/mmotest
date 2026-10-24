# 戦闘・武器の棚卸し（ブラウザ版 → Godot 版）

調べた日: 2026-10-21 / 読むだけ（リポジトリは変更していない）。凡例: 済み = Godot に同じ式がある / 代用 = 別の武器の形で動く・簡略 / 未 = 無い。

## 0. 全体像（まず結論）

- Godot の戦闘は `godot/worldart/scripts/game/combat.gd`（158 行）と `game.gd` の `_do_swing`・`_strike_arc`・`_deal_damage`・`_try_dodge`・`_take_damage`（702 行中の一部）だけ。**片手剣の通常 3 段・溜め斬り・武器スキル 5 種・飛ぶ斬撃・踏み込み・回避・回復薬・予告の被弾・這いずり/復活**まで（`docs/godot/migration.md` CP2/CP5）。
- ほかの 5 武器は「ステータス（range/arc/speed/mult/stun）で通常攻撃だけ」動き、**強攻撃と武器スキルは片手剣のもの（`combat.gd` の `WEAPON_SKILLS`・`do_heavy`）に代用**される。`game.gd` の `_do_swing` は `W.ranged`（弓）を見ないので、弓も近接の扇形で代用される。
- 武器ツリー・Q/E スキル・ガード・のけぞり/ダウン・バフ・称号・スキル変化・弾（飛び道具）・状態異常は**全部 未**。
- ブラウザ側の設計は「中心の処理 + 武器ごとのフック（`public/js/game/weapon-fx.js` の `fxCall/fxSome/fxReduce`）」。武器ファイルは `public/js/weapons/<武器>.js` 1 つに、ツリー・Q/E・強攻撃・武器スキル・効果が全部入っている。GDScript でもこの形（武器ごとのスクリプト + 登録表 + フック表）を写すのが一番自然。
- 数値の置き場所: 武器の stats は `public/shared/data.js` の `WEAPONS`（実体は各武器ファイルの `stats`）。`data/game.json` に書き出し済み（`export_gamedata.mjs`）。**ツリー・Q/E の数値は書き出されていない**（`WTREES`・`TECHNIQUES`・`TREE_MOTIONS` が JS の中にある）。→ 移植するなら先にこれらを JSON に書き出す道具が要る。

## 1. 武器ごとの一覧

### 1-0. 全武器に共通する形（ここは一度だけ移せば 6 武器すべてに効く）
- 通常攻撃 3 段: `public/js/game/actions.js: doSwing`。`combo=(combo+1)%3`（`lastSwing` から `speed*2.2` 秒以内）、倍率 `W.mult*[1,1.1,1.6][combo]`、3 段目だけ振りが 1.25 倍長い、当たりは 0.06 秒後の `strikes.arc`。Godot `_do_swing` は同じ。ただし欠けているもの: 攻撃速度の上乗せ（`stats.S.aspd`＋バフ＋短剣の連撃 dStack＋称号＋捨て身）、`atkBonus`（盾槍のガード後ボーナス）、`fxReduce('reach')`、`swingExtra/swingLate/swingLast` フック、3 段目の `wave` 固有効果、弓の `shoot`。
- 強攻撃: 左長押し→離す（`input.js: pointerUp`、`CHARGE_MIN=0.22`、`chargeMax` は武器ツリーで変わる、`actions.js: doHeavy`）→ `HEAVY[wk].run(c, lv)`（lv1/lv2 = 溜め段階）。Godot は `combat.gd: do_heavy` が片手剣固定。
- 武器スキル（右クリック）: `actions.js: tryWeaponSkill` → `startSkill` → `skills.js` の `WEAPON_SKILLS[id].run`。cd は `sk.cd*(1-cdr/100)*sv.cd*称号`。Godot は片手剣 5 種のみ。`SKILL_CD_MULT=1.2`（`skills.js:161`）が全スキルの cd に掛かる点に注意（Godot の `combat.gd` の cd は 7/5/6/6/5 で、JS の `sword.js` は未乗算の 7/5/6/6/5。`skills.js` 側で ×1.2 されるので **Godot の cd は 1.2 倍が抜けている疑い**。要確認）。
- Q/E スキル: `actions.js: tryTreeSkill(i)` → `state.char.slots[i]` → `TREE_SKILLS[id]`（武器ツリーの skill ノード。`weapon-tree.js: WT_SKILLS`）。`tcd[id]` が個別のクールタイム。
- 武器ツリーの形（6 武器とも同じ 18 ノード）: 行 `skill`×3（Q/E 候補）→ `passive`×3 → `ks1`×3（クラス）→ `passive`×3 → `skill`×3 → `ks2`×6（マスター、クラスごとに 2）。skill/passive は lv1〜3 + lv3 で A/B 分岐。熟練度で獲得（`weapon-tree.js` `ROW_REQ=[1,3,6,9,12,16]`、`PROF_MAX=20`、`gainProf`）。
- 状態: Godot に武器ツリーは無い。熟練度も未。

### 1-1. 片手剣（`public/js/weapons/sword.js` 541 行）
| 行為 | ソース | Godot |
|---|---|---|
| 通常 3 段（range 2.8 / arc 110 / speed 0.4 / mult 1.0） | `stats` + `actions.js: doSwing` | 済み（ガード・フック除く） |
| 強攻撃「溜め斬り」lv1:2.2倍/lv2:3.4倍 + 斬撃波 1.6倍（210°, 3.8m） | `sword.js: heavy.run` | 済み（`combat.gd: do_heavy`）。`strikes.proj` の半径は 1.8 固定で一致 |
| 武器スキル 5 種 retreat/vorpal/square/leap/horizon | `sword.js: weaponSkills` | 済み（`combat.gd _ws_*`）。効果音・粒子は省略 |
| Q/E: 空裂斬 sw_aircut / 受け流し sw_parry / スラントラッシュ sw_slant / 霞返し sw_side / 連撃の構え sw_dance / ブレイブハート sw_brave（各 A/B 形、`sword.js` `skills` 59〜135 行。基本は `techniques.js` の hits と対応） | `sword.js: skills` | 未 |
| パッシブ: 剣の心得 sw_norm / 軽身 sw_light / 技の巡り sw_cycle / 剣の冴え sw_edge / 不撓 sw_tough（+ `mods()`）| `weapon-tree.js: wtEffects` + `sword.js` mods | 未 |
| クラス: 魔剣士 sw_mage / 剣闘士 sw_glad（勢い mom）/ 守護騎士 sw_guard（剣のガード）| `sword.js: effects` 347〜541 | 未 |
| マスター: 天剣 sw_heaven / 幻剣 sw_phantom（`phantomReady`）/ 剣聖 sw_saint / 狂剣士 sw_berserk / 聖騎士 sw_paladin / 報復者 sw_avenger | 同上 | 未 |
| ガード（守護騎士のみ）: 溜め中に構え、`GUARD_BY.sword`（max 65, cut 0.4）、ガードカウンター=踏み込みの横斬り | `input.js: startGuard/endGuard`、`hurt.js: resolveTele`、`sword.js` `onGuard` | 未 |
| 受け流し（Q の sword_parry / 0.4 秒 dr 70 + 突き 2.2倍） | `sword.js: skills.sw_parry`、`parry()` フック | 未 |

### 1-2. 大剣（`public/js/weapons/greatsword.js` 403 行）— 最近の変更あり
stats: `range 3.4, arc 160, speed 0.66, mult 1.6, weight 9, stun 1.5, twoHanded, skillSpin`。skillPool = cyclone/breaker/avalanche/meteor。

| 行為 | ソース | Godot |
|---|---|---|
| 通常 3 段（speed 0.66 で遅い・mult 1.6） | stats + `doSwing` | 代用（数値は stats から動く。モーションなし） |
| **強攻撃「兜割り」**: 前方 `fwd(a,2.6)` を中心に円 `r = lv2?3.8:3.0`、倍率 `lv2?4.6:3.0`、0.12 秒後に判定。**縦の射程 `reach=0.8`**（コミット 6dd1d84）: `strikes.circle` が `o.reach` を受け、円を `o.a` 方向へ 0 〜 reach だけ引き伸ばす（`actions.js:63-66` `dist = hypot(d - f*clamp(d·f, 0, reach))`、横幅は r のまま）。衝撃の見た目は伸ばした当たりの真ん中 `cx = x + fwd(a, reach/2)`。固有効果 `quake` で 0.15 秒後に半径 6.5・1.5 倍の追撃 | `greatsword.js: heavy.run` | **代用**（片手剣の 210° 扇形になる）。`combat.gd: circle` に reach 引数が無い → 追加が必要 |
| **溜めモーション**（コミット 6dd1d84 / 20ee312）: 溜め中は頭の後ろへ振りかぶり（`windup(c)`: y 1.60→1.76, pitch 1.75→2.65, 上体 lean -0.06→-0.26, twist 0→-0.5, 足 stance 0→1）。溜めの前半 6 割で振りかぶりきる（`ease(min(1, charge/.6))`）、溜めきりで 45 rad/s ±0.02 の震え。強攻撃の振り（`me.heavySwing`）は k<0.06 保持→0.06〜0.28 で STRIKE へ→0.62 まで保持→構えへ。**当たりは 0.12 秒 = k 0.24**（`swingDur 0.5`） | `greatsword.js: motion`（`pose`）、`actions.js: startAttack/doHeavy`（`heavySwing=true`）、`loop.js`（`charging`/`charge` を animatePlayer へ渡す） | 未（Godot は部品ごとの動きが未。`state.me.heavySwing` の状態も無い） |
| 武器スキル 4 種: cyclone（3 回転 0.9倍 360°, 4.6m, 0.1+0.15i 秒）/ breaker（6 連の円 1.9m, 1.25倍, 間隔 1.7）/ avalanche（7m 踏み込み 0.3 秒 + 3.8m 円 3.2倍 stun12）/ meteor（3,5.5,8m の円 2.6m, 1.8倍）| `greatsword.js: weaponSkills` | 未（Godot は片手剣の 5 種だけ。`cyclone` などの id が来ると `WEAPON_SKILLS.has` で retreat に戻る） |
| Q/E 6 種: 払い上げ gt_rising / 横一文字 gt_broad / 退き兜割り gt_recoil / 断頭落とし gt_guillo / グランド・スラム gt_slam / 破城の構え gt_siege（A/B 各、`skills` 59〜134 行、タイミングは `techniques.js` `gs_*` の hits と `tree-motions.js`） | `greatsword.js: skills` | 未 |
| パッシブ 6: 溜めの心得 gt_charge（heavyp, A:溜め -20%, B:最大溜め範囲 +20%※）/ 剛体 gt_armor（スーパーアーマー・溜め中 dr）/ 月の残滓 gt_moon / 崩しの極意 gt_break（stunp）/ 見切り眼 gt_eye | `greatsword.js` tree + effects | 未（※B の「範囲 +20%」は `heavy.run` に実装が見当たらない=説明だけの可能性） |
| クラス: 光波 gt_wave（強攻撃で光波。lv1 1.0倍/lv2 2.0倍、剣そのもの -15%）/ 一撃 gt_blow（最大溜め +40%、溜め中 dr -30%、溜め +25% 長い）/ カウンター gt_counter（押した直後 0.35 秒に被弾→無傷で受け流し 3.5 倍、`parryReadyT` 1.5 秒の間）| `effects`: `heavy`・`dmgMult`・`counter`・`dr`・`stats` | 未 |
| マスター: 満月 gt_fullmoon（×1.75）/ 月蝕 gt_eclipse（光波が当たった所で爆発 1.5 倍）/ 断罪 gt_judge（最大溜め会心 +35）/ 不屈 gt_unyield（被弾で溜め最大）/ 居合 gt_iai / 明鏡 gt_mirror | `effects` | 未 |
| 溜め中の特殊処理: `superArmor`（ひるまない）・`noKnockdown`・`onHurtCharging`・`primeCharge`・`iaiReady`・`eyeCharge` | `effects` + `tree-effects.js: wtChargeStart` + `hurt.js: hitReaction/wtOnHurt` | 未 |
| 大剣の受け流し（カウンター）が敵の弾を消す | `actions.js: updateBossProjs` の `fxSome('counter', p)`、`hurt.js: resolveTele` | 未 |

メモ（Godot へ持っていく大剣の肝）: ①`reach` 付きの円判定 ②溜め中の被弾処理（スーパーアーマー・カウンター）が `hurt.js` のフック順に依存（`wtOnHurt`: `onHurtFirst`→`parry`→`onHurtCharging`→`onHurt`）③ `heavyLv` の「最大溜め」判定は `lastHeavyLv===2 && now-lastHeavyT<0.8`（`maxHeavy`）。

### 1-3. 短剣（`dagger.js` 374 行）
stats: `range 2.3, arc 90, speed 0.26, mult 0.68, weight 2, stun 0.6`。skillPool: shadow/phantom/fan/venom。

| 行為 | ソース | Godot |
|---|---|---|
| 通常 3 段（速い） | stats + `doSwing` | 代用（連撃 dStack の攻撃速度が無い） |
| 連撃 dStack: 当てるたび +1（最大 10、3 秒）→ 攻撃速度 | `stats.js dStackPer/Max/T`、`combat.js dealDamage`、`actions.js doSwing`、`dagger.js stats()` | 未 |
| 強攻撃「瞬影」: 6/7.5m（lv2）を 0.18 秒で踏み込み + 通り道の線 1.8/2.8倍。**溜めきった時だけ**出る（途中で離すと通常攻撃: `heavyNeedsFull`→`input.js:` `queued`） | `dagger.js: heavy` | 未（片手剣の溜め斬りで代用）|
| 武器スキル: shadow 5 連 / phantom（最寄りの背後へ瞬間移動 + 必ず会心 3.5倍）/ fan（7 本の投げナイフ=`strikes.arrow`）/ venom（毒刃バフ + 3 連）| `dagger.js: weaponSkills` | 未 |
| Q/E: 抜け駆け dk_flank / 急所穿ち dk_vital / 裂傷連舞 dk_bleed / ポイズン・エッジ dk_poison / スモーク・ステップ dk_smoke / 影縫い dk_pin | `dagger.js: skills` | 未 |
| パッシブ: 連撃の心得 dk_combo / 身軽 dk_agile / 急所の心得 dk_vitalp / 毒の心得 dk_toxin / 影歩き dk_shadow | 同 | 未 |
| クラス: 毒刃 dk_venom（毒の重ね 最大 5）/ 暗殺 dk_assassin（背後=必ず会心 `critAfter`+`wtBehind`）/ 連刃 dk_blades | `effects` | 未 |
| マスター: 猛毒 dk_burst / 蝕み dk_spread / 影渡り dk_step / 必殺 dk_exec（`finisher`）/ 千本 dk_thousand / 疾風 dk_gale | `effects` | 未 |
| 状態異常: 毒（`mb.poisonUntil/poisonT/vStack`, 0.5 秒刻み dot）・出血（`bleedUntil/bleedPow/bleedN`）・足止め（slow）。dot は `dealDamage` を `type:'dot'` で呼ぶ | `loop.js:244-252`、`dagger.js` `addPoison/addBleed` | 未 |

### 1-4. 盾槍（`spear.js` 480 行）
stats: `range 4.3, arc 45, speed 0.5, mult 1.1, weight 8, guard:true, stun 1.3, shield 'kite', threat 2`。skillPool: lance/helix/piercer/whirlspear。動きの時刻は `public/shared/skill-timings.js: SPEAR_TIMINGS`（lance, helix, piercer, javelin, whirlspear, whirl, heavy, counter）。

| 行為 | ソース | Godot |
|---|---|---|
| 通常（細い 45° 扇、range 4.3、先端 tip 判定は 間合い ks1） | stats + `hitOpts/reach` | 代用（扇形のまま） |
| **ガード**: 強攻撃の溜め中（chargeT ≥ 0.22）に自動で構える。`GUARD_BY.spear {max 100, cut .25, regenDelay 1.6, regen 20, up .06, lock .3, ctrLock .7}`、`GUARD={max 100, perHp 120, kdExtra 20, breakT 1.5, breakDmg 1.5}`。正面 ±80° の被弾・弾を軽減、ガードゲージ `gg`、尽きるとガードブレイク（`staggerT 1.5`、`brokenT` 中は被ダメ 1.5倍）。歩行速度 ×0.45 | `input.js`（GUARD*, guardDamage/guardBreak/guardRegen/armCounter/endGuard）、`loop.js:172,182`、`hurt.js: resolveTele`（ガード分岐）、`actions.js: updateBossProjs` | 未 |
| ガードカウンター（ガード中に被弾→離す）: その場で一回転なぎ払い（`SWEEP`: r 5.2, mult 7.5, stun 14, wind .45 → slash .32 → rest .18, 当たりは `wind+slash*.5`）。`sweepT` 中は動けない | `actions.js: SWEEP/sweepTick`、`input.js: endGuard` → `doHeavy`の`counterFire` | 未 |
| 強攻撃「溜め突き」: 3m 踏み込み 0.12 秒、線 6.5/8m × 幅 2.0、2.4/3.8倍、`reach(false)` 倍 | `spear.js: heavy` | 未（代用） |
| 武器スキル: lance（線 12m・3.0倍）/ helix（5 連突き 0.8…最後 1.8倍）/ piercer（8m 突進 + 線 2.6倍 threat 3）/ whirlspear（`taunt(9)` + 3 回の円 1.0倍）| `spear.js: weaponSkills` | 未 |
| 挑発・ヘイト: `o.threat` で `{t:'threat'}`、`party.taunt` で `{t:'taunt', r}`、被弾で `{t:'absorb'}`、弾を消して `{t:'pblock'}` | `combat.js:dealDamage`、`actions.js`、サーバー `sim/messages.js`（absorb/pblock/threat/taunt）| 未（`absorb` だけ Godot 送信あり: `game.gd:281`） |
| Q/E: 扇突き sp_fan / 足払い sp_sweep（slow）/ シールドバッシュ sp_bash / 杭打ち sp_stake（`c.point()` 地点）/ 迎撃の構え sp_intercept（dr 35 + taunt）/ 挑発 sp_taunt | `spear.js: skills` | 未 |
| パッシブ: 鉄壁の心得 sp_iron / 盾の心得 sp_shield / 槍の心得 sp_spear / 崩しの心得 sp_brk / 反撃の心得 sp_ctr | 同 | 未 |
| クラス: 竜騎士 sp_dragoon（盾を背負い、跳躍 `heavyOverride`）/ 間合い sp_reach / 騎士 sp_knight | `effects` | 未 |
| マスター: 竜の牙 / 竜翔 / 一点突破 / 間合い支配 / 旗手（`bannerMesh`、地面の旗）/ 雷槍 | 同 | 未 |

### 1-5. 大斧（`axe.js` 387 行）
stats: `range 3.2, arc 140, speed 0.74, mult 1.8, weight 11, stun 1.7`。skillPool: rampage/tomahawk/earthsplit/bloodaxe。
| 行為 | ソース | Godot |
|---|---|---|
| 通常（遅くて重い） | stats | 代用 |
| 強攻撃「大地砕き」: 円（前 2.4m）r 2.8/3.4、3.2/5.0倍、stun 10/16、0.16 秒 | `axe.js: heavy` | 未（代用） |
| 武器スキル: rampage（3 回前進斬り stun6）/ tomahawk（`strikes.proj` 2.8倍 速さ26）/ earthsplit（5 連の円）/ bloodaxe（HP の 8% を削って 5.0倍 stun14）| `axe.js: weaponSkills` | 未 |
| Q/E: 引き裂き ax_hook（pull）/ 返り刃 ax_return（ブーメラン `boomerang`、`actions.js: boomerangStep`）/ ウォーストンプ ax_stomp / 処刑斬 ax_exec / ブラッドラスト ax_lust（バフ）/ 猛進断 ax_rush | `axe.js: skills` | 未 |
| パッシブ: 剛力 ax_heavy / 血の心得 ax_blood / 斧の心得 ax_swing（reach 1.2）/ 崩し ax_brk / 怒り ax_rage | 同 | 未 |
| クラス: 狂戦士 ax_berserk（`axBers()`: 減ったHP10%ごとに速さ・ダメージ +3%）/ 破砕 ax_crush / 投斧 ax_throw（強攻撃が斧を投げる=boomerang）| `effects` | 未 |
| マスター: 不死身（`cheatDeath`）/ 捨て身（`incoming` 1.25倍）/ 地砕き / 砕骨 / 旋風 / 受け止め | 同 | 未 |

### 1-6. 弓（`bow.js` 435 行）
stats: `range 22(最大射程), baseRange 9, draw 14(m/秒), speed 0.4, mult 0.6, ranged, offHand, stun 0.3`。skillPool: multishot/arrowrain/snipe/blast。
| 行為 | ソース | Godot |
|---|---|---|
| 通常: 矢（`strikes.arrow`、速さ 42、射程 = 引かない時 `bowBase`=9m）。連射 bw_rapid は 2 本（`shoot` フック）| `actions.js: doSwing`(`W.ranged`)、`strikes.arrow`、`updateProjs` の arrow 分岐 | **未**（Godot は近接扇形のまま。`W.range=22` の扇形になり、かなり不正確） |
| **弓を引く円**: 足元に射程の円が広がる。`bowRange() = min(bowMax, bowBase + bowDraw*chargeT)`（溜めていなければ bowBase）、満タンで金色。照準線も溜めに応じて伸びる | `stats.js: bowRange`、`loop.js:35-56`（`bowGuide`）、`meshes.js` | 未 |
| 強攻撃「溜め撃ち」: 貫通矢 lv1 1.6倍 / lv2 2.6倍（full=true）、速さ 55、太さ 0.8/1.2、射程=離した時の円 | `bow.js: heavy` | 未 |
| 武器スキル: multishot（5 本扇 0.75倍）/ arrowrain（`c.point()` に 8 回の円 0.42倍）/ snipe（0.3 秒溜めて貫通 3.0倍 速さ 75）/ blast（地点で爆発 2.2倍 stun3）| `bow.js: weaponSkills` | 未 |
| Q/E: 二段射ち / 足留め矢 / バックショット（後ろへ跳ぶ）/ 置き矢（罠 `trapMesh`）/ 弦鳴り / 跳弦射撃 | `bow.js: skills` | 未 |
| パッシブ: 遠見 bw_zone（`arrowEdge` 遠矢 +20%）/ 弓引き bw_draw（引く速さ・重矢）/ 身のこなし bw_roll / 急所 bw_crit / 矢筒 bw_quiver | 同 | 未 |
| クラス: 狙撃手 bw_sniper / 連射 bw_rapid / 罠師 bw_trapper（回避で罠）。マスター: 鷹の目 / 狙い澄まし / 矢嵐 / 速射 / 射抜き / 罠の名手 | `effects` | 未 |
| 矢の当たり: 円 `rad` + 壁で止まる（`collide`）+ 貫通 `pierce` + `arrowHit` フック。ダメージは矢が当たった時点で `dealDamage` | `actions.js: updateProjs` | 未 |

## 2. 横断システム（Godot の状況）

| システム | ブラウザの元 | Godot |
|---|---|---|
| ダメージ式 | `combat.js: dealDamage`: `atk*(1+atkp)*mult*typeMult*back*stunned1.3*exec*guardBonus*bossT*titleDmg*(1+dmgp)*falloff*rnd(.92,1.08)*(crit?critd/100:1)*wtDmgMult*ambushMult` → round → `finisher`。番兵の盾 `GUARD_ARC=1.0 / GUARD_PASS=0.3` | 一部（`game.gd:_deal_damage` は atk・mult・typeMult・stunned・乱数・crit のみ。back/exec/guardBonus/boss/titles/dmgp/falloff/finisher/番兵の盾が無い） |
| 会心率 | `S.crit + buffMod('crit') + wtCritAdd + 称号` と `critAlways/critAfter`、`ambush` | 一部（`S.crit` のみ） |
| スタン値 | `combat.js: stunValue`（type 別 normal 1.2/heavy 6/wskill 3/tskill 3、`W.stun`、`stunp`、`fxReduce('stun')`、称号 t_breaker ×1.3） | 一部（type 別 × `W.stun` のみ。`stunp`・ツリーなし） |
| 回避 | `actions.js: tryDodge`: 0.38 秒、無敵 0.32+`iframeBonus`（残像 0.6）、`dodgeCd = max(S.dodgeCd, iframe+0.15)`、速さ `17*wc.roll*dodgeDist`、ダウン中は受け身 `tryTech`、`onDodge` フック、称号 t_wind | 一部（0.38 秒・iframe 0.32・cd は済み。`wc.roll`/`dodgeDist`/残像/称号/フックなし） |
| JUST 回避 | `hurt.js: onJustDodge`（予告の判定時に `iframe>0`）: バフ justbuff、`counter`、`mirror`、`fxCall('justDodge')` | 一部（無敵で避けるだけ。`game.gd:278`）|
| 被弾（予告） | `hurt.js: resolveTele`: 正面 ×1.3 / 背後 ×0.7（`t_shell` は割り増しなし）、aegis 25% 無効、ガード分岐、`drs` の最大 + マイナスの合計、`def`、乱数 .9〜1.1 | 一部（正面/背後倍率と def・乱数のみ） |
| のけぞり/ダウン/吹き飛び | `hurt.js: hitReaction`: `REACT = {stagger .1, down .25, downT 1.1, techFrom .1, techTo .8, getupIframe .6, noDown 1.2}`。stagger 0.35 秒 / ダウン（吹き飛び 4m 0.32 秒、`kbScale` 軽装1.3・中1・重0.6）。受け身 `tryTech`。`loop.js:142-170` で移動 | 未 |
| ガード/ガードブレイク | 1-4 参照 | 未 |
| ボスの弾 | `actions.js: spawnBossProj/updateBossProjs`（`BULLET_GAP 0.6`、ガードで `pblock`、回避で JUST、`absorb`）| 未（`migration.md`「ボスの弾と演出」未） |
| バフ | `stats.js: addBuff/buffMod/hasBuff`、`loop.js:108-111`（時間で減る）。キー: atkp, dmgp, dr, move, aspd, crit, vamp, chargeRate, normp, heavyp, stunp… | 未 |
| クールタイム | `me.wsCd`, `me.tcd[id]`, `cdr`（上限 60）、`cooldownDt` フック（ブレイブハート B）、`cutCds`、`SKILL_CD_MULT 1.2`、`variantParams.cd`、`phantomReady` | 一部（`wsCd` と `cdr` のみ） |
| スキルツリー（旧: ステータス/プレイスタイル） | `skills.js: TREES.stat/style`、`treeEffects`、スロット `char.slots`。`ps_after/ps_cry/ps_bsk` は旧アクティブ（`TREE_SKILLS`）。`spTotal(lv)=lv-1` | 未 |
| 武器ツリー | `weapon-tree.js`（熟練度・振り分け・分岐・払い戻し・振り直し）+ `tree-effects.js`（`wt*` の入り口、熟練度の獲得、ノード習得）| 未（セーブ形式・UI も未） |
| 称号 | `data.js: TITLES`（t_boss1…t_lucky など 32 件）、`variants.js: tf/titleDmg/titleMove/titleAspd/desperate`、`hurt.js`・`combat.js`・`actions.js` に分散した `rules.tf('t_*')` | 未（`items.gd` に装備枠なし。`rules.gd` 冒頭に「称号」未と明記） |
| スキル変化 sv | `variants.js`（176 行）: sv_twin/giant/rapid/heavy/storm/quake…、`variantCtx`、`castWeaponSkill`、`onVariantHit` | 未 |
| 固有効果 fx | `UNIQUE_FX`（`data.js:291`）、`fxs`（thunder, flame, wave, aegis, skillcrit, mirror, star, vamp, quake…）| 未 |
| 倒れた仲間を起こす攻撃 | `hurt.js: reviveHit`（固定 `REVIVE.flat` + `stunValue`、上限 `perHit`）、`strikes.arc/line/circle` と `projRevive` から呼ぶ。送信 `{t:'rev', id, v}` | 未（自分が起こされる側は済み: `_revived`）|
| HP 吸収・不屈・不死鳥 | `combat.js`（`lifestealGap/Efficiency`）、`hurt.js: takeDamage`（laststand 90 秒、`cheatDeath`）、`fall`（t_phoenix 300 秒）| 未 |
| 這いずり・復活・力尽きる | `hurt.js: fall/revived/die/crawlTick`、`REVIVE` | 済み（`game.gd: _fall/_revived/_die`。`downs` 倍率の使われ方は要照合） |
| 回復薬・経験値 | `actions.js: usePotion/gainXp`、`BALANCE.potionHeal` | 済み（`game.gd: _use_potion/_gain_xp`。`t_spore`、熟練度 `gainWeaponProf` は未） |
| ヒットストップ・画面揺れ | `rules.hitStop`, `hurt.js: hitStop`, `combat.js: addShake` | 未（見た目の領域） |

## 3. 黄金テスト（golden）で確かめられる数値

どの記録も**ハッシュが主**で、そのままでは GDScript と値を突き合わせられない。比べるには「元の JS から生の値を書き出す道具」を足して、GDScript 側が同じ入力から同じ値を出すかを見る形にする。

| 記録 | 中身 | GDScript との比べ方 |
|---|---|---|
| `e2e/fixtures/combat.json`（94 KB、`e2e/combat.golden.e2e.mjs` + `e2e/lib/combat-scenarios.mjs`） | 全武器のクラス/マスター/Q/E スキル（lv1・A・B）/パッシブ（lv2・A・B）の 1 場面ずつ（約 330 場面）。各場面の `hits`（= `[dmg, crit, st, tech]` の列）・`types`（送ったメッセージの種類と数）に、`hash/log/state/mobs` の SHA-256。**生の値が残るのは `hits` と `types` だけ**。時計と乱数を固定したブラウザで、敵 1 体の 2.5m 手前から「通常×3→強攻撃 1.5 秒→武器スキル→回避→通常→待つ」または「Q×2」を実行。ダメージ（`hits[i][0]`）は乱数固定なので再現できる。`GOLDEN_DUMP=<dir>` を付けると全メッセージ（`log`）を JSON で書き出せる | 同じ決まった乱数（`Math.random` の固定列）と同じ敵配置を GDScript に与えて、`net.send` を差し替えた記録器で `hit` メッセージを集め、`hits` と照合。乱数は GDScript の `randf` と別物なので、ダメージ式を「乱数を引数で受ける純関数」にして、JS の固定列と同じ値を渡す（`rnd(0.92,1.08)` 部分）。まず `sword:base`・`greatsword:base`・`*:*_heavy/ws` 系から。`log`/`state` のハッシュは JS の内部状態を含むので GDScript とは比べない |
| `test/fixtures/golden-skills.json`（23 KB、`test/golden-skills.test.js` + `test/golden/skill-trace.mjs`） | 496 項目。`heavy/<wk>/<lv>`・`ws/<id>`・`ts/<id>`・`wt/<node>/<lv><A|B>`・`wtmeta/…`（名前・kind・cd・cdOf・motion・duration）・`eff/<node>/<lv…>`（`wtEffects` の `st/mods/actives/ks1/ks2/lv/br/v`）。値は**ハッシュのみ**。ただし `recorder()` が全部の呼び出し（`arc/line/circle/proj/dash/later/fx.*` と引数、時刻）を `events` に溜めてから `h(events)` している | **最も使いやすい**。`recorder` を使って `events` をそのまま JSON で書き出す版（`h()` を外す）を `tools/` に足し、GDScript の武器スクリプトに同じ形の記録用 `c`（偽の文脈）を渡して `events` を比べる。`later` の秒数・円/扇の `(r, deg, mult, opts)`・`dash` の距離・`proj` の `speed/life/rad/mult` が全部一致するか見られる。乱数は `Math.random=0.5` に固定済み。`wtmeta` は cd/duration の表照合（`MOTION_DURATIONS` が必要）|
| `test/fixtures/golden-sim.json`（サーバー 3 人の決まった流れ） | 段階ごとの受信メッセージの種類と数 + ハッシュ | 戦闘の数値ではなく**プロトコル**。GDScript クライアントが同じ順でメッセージを送り、同じ種類を受け取れるかの確認に使える（`tools/worldart/godot/client_test.sh` と併用） |
| `test/fixtures/golden-poses.json` / `motion-parity.json` / `golden-models.json` | 腕・武器の姿勢、モーション、モデル形状 | 見た目/アニメーション（今回の範囲外）。大剣の溜めモーションの検証はここ（`golden-poses.json` は大剣の姿勢を含む。6dd1d84 で更新）|
| 単体テスト `test/weapon-tree.test.js`（303 行）, `techniques.test.js`, `revive.test.js`, `retreat-skill.test.js`, `weapon-def.test.js` | 熟練度・振り分け・払い戻し、技の時刻、起こす量、リトリートの無敵、`WEAPONS` の stats | 数値と式が読める。熟練度/ツリーの式（`ROW_REQ`, `profNeed`, `WT_RESET_COST`）や `reviveStep` を GDScript に移すときの期待値として流用できる |

数値の純関数として黄金テストにしやすい順:
1. `dealDamage` の式（乱数と crit を引数にする）— `S`（atk, crit, critd, normp/heavyp/wskillp）と `mult` と `mb` から dmg を出す。`hits` の `[dmg, crit]` が根拠。
2. `strikes.arc/line/circle` の当たり判定（`reach` 付き円を含む）— 偽の敵配置で当たる敵 id の集合を比べる。
3. `calcStats`（`rules.gd: calc_stats` は一部済み）— ツリー・称号を足す前に `golden-skills` の `eff/…` の `mods` を取り込む。
4. `stunValue`、`GUARD*` / `REACT*` の表と `guardDamage`・`hitReaction` の分岐（入力: raw ダメージ・maxHP・kd → 出力: 状態）。
5. 武器スキル/強攻撃/Q/E の `events` 列（上の recorder）。

## 4. 規模の見積もりと移植の順番

JS の行数（コメント込み。`model`＝形、`motion`＝構えは見た目なので別枠）。

| 項目 | JS 行数 | 内訳・メモ |
|---|---|---|
| 片手剣 `sword.js` | 541 | ロジック約 400（ツリー 50 + Q/E 77 + stats/heavy/ws 100 + effects 195）、model 63 + motion 41 |
| 大剣 `greatsword.js` | 403 | ロジック約 290（ツリー 47 + Q/E 78 + heavy 24 + ws 53 + effects 108）、motion 48 + model 18 |
| 短剣 `dagger.js` | 374 | ロジック約 330（毒・出血・連撃の状態が重い） |
| 盾槍 `spear.js` | 480 | ロジック約 400（ガード・ガードカウンター・旗・雷槍の分は `effects` 168 行）|
| 大斧 `axe.js` | 387 | ロジック約 330（ブーメラン・狂戦士・不死身）|
| 弓 `bow.js` | 435 | ロジック約 350（矢・罠・引く円）、motion 51 |
| 共通の中心 | | `actions.js` 449、`combat.js` 141、`hurt.js` 280、`stats.js` 114、`tree-effects.js` 153、`variants.js` 176、`weapon-fx.js` 36、`weapon-api.js` 34、`input.js` 147（ガード）、`loop.js` の戦闘部分（タイマー・ダウン移動・毒/出血・弓の円）約 150 = 約 1,700 |
| 共有の表 | | `techniques.js` 34、`tree-motions.js` 82、`skill-timings.js` 23、`motion-catalog.js` 8、`balance.js` 44、`data.js` の `WEAPONS/TITLES/SV/UNIQUE_FX` 約 150 |
| スキルのまとめ | | `skills.js` 237（旧 `TREE_SKILLS` の afterimage/warcry/berserk 等 + `TREES` stat/style）、`advanced-skills.js` 54（`TECHNIQUES` を `cast` するもの。武器ファイルの `skills` が新、こちらは旧版の技の定義）、`weapon-tree.js` 134 |
| Godot の既存 | | `combat.gd` 158、`game.gd` 702、`rules.gd` 189、`items.gd` 149（戦闘に関わるのは約 400 行）|

おおよそ、移す対象は**全体で JS 約 4,000〜4,500 行**（共通 1,700 + 武器ロジック約 2,100 + 表約 300）。GDScript では 1 行あたり同程度かやや少ない見込み。見た目（`model`/`motion`/`pose-rig`/`weapon-pose`/`technique-motion`/`spear-motion`/`motions/*`）は別の領域で、それを除いた数字。

### 提案する移植の順番
1. **土台（武器共通）**: ① `data/game.json` に `WTREES`・`TECHNIQUES`・`TREE_MOTIONS`・`SPEAR_TIMINGS`・`TITLES`・`SV`・`UNIQUE_FX` を書き出す（`export_gamedata.mjs` の拡張）② `weapon-fx` 相当のフック表（`fx_call/fx_some/fx_reduce` と登録順 order）③ `strikes` の整理（`arc/line/circle(reach)/proj/arrow/dash` と `later`）④ `dealDamage` を元の式に揃える（乱数を引数化して黄金テスト化）。この段階で**黄金テストの足し込み（`events` の書き出し + GDScript の recorder）**もやる。
2. **武器ごとの「強攻撃 + 武器スキル」を 6 武器分**（ツリー前）。まず大剣（`reach` 付き円・兜割り）— 最近の変更が入っていて、見た目は円の判定で確かめやすい。次に短剣（瞬影）→ 大斧 → 盾槍（溜め突き）→ 弓（矢と引く円が要るので、`strikes.arrow` と `updateProjs` を一緒に）。
3. **被弾リアクション**: `REACT`（stagger/down/knockback/受け身）、`bulletT` とボスの弾（`spawnBossProj/updateBossProjs`）、`absorb/pblock/threat/taunt` の送信。
4. **ガード**（盾槍 → 片手剣の守護騎士）: `GUARD*`・`guardDamage/Break/Regen`・`armCounter`・`endGuard`・`SWEEP`。大剣のカウンター（`counter` フック）も同じ被弾分岐を使うのでここで一緒に。
5. **バフとクールタイム**: `addBuff/buffMod/hasBuff`、`tcd`、`SKILL_CD_MULT`。
6. **武器ツリー**: データ構造・熟練度・習得/分岐/払い戻し・セーブ（`weapon-tree.js` と `tree-effects.js`）→ 画面（`I` 持ち物の隣に `K`）→ 武器ごとの Q/E（`skills`）→ パッシブ `mods` → クラス/マスターの `effects`。武器の順は大剣（溜め・光波・カウンター）、片手剣、短剣（状態異常）、盾槍（ガード系）、大斧、弓。
7. **残り**: 称号（`TITLES`・装備枠）、スキル変化 `variants.js`、固有効果 `UNIQUE_FX`、旧スキルツリー（`TREES.stat/style` と旧 `TREE_SKILLS`）、`reviveHit`、HP 吸収・不屈・不死鳥。

### 気づいた点（要確認）
- `SKILL_CD_MULT=1.2` が `skills.js` で武器スキルの cd にのみ掛かる点が Godot の `combat.gd: WEAPON_SKILLS` の cd（7/5/6/6/5）に反映されていない（`export_gamedata.mjs` の出力に乗算後の値があるか確認）。
- 大剣 `gt_charge` B「振り抜き: 最大まで溜めた強攻撃の範囲 +20%」は `greatsword.js` の `heavy.run`・`effects` のどちらにも反映が見えない（説明だけで実装が無い可能性）。
- `advanced-skills.js` の `ADVANCED_TREE_SKILLS` は `skills.js` が import しているが、`TREES[t.kind].nodes` へのノード追加（`skills.js:203`）以外の用途が不明。`TREES` に武器種キーが無い現状（`TREES` は stat/style のみ）では `if (TREES[t.kind])` が常に偽になりそう → 旧データの名残の可能性。移植前に整理を提案。
- `golden-skills.json` の `ws/*` は 25 件（武器スキル 5×… の全部）。Godot に移した片手剣 5 種分だけを先に比べられる。
- ブラウザ側の `state.me.heavySwing` と `charging/charge`（animatePlayer への入力）は、他のプレイヤーへの見た目に `pm`（モーション名）・`pt`（時刻）・`gd`（ガード）・`sw`・`sk` を `{t:'st'}` で送る（`loop.js:404`）。Godot が他の人にも大剣の溜めを見せるには、`st` にこれらを載せる必要がある。
