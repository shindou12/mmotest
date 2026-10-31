# ほかの武器（短剣・大斧・盾槍・弓）の技と効果を移し、照合し、ゲームで当てる（G3）

依頼のときに「担当の武器」を 1〜2 つ指定する。大剣と片手剣でした作業（札 02・04・06a）と同じことを、担当の武器でする。

## 目的
担当の武器の強攻撃・武器スキル・Q/E のツリースキル・技・武器ツリーの効果（effects）が、元の JavaScript と同じ呼び出し列・同じダメージになり、Godot のゲームで敵に当たること。

## 元にするもの（読む）
- `public/js/weapons/<担当>.js`（とそれが使う `spear-motion.js`・`shared/skill-timings.js` など）、`public/js/skills.js`、`public/js/advanced-skills.js`、`public/js/game/actions.js`（arrow など担当の武器が使う strikes）、`loop.js`（投射物・弓の引き・罠などの毎フレーム）、`input.js`（弓の引き・盾槍の構え）
- 大剣と片手剣の移植（見本）: `godot/worldart/scripts/game/skills/sword.gd`・`greatsword.gd`・`skills.gd`・`wtree.gd`、`scripts/game/combat/fx_sword.gd`・`fx_greatsword.gd`・`weapon_fx.gd`・`api.gd`・`damage.gd`、`scripts/game/skills/game_ctx.gd`、`combat.gd`・`game.gd`
- 照合: `tools/worldart/godot/golden_skills.mjs`（全武器の記録が skills_golden.json にある。suite を足すだけ）、`golden_combat.mjs`（武器を足す）、`scripts/tests/skills_golden.gd`・`combat_golden.gd`
- `docs/godot/inventory/combat.md`（担当の武器の表）

## 作るもの・変えるもの
1. `scripts/game/skills/<担当>.gd`（強攻撃・武器スキル・ツリースキル・技・mods・cd_of・motion_of）、`skills.gd` と `wtree.gd` の登録に担当の武器を足す
2. `scripts/game/combat/fx_<担当>.gd`（effects）、`weapon_fx.gd` の登録（順の番号は元と同じ）。武器だけの道具（primeCharge・parry・poison・bleed・ambush・pay・trap など）は `api.gd`・`game_ctx.gd` に
3. 照合: `skills_golden.gd` に suite `<担当>`、`golden_combat.mjs` と `combat_golden.gd` に `damage_<担当>`・`hooks_<担当>`。**全部 OK**
4. ゲーム: 担当の武器の技がゲームで当たる（弓は arrow・引きの射程の円 bowBase〜bowMax・離したときの射程、盾槍の構えとガードは技の当たりに要る所まで。ガード全体は G4）。`--bot` が担当の武器でも動く。`client_test.sh` に担当の武器の回を足す（`--wk=<担当> --wt=<代表的なツリー> --slots=<Q/E>`、強攻撃・武器スキル・Q/E が当たること）

## 触ってはいけないもの
- `public/`・`test/`（読むだけ）、担当でない武器のファイル、`scripts/game/rig/`・`player_view.gd`・`visuals.gd`・GLB・`export_models.mjs`・シェーダー、docs、git のコミットとプッシュ
- 共通のファイル（skills.gd・wtree.gd・weapon_fx.gd・api.gd・game_ctx.gd・combat.gd・game.gd・client_test.sh）は、担当の武器を足すのに要る最小の変更だけ（ほかの武器の担当が同時に同じファイルに足している。統合は Opus がする）。変更した行がわかるように報告する

## 完了条件
- `node tools/worldart/godot/golden_skills.mjs`・`golden_combat.mjs` の自己確認が OK
- `skills_golden.gd`・`combat_golden.gd`・`rules_golden.gd`・`poses_golden.gd` が全部 OK（担当の武器の suite を含む）
- `sh tools/worldart/godot/client_test.sh` が全部 OK（担当の武器の回を含む）
- 照合が空振りでないこと（担当の武器の数を 1 つ変えると NG）を確かめて元に戻す

## 返してほしいもの
- 変えたファイルと、共通のファイルの変更の行、生の出力の要所、元と違う動き・未対応（あれば）
