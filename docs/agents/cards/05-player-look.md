# 人物と大剣の見た目を Godot に（部品に名前のついた GLB・武器の形・トゥーンと輪郭線・並べて比べる撮影）（G2-2）

## 目的
Godot の人物を、ブラウザ版と同じ形・同じ動き・同じ質感（トゥーンの階調と輪郭線）にする。この作業では**見るための場面**（ポーズを並べて撮る）までを作り、ゲームの画面へのつなぎ込みは次の作業（game.gd に触るため）。
判断（似ているか）は Opus がする。この作業は、比べるための画像を両方から同じ条件で作るところまで。

## 種類
B（移植と道具）と、生成物（GLB）の書き出し

## 元にするもの（読む）
- `docs/godot/inventory/models.md`（モデルと動きの棚卸し。特に 1・2・3 と「リスク」）
- `public/js/models.js`（makePlayer・setPlayerWeapon・makeWeapon・weaponStyle・visTier）、`public/js/models/kit.js`・`weapon-models.js`・`greatsword-forms.js`・`unique-greatswords.js`・`sword-forms.js`・`unique-swords.js`・`shield-models.js`・`armor-looks.js`
- `public/js/toon.js`（MeshToonMaterial の 4 段の階調 [70,150,215,255]、裏返しの殻の輪郭線: 法線を溶接した hullGeo・押し出し量・色 0x17121f）
- 既にある Godot: `godot/worldart/scripts/game/rig/player_rig.gd`（姿勢。部品は名前 → Node3D の辞書）、`godot/worldart/data/rig.json`（部品の名前・親・休みの変換、武器・盾の取り付け）、`scripts/game/visuals.gd`（今の人物の読み込み）、`tools/worldart/godot/export_models.mjs`（今の書き出し）
- 照合の流儀: `scripts/tests/poses_golden.gd`

## 作るもの（触ってよいファイル）
1. `tools/worldart/godot/export_models.mjs`（変更）: 
   - 人物（makePlayer）の部品に rig.json と同じ名前を付けて書く（body・head・armL・armR・elbowL・elbowR・hand・handL・legL/legR（rig.json の名前に合わせる）・cape）。プレイヤーごとの色の部品は材質の名前を `player_color` にして、Godot で色を差し替えられるようにする（今は #448a9b が焼き込み）
   - 武器: **大剣の全形（0〜7: 標準・cleaver・zweihander・flamberge・odachi・falchion・excalibur・dainsleif）と片手剣の全形（0〜8）**を、飾りの段階（visTier）ごとに書く（段階で形が変わらず材質の色だけなら、形 1 つと段階ごとの色の表でよい。どちらにしたかを報告）。書き出す範囲は武器の形（weaponModel）だけ。取り付けは rig.json
   - 盾（kite）と防具の見た目（armor-looks の look 1〜6）も、部品の名前と取り付けがわかる形で書く
   - 輪郭線の殻は書かない（Godot 側で作る）。材質の名前は今と同じ toon / glow を守る
2. `godot/worldart/shaders/toon.gdshader`（新規）と輪郭線: MeshToonMaterial と同じ 4 段の階調（光の向き・環境光の扱いは three.js の MeshToonMaterial と同じ式に寄せる）、輪郭線は next_pass の裏面の殻（法線を溶接して押し出す。押し出し量と色は toon.js と同じ）
3. 見る場面と撮影:
   - `godot/worldart/scenes/pose_view.tscn` と `scripts/pose_view.gd`（新規）: 人物 1 人を、指定の武器（種類・形・段階）・防具・色・姿勢（poses_golden の状態か、モーション id と時刻）で立たせ、固定のカメラと光で撮る。引数: `--weapon=greatsword:3:4 --state=<JSON> --out=<png>`。複数の姿勢を 1 回で撮れる一覧も
   - `tools/worldart/godot/pose_shots.mjs`（新規）: ブラウザ（playwright、`e2e/lib/harness.mjs` の起動の道具）で同じ人物・同じ姿勢・同じカメラ（位置・画角・向き）・同じ光で撮る
   - `tools/worldart/godot/pose_sheet.py`（新規）: 両方の画像を左右に並べた比較シート（姿勢ごとに 1 行、ラベル付き）を作る。数の差（輝度の平均・シルエットの重なり IoU など）も表に出す
   - 撮る姿勢: 大剣の 構え（何もしない）・歩き・通常 3 段の途中・溜め（0.1・0.5・1）・強攻撃の振り下ろし・武器スキル 4 種の見せ場・回避・被弾・ダウン、片手剣の 構え・通常・溜め。大剣は 8 つの形すべての構え
   - 描画: `VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json xvfb-run -a godot --path . --resolution 960x720 ...`（ソフトウェアの Vulkan は入れてある。動かなければ `--rendering-driver opengl3`）
4. 出力: 比較シートを `art/shots/godot-pose/` に（png、ファイル名に姿勢と形）

## 触ってはいけないもの
- `public/`・`test/`（読むだけ）、`game.gd`・`combat.gd`・`rules.gd`・`scripts/game/skills/`・`scripts/game/rig/player_rig.gd`（使うだけ。直す必要があれば報告）、`client_test.sh`、docs、git のコミットとプッシュ

## 完了条件
- `node tools/worldart/godot/export_models.mjs` → 人物・武器（大剣 8 形・片手剣 9 形）・盾・防具の GLB と件数・大きさを表示
- `node tools/worldart/godot/pose_shots.mjs` と Godot の撮影 → `python3 tools/worldart/godot/pose_sheet.py` で比較シートができる
- `poses_golden.gd`・`rules_golden.gd`・`skills_golden.gd` が今までどおり全部 OK（`cd godot/worldart && godot --headless --path . --import` のあとで）
- 自分で見て明らかに壊れているもの（部品が飛ぶ・武器が手から離れる・真っ黒・輪郭線が太すぎる）は直してから返す

## 返してほしいもの
- 変えたファイルと要点、書き出した GLB の一覧と大きさ、比較シートのパスと数の表、three.js と Godot で合わせにくかった所（光の式・色空間・輪郭線の太さ・回転の規約）とその扱い、まだ似ていないと思う所
