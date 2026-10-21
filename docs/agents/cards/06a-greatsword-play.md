# 大剣（と片手剣）を Godot のゲームで本当に遊べるようにする: 技をゲームにつなぐ（G1-3b）

## 目的
移した技（`scripts/game/skills/`）・差し込み口とダメージ（`scripts/game/combat/`）を、Godot のゲーム（`scripts/game/game.gd`・`combat.gd`）で本当に動かす。試作の手写しの片手剣の技（`combat.gd`）は、移した技に置き換える。
**大剣の通常 3 段・溜め（溜めの段階と時間）・強攻撃「兜割り」（縦の射程 reach 0.8）・武器スキル・Q/E の 6 技・武器ツリー 18 ノードの効果**が、ブラウザ版と同じ数値・同じ時刻で敵に当たること。

## 種類
B（移植）。見た目（人物のモデルと動き）は別の作業（06b、別の作業ツリー）がしている。

## 元にするもの（読む）
- `public/js/game/actions.js`（buildCombat の strikes・senses・feedback・selfCare・party、canAct・startAttack・doSwing・doHeavy・tryWeaponSkill・startSkill・tryTreeSkill・投射物）、`input.js`（溜め: CHARGE_MIN・chargeLv・押す／離す・queued）、`loop.js`（毎フレームの溜め・技の時間・dash・投射物・バフの時間・クールタイム）、`stats.js` calcStats（武器ツリー・称号・fxCall('stats') を含む全部）、`tree-effects.js`、`skills.js`（スロット・Q/E）
- 既にある GDScript: `scripts/game/skills/`（ctx・common・wtree・sword・greatsword・skills）、`scripts/game/combat/`（weapon_fx・api・damage・fx_sword・fx_greatsword）、`scripts/game/rules.gd`（calc_stats はツリーなし）、`game.gd`・`combat.gd`
- 照合の流儀: `tools/worldart/godot/golden_*.mjs` と `scripts/tests/*_golden.gd`
- `docs/godot/inventory/combat.md`（1-2 大剣の表）

## 作るもの・変えるもの（触ってよいファイル）
1. **能力値の照合を広げる**: `rules.gd` calc_stats を、武器ツリー（wtEffects の mods）・旧ツリー（treeEffects）・称号・`fxCall('stats')`（各武器の効果が S を変える）まで元の calcStats と同じにする。`golden_rules.mjs` に suite `calc_stats_tree`（片手剣・大剣のツリーの組み合わせ、称号あり／なし）を足し、`rules_golden.gd` で照合（比べる項目は calcStats の S の数と文字列の項目全部。Set は並べた配列）
2. **本物の文脈** `scripts/game/skills/game_ctx.gd`（ctx.gd を継ぐ）: actions.js buildCombat と同じ中身。arc・line・circle（reach と a）・proj・arrow・dash・hit は、敵（game.gd の mobs）に damage.gd の deal_damage で当てる（サーバーへの hit の送信は damage.gd の結果のまま）。later はゲームの時刻の待ち行列。fx・sfx・text・shake は今ある見た目の関数があればそれを、なければ何もしない（名前ごとに TODO の一覧を残す。エフェクトと音は G8）
3. **ゲームの流れ**（game.gd・combat.gd）: 通常 3 段（doSwing の速さの式・combo・swingDur）、溜め（押してから CHARGE_MIN 未満は通常攻撃、chargeLv、溜めの速さに効く効果）、強攻撃（skills.gd の heavy を lv で）、武器スキル（右クリック、cd は表の値 × cdr）、Q/E（ツリースキル、`ch.slots`、`tcd`）、技の間は動けない時間（skillT・duration・motion の名前と時刻を me に持つ。06b がこれで動きを出す）、dash、投射物（光波など。当たり判定は元の projs の更新と同じ）、バフの時間、クールタイム。**試作の手写しの片手剣の技は消して、skills.gd の登録表から呼ぶ**
4. **武器ツリーを持てるように**: キャラクターの保存（`user://eterna_godot_char.json`）に `tree`・`prof`・`wt`・`slots` を足す（ブラウザ版の character-store.js と同じ形）。画面（UI）は G7 なので、確かめる手段として起動の引数 `--wk=greatsword --wt=gt_wave,gt_charge:3A,gt_rising:2,... --slots=gt_rising,gt_slam` で入れられるように
5. **他の人に動きを見せる送信**: ブラウザ版が `st` などで送っている動きの項目（pm・pt・sw・sk・gd など。net-client.js と snapshot.js を読む）を同じ形で送る（ブラウザの人から Godot の人の大剣の動きが見えるように）
6. **自動操作と確認**: `--bot` を大剣でも動かす（通常・溜め・強攻撃・武器スキル・Q/E を使う）。`client_test.sh` に大剣の回（`--wk=greatsword --wt=... --slots=...`）を足し、`HEAVY`・`SKILL`・`TSKILL`（Q/E）・`HIT`（強攻撃の当たりの数と倍率）の行で確かめる。片手剣の回も今までどおり通ること

## 触ってはいけないもの
- `public/`・`test/`（読むだけ）、`scripts/game/rig/`・`visuals.gd`・`player_model.gd`・`toon_look.gd`・GLB・シェーダー（06b の範囲）、docs、git のコミットとプッシュ
- 照合の済んだ GDScript（skills/・combat/）は、ゲームにつなぐのに要る最小の変更だけ。変えたら、その照合を流して全部 OK を確かめる

## 完了条件
- `rules_golden.gd`（calc_stats_tree を含む）・`skills_golden.gd`・`combat_golden.gd`・`poses_golden.gd` が全部 OK
- `sh tools/worldart/godot/client_test.sh` が全部 OK（片手剣の回と大剣の回）。大剣の回で強攻撃・武器スキル・Q/E が当たっていること
- ブラウザ版と同じサーバーにつないで、Godot の大剣の人の動きの項目が送られていることを、サーバー側の受信で確かめる（e2e の道具か、短い node の WebSocket の受け手で）

## 返してほしいもの
- 変えたファイルと要点、生の出力の要所、fx・sfx の TODO の一覧、元と違う動きになっている所（あれば）
