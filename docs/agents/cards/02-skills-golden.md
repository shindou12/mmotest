# 技の照合と、技の土台・武器ツリー・片手剣と大剣の技を GDScript に移す（G1-2）

## 目的
ブラウザ版の技（強攻撃・武器スキル・Q/E のツリースキル）は、どれも「文脈 c のメソッドを呼ぶ関数」として書かれている（`public/js/game/actions.js` buildCombat、`public/js/weapons/*.js`）。
Godot 側も同じ形の文脈を持ち、**記録だけする文脈で動かしたときの呼び出し列が、元の JavaScript と完全に同じ**になるように移す。これで技の数値・形・時刻が元と一致することを自動で確かめる。

## 種類
B（移植と道具）

## 元にするもの（読む）
- `test/golden/skill-trace.mjs`（記録する文脈 recorder と、全スキルの回し方。ハッシュの記録は `test/fixtures/golden-skills.json`）
- `public/js/skills.js`（HEAVY・WEAPON_SKILLS・TREE_SKILLS。161 行目の SKILL_CD_MULT=1.2 で cd を掛けている）
- `public/js/weapon-tree.js`（WTREES・WT_NODE・WT_SKILLS・wtEffects・wtLearn・wtChoose・profOf）
- `public/js/weapons/common.js`・`sword.js`・`greatsword.js`・`index.js`
- `public/shared/techniques.js`・`tree-motions.js`・`motion-catalog.js`・`skill-timings.js`
- 既存の照合の道具（G1-1）: `tools/worldart/godot/golden_rules.mjs`・`godot/worldart/scripts/tests/rules_golden.gd`（書き方をそろえる）

## 作るもの（触ってよいファイル）
1. `tools/worldart/godot/golden_skills.mjs`（新規）: skill-trace.mjs と同じ回し方で、**ハッシュにする前の**記録（`[時刻, 名前, clean した引数]` の列）を `godot/worldart/data/skills_golden.json` に書く。キーは skill-trace.mjs と同じ（`heavy/<武器>/<lv>`・`ws/<id>`・`ts/<id>`・`wt/<id>/<段階>`・`wtmeta/<id>/<段階>`・`eff/<id>/<段階>`）。
   - **自己確認**: 書く前に、各キーの生の記録を skill-trace.mjs と同じ `h()` でハッシュにし、`test/fixtures/golden-skills.json` の値と一致することを確かめる。1 つでも違えば止まる（書き出しが元の計算と同じであることの保証）。
   - 入力（武器の種類・lv・段階・分岐など）も各項目に入れる。全キーを書くが、Godot 側で照合するのは下の 3 の範囲。
2. 表の書き出し: `tools/worldart/godot/export_gamedata.mjs` に、WTREES・WT_NODE・TECHNIQUES・TREE_MOTIONS・MOTION_DURATIONS・SKILL_TIMINGS・スキルの表（HEAVY・WEAPON_SKILLS・TREE_SKILLS の名前・kind・**×1.2 の後の cd**・motion・duration など関数でない項目）を足して `godot/worldart/data/game.json` に書く。**表を GDScript に手で写さない**（試作の片手剣の cd が ×1.2 を抜かして写されていた）。
3. GDScript（`godot/worldart/scripts/game/skills/` に新規）:
   - `ctx.gd`: 文脈の約束（基底クラス）。メソッドの名前と引数は JavaScript と同じ（`me`・`aim`・`wt`・`S`・`col`・`point`・`targets`・`nearest`・`area`・`range`・`reach`・`later`・`arc`・`line`・`circle`・`proj`・`arrow`・`dash`・`hit`・`fx`（slash・ringWave・lightning・flash・parts.burst など）・`sfx`・`text`・`shake`・`buff`・`heal`・`resetCd`・`taunt`・武器だけの道具 `primeCharge`・`parry`・`poison`・`bleed`・`ambush`・`pay`・`trap`）。乱数は `rnd()`（Math.random の代わり。記録では 0.5 を返す）、時刻は `now()`。オプションは JavaScript と同じキーの Dictionary で渡す
   - `common.gd`: weapons/common.js の at・slash_at・sp_off・in_front・fwd
   - `wtree.gd`: weapon-tree.js の wtEffects（返す W の lv・br・v・st・mods・actives・ks1・ks2）・wtLearn・wtChoose・profOf。表は game.json から読む
   - `sword.gd`・`greatsword.gd`: その武器の強攻撃（lv1・lv2）・武器スキル・ツリースキル（Q/E、全段階・分岐）・ツリーの mods。cd などの表の値は game.json から
   - `skills.gd`: id → 関数の登録表（weapons/index.js・skills.js にあたる）
4. `godot/worldart/scripts/tests/skills_golden.gd`（新規）: 記録する文脈（ctx.gd を継ぎ、recorder と同じ: 敵の仮の値 `{id:7,x:0.5,z:3,hp:25,mhp:100,rad:0.8,a:PI,kind:0}`、`me {x:0,z:0,a:0,hp:80,iframe:0}`、point `{x:2,z:7}`、area `f1_field`、range 12、zone [6,10]、reach 1、col 0xcfd3da、知らない名前の呼び出しも記録、`later` は記録してから待ち行列へ、待ち行列は時刻→登録順で回す）で、**片手剣と大剣**の `heavy/*`・`ws/*`・`ts/*`・`wt/*`・`wtmeta/*`・`eff/*` を全部動かし、skills_golden.json と比べる。
   - 比べ方: 数は 1e-6、**辞書はキーの集合も同じであること**（技の照合は厳しく。JSON に出ない undefined のキーは Godot 側でも入れない）、関数の引数は文字列 `"fn"`
   - 出力は rules_golden.gd と同じ形（suite ごとに「OK n 件」か「NG」と最初の 3 件、全部 OK なら終了コード 0）。suite は `sword`・`greatsword`・`wtree`（eff と wtmeta）
5. `tools/worldart/godot/client_test.sh`: 式の照合の行の次に、技の照合を同じ形で 1 つ足す（NG なら ok=1）

## 触ってはいけないもの
- `public/` の JavaScript・`test/`（読むだけ）、既存の Godot のスクリプト（`game.gd`・`combat.gd` など。ゲームへのつなぎ込みは次の作業）、`rules.gd`、生成物（GLB・.blend・art/）、docs、git のコミットとプッシュ

## 完了条件
- `node tools/worldart/godot/golden_skills.mjs` → 自己確認が全キー一致、件数を表示
- `node tools/worldart/godot/export_gamedata.mjs` → 表が game.json に入る
- `cd godot/worldart && godot --headless --path . -s res://scripts/tests/skills_golden.gd` → sword・greatsword・wtree が全部 OK、終了コード 0
- `cd godot/worldart && godot --headless --path . -s res://scripts/tests/rules_golden.gd` → 今までどおり全部 OK
- `sh tools/worldart/godot/client_test.sh` → 全部 OK

## 返してほしいもの
- 変えたファイルと要点、上のコマンドの生の出力の要所、件数（キーの数）、移すのに迷った所（JavaScript の振る舞いで GDScript にしにくかったもの）と、その扱い
