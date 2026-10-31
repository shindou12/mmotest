# ゲームの中の人物を、新しいモデル・動き・トゥーンで動かす（G2-3）

## 目的
Godot のゲームの自分と他の人を、`PlayerModel`（部品に名前の付いた GLB・武器・盾・防具）＋ `player_rig.gd`（元と同じ姿勢）＋ `ToonLook`（トゥーンと輪郭線）で、ブラウザ版と同じ見た目・同じ動きにする。

## 種類
B（移植）。技のゲームへのつなぎ込みは別の作業（06a、本体の作業ツリー）がしている。

## 元にするもの（読む）
- `public/js/game/render.js`・`snapshot.js`・`loop.js`（自分と他の人の animatePlayer に渡す状態の作り方: moving・walkT・combo・swing・spin・sweep・charging・charge・guard・gg・dodge・hurt・down・motion・motionT・shieldBack・crawl など）、`public/js/models.js`（setPlayerWeapon・setPlayerArmor・weaponStyle・armorLook・プレイヤーの色）、`public/js/game/net-client.js`（他の人の動きの項目 pm・pt・sw・sk・gd など）
- `godot/worldart/scripts/game/player_model.gd`・`toon_look.gd`・`rig/player_rig.gd`・`scripts/pose_view.gd`（使い方の見本）、`visuals.gd`・`game.gd`（今の人物の出し方）
- 光: ブラウザ版の各エリアの光（render.js・env）。ToonLook.set_light

## 作るもの・変えるもの（触ってよいファイル）
1. `scripts/game/visuals.gd`: 人物を PlayerModel で作る（色・武器の種類と形と段階・防具・盾）。装備を変えたら付け替える
2. `scripts/game/player_view.gd`（新規）: 1 人分の「状態 → animatePlayer の入力」を作り、毎フレーム player_rig で動かす。自分の状態は game.gd の me（06a が swingT・combo・charging・chargeT・chargeLv・motion・motionT・skillT・dashT・dodgeT・hurt・downT を持つ。名前が違えば 06a に合わせられるよう、読む所を 1 か所にまとめる）、他の人は snapshot の項目から（snapshot.js と同じ補間）
3. `game.gd`: **変更は最小**（人物を作る所と、毎フレーム player_view を呼ぶ 1 か所。ほかの行は 06a が同時に変えているので触らない）
4. エリアごとの光を ToonLook.set_light に（ブラウザ版のエリアの光と同じ値。表は export_gamedata.mjs から）。地面・木などの背景は今のまま
5. 撮影: ゲームの画面を撮る引数（今の `--shot`）で、草原で大剣を構えた自分・歩き・通常攻撃・溜めを撮り、ブラウザ版のゲームの同じ場面（`e2e/lib/harness.mjs` で起動し、同じ位置・同じカメラ）と並べた比較シートを `art/shots/godot-game/` に作る（`tools/worldart/godot/pose_sheet.py` を流用してよい）

## 触ってはいけないもの
- `public/`・`test/`（読むだけ）、`scripts/game/skills/`・`scripts/game/combat/`・`combat.gd`・`rules.gd`、`client_test.sh`、docs、git のコミットとプッシュ

## 完了条件
- `sh tools/worldart/godot/client_test.sh` が全部 OK（見た目の変更で壊れていない）
- `poses_golden.gd` が全部 OK
- 比較シートができ、自分で見て明らかに壊れているもの（部品が飛ぶ・武器が手から離れる・真っ黒・色が違う・向きが逆）がない

## 返してほしいもの
- 変えたファイルと要点（game.gd の変更の行）、比較シートのパス、まだ違う所、06a の me の項目名で合わせた所
