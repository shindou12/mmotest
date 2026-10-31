# 戦闘の共通（被弾・ガード・のけぞり／ダウン／吹き飛び・ガードブレイク・スキル変化・称号・固有効果・仲間を起こす・状態異常）を移し、照合し、ゲームで動かす（G4）

## 目的
`public/js/game/hurt.js`（onTele・updateTeles・resolveTele・REACT・knockFrom・hitReaction・tryTech・getUp・takeDamage・onJustDodge・fall・revived・reviveHit・crawlTick・die・setHitStop）、`input.js` のガード（GUARD・GUARD_BY・startGuard・endGuard・SWEEP・ガードのゲージ）、`variants.js`（スキル変化 sv_*: 二連・巨大化・迅速・爆炎・雷鳴・吸命・瞬身・崩撃）、称号（data.js の称号の表・stats.js titleReqOk・rules.titleDmg・titleAspd など）、装備の固有効果（fx）、状態異常（敵から受ける毒など）を GDScript に移す。
**同じ状態・同じ予告で、元と同じ被ダメージ・ガードの結果・反応（のけぞり・ダウン・吹き飛び・受け身）・状態の変化**になることを照合で確かめ、ゲームで動かす。

## 元にするもの（読む）
- 上の JS ファイル全部と、それが呼ぶもの（`public/shared/data.js` inShape・SV・SKILL_VARIANTS・称号、`balance.js`、`stats.js`、`loop.js` の被弾・ガード・状態の毎フレーム、各武器の effects のうち被弾・ガード・回避の場面（G3 で移した `scripts/game/combat/fx_*.gd` はガード系の効果も登録済み。ゲームから呼ばれていない）
- 既にある GDScript: `scripts/game/game.gd`（_on_tele・_resolve_tele・_take_damage・_fall・_revived・_die は試作の手写し → 置き換える）、`combat.gd`、`scripts/game/combat/`（damage・api・weapon_fx・fx_*）、`scripts/game/skills/game_ctx.gd`
- 照合の流儀: `tools/worldart/godot/golden_combat.mjs`（wirePorts で元の JS を動かす）・`scripts/tests/combat_golden.gd`
- `docs/godot/inventory/combat.md` の 2（共通の仕組み）、`docs/godot/inventory/ui.md`（力尽きた画面など、画面の部分は G7 なので最小の表示だけ）

## 作るもの・変えるもの
1. `scripts/game/combat/hurt.gd`（新規）: hurt.js の移植。予告の判定（inShape）・ガード（武器ごとの GUARD_BY・正面の角度・ゲージ・構え直し・ガードブレイク）・JUST 回避・被ダメージ（防御・軽減の最大だけ・称号・効果）・反応（REACT・knockFrom・kbScale・受け身・起き上がりの無敵）・這いずり・起こされる・仲間を起こす（reviveHit）・力尽きる
2. ガードの入力（盾槍・守護騎士・各武器の guard 系の効果、SWEEP の回転なぎ払い、ガードカウンター）を combat.gd に。G3 で登録だけされた fx_spear.gd のガード系の効果がゲームから呼ばれるように
3. `scripts/game/combat/variants.gd`（新規）: スキル変化。武器スキルに付く（二連の 2 回目・巨大化の範囲と威力と cd・迅速・爆炎の燃焼と爆発・雷鳴の連鎖・吸命・瞬身・崩撃）
4. 称号と固有効果: damage.gd の称号（tf・titleDmg・titleAspd）を全部の称号に。装備の固有効果（fx の Set）
5. 照合: `golden_combat.mjs` に suite `hurt`（予告の形 × ガードの有無と向き × 武器 × 防具 × バフ × 効果 × 状態 → 被ダメージ・反応・状態の変化・送信）、`variants`（各 sv × 段階 × 武器 → 技の呼び出し列と結果）、`titles`（称号の効果）を足し、`combat_golden.gd` で照合。全部 OK
6. ゲーム: 試作の手写しの被弾を hurt.gd に置き換える。のけぞり・ダウン・吹き飛び・受け身・起き上がりが自分の状態（me）に出る（06b の player_view がそれを読んで動く: hurtT・downT・crawl など。名前は game.gd 冒頭の表にそろえ、新しい項目は表に足す）。盾のガードの光る板（ブラウザ版の gauge の加算の板）は player_model に足す（`scripts/game/player_model.gd`、見た目は `art/shots/godot-pose/` の「盾 kite ガード」が three と合うまで。pose_shots.mjs で撮り直す）
7. `client_test.sh`: 盾槍の回でガードが起きる（GUARD の行）、どの武器でも被弾・のけぞりが起きる（HURT の行）ことを確かめる

## 触ってはいけないもの
- `public/`・`test/`（読むだけ）、`scripts/game/rig/`、`scripts/tests/strikes_golden.gd` と `tools/worldart/godot/golden_strikes.mjs`（別の作業）、docs、git のコミットとプッシュ
- `scripts/game/skills/game_ctx.gd` は、ガード・反応・スキル変化に要る最小の変更だけ（別の作業 09 が同時に strikes の部分を純粋な関数に分けている。統合は Opus）

## 完了条件
- `golden_combat.mjs` の自己確認と `combat_golden.gd`（hurt・variants・titles を含む）が全部 OK、ほかの照合（skills・rules・poses）も全部 OK
- `sh tools/worldart/godot/client_test.sh` が全部 OK（GUARD・HURT を含む）
- 盾 kite ガードの比較シートが three と合う（IoU 0.98 以上を目安）
- 照合が空振りでないこと（hurt の数を 1 つ変えると NG）を確かめて元に戻す

## 返してほしいもの
- 変えたファイルと要点、game.gd 冒頭の表に足した項目、生の出力の要所、比較シートのパスと数、元と違う動き・未対応
