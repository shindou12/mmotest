# Windows の PC で Godot を GPU で動かす（2026-10-21）

`docs/godot/goal.md` の作業を、クラウドの Linux（GPU なし・音なし）と並べて Windows の PC でも進めるための環境の記録。
2 つのセッションは git（ブランチ `claude/funny-hypatia-z9ba69`）だけでつながる。

## 1. この PC
- Windows 11 Home 10.0.26200、GPU は NVIDIA GeForce RTX 4070 SUPER（Godot の表示: `Vulkan 1.4.341 - Forward+ - Using Device #0: NVIDIA - NVIDIA GeForce RTX 4070 SUPER`）
- リポジトリ: `C:\Users\shind\mmotest`（浅いクローンではない）

## 2. 入れたもの（版とパス）
| もの | 版 | パス | 入れ方 |
|---|---|---|---|
| Godot | 4.3.stable.official.77dcf97d8 | `%LOCALAPPDATA%\Programs\Godot_4.3\Godot_v4.3-stable_win64_console.exe`（主に使う）と `Godot_v4.3-stable_win64.exe` | 公式の `Godot_v4.3-stable_win64.exe.zip` を展開 |
| Node.js | v22.23.4 | `%LOCALAPPDATA%\Programs\node22\node.exe` | 公式の `node-v22.23.4-win-x64.zip`（SHA256 を `SHASUMS256.txt` と照合）を展開。PATH には入れていない |
| Python | 3.13.15 | `%LOCALAPPDATA%\Programs\Python\Python313\python.exe`、起動は `%LOCALAPPDATA%\Programs\Python\Launcher\py.exe` | `winget install --id Python.Python.3.13 --scope user` |
| Pillow | 13.0.0 | ユーザーの site-packages | `py -m pip install --user pillow` |
| Git for Windows（Git Bash） | 2.53.0.windows.1 | もとから入っていた | — |
| Godot MCP | コミット `1209744fad78f3998f98c7394fd0f6ef50da5281` | `%LOCALAPPDATA%\godot-mcp\build\index.js` | クローン → checkout → `npm ci` → `npm run build`（Node 22 で）。npm の公開版は使わない |
| numpy | 2.5.4 | Python313 の本体の site-packages（Pillow も同じ所に入れ直した） | `python.exe -I -m pip install pillow numpy` |
| playwright | 1.64.1 | `%LOCALAPPDATA%\Programs\node22\node_modules\playwright` | Node 22 で `npm i -g playwright`。リポジトリの package.json は変えない |
| Chromium（playwright 用） | Chrome Headless Shell 156.0.8078.4 | `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1248` | `playwright install chromium` |
| Blender | 4.2.23 LTS | `%LOCALAPPDATA%\Programs\blender-4.2.23-windows-x64\blender.exe` | 公式の zip（SHA256 を照合）を展開。もとから入っていた Blender 5.2 は使わない（リポジトリの検証は 4.2.23） |
| Codex CLI（Luna） | 0.163.0 | `%APPDATA%\npm\codex` | 0.133.0 から `npm i -g @openai/codex@latest` で上げた（0.133 は `~/.codex/config.toml` の `max` を読めなかった）。ChatGPT のアカウントでログイン済み |

- playwright を使うときは `PLAYWRIGHT_MODULE=file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs` を置く（`e2e/lib/harness.mjs` が読む）
- `python -I`（スクリプトの書き方）はユーザーの site-packages（`pip --user`）を読まない。だから Pillow と numpy は本体の側に入れる。`-I` は `PYTHONUTF8` も読まないので、日本語のファイルを読むスクリプトは `-X utf8` を付ける（付けないと cp932 で `UnicodeDecodeError`）

- もとから入っていた Node v24.13.1（`C:\Program Files\nodejs`）はそのまま。この作業では Node 22 を PATH の先頭に置いて使う: Git Bash なら `export PATH="$LOCALAPPDATA/Programs/node22:$PATH"`
- Python を入れた直後は、開いていたシェルの PATH に入っていない（`py` が見つからない）。`py.exe` のフルパスで呼ぶか、シェルを開き直す
- Godot MCP の登録はローカルの範囲（`C:\Users\shind\.claude.json` の、このプロジェクトの項）。リポジトリの `.mcp.json`（クラウドの Linux 用）は変えていない。ローカルの登録のほうが優先される
  ```
  claude mcp add --scope local godot -e GODOT_PATH=C:\Users\shind\AppData\Local\Programs\Godot_4.3\Godot_v4.3-stable_win64_console.exe -- C:\Users\shind\AppData\Local\Programs\node22\node.exe C:\Users\shind\AppData\Local\godot-mcp\build\index.js
  ```
  `claude` は PATH に無かったので、デスクトップアプリに付いている `claude.exe`（`%LOCALAPPDATA%\Claude-Data\...\claude-code\<版>\...\claude.exe`）で登録した。`claude mcp get godot` は `√ Connected`

## 3. プロジェクトの準備（リポジトリの一番上で、Git Bash）
```sh
export PATH="$LOCALAPPDATA/Programs/node22:$PATH"
G="$LOCALAPPDATA/Programs/Godot_4.3/Godot_v4.3-stable_win64_console.exe"
npm ci
node tools/worldart/godot/export_gamedata.mjs   # -> data/game.json 17 areas 282 KB
node tools/worldart/godot/golden_rules.mjs      # 合計 2400 件
node tools/worldart/godot/golden_skills.mjs     # キー 491 件 + misc
node tools/worldart/godot/golden_combat.mjs     # Windows では止まる（下の 6. を見る）
node tools/worldart/godot/export_rig.mjs        # 自己確認 OK: 141 キー全部がハッシュ一致
(cd godot/worldart && "$G" --headless --path . --import)   # 25 秒、exit 0
```

## 4. 確かめた結果
### 照合（`godot/worldart` で `"$G" --headless --path . -s res://scripts/tests/<名>.gd`）
| スクリプト | 結果 | 秒 |
|---|---|---|
| rules_golden.gd | collide 720・in_shape 240・bound_r 480・ang_diff 240・xp_to_next 240・calc_stats 240・calc_stats_tree 240、`照合 全部 OK` | 1 |
| skills_golden.gd | sword 37・greatsword 37・dagger 37・axe 37・spear 39・bow 37・wtree 264、`照合 全部 OK` | 1 未満 |
| combat_golden.gd | damage_* 6 武器 × 336・hooks_* 1371〜1412、`照合 全部 OK` | 4 |
| poses_golden.gd | basic 24・motion_greatsword 18・motion_sword 18・motion_other 81、`照合 basic・motion_greatsword・motion_sword 全部 OK` | 1 未満 |

終わりに `WARNING: ObjectDB instances leaked at exit` と `ERROR: N resources still in use at exit` が出るが、exit は 0（照合の結果には関係しない）。

### GPU での撮影（画面あり、xvfb なし）
```powershell
cd C:\Users\shind\mmotest\godot\worldart
& $g --path . --resolution 960x720 scenes/pose_view.tscn -- --weapon=greatsword:6:5 '--state={\"motion\":\"gs_guillotine\",\"motionT\":0.35}' '--out=C:\Users\shind\mmotest\.agents\windows-check\gpu_check.png'
```
- **1.04 秒**（Godot の起動から終わりまで。`Measure-Command` で測った）。クラウドのソフトウェア描画では 1 枚に数分かかっていた
- 出力 `pose_view: 1 枚 撮影（失敗 0）`。画像（`.agents/windows-check/gpu_check.png`、git に入れない）で、人物・頭上に振りかぶった大剣（金の鍔・桃色の刃）・黒い輪郭線が描けているのを見た
- PowerShell 5.1 から JSON の引数を渡すときは、`"` を `\"` にしないと Godot に届く前に引用符が消える。Git Bash なら `'--state={"motion":"gs_guillotine","motionT":0.35}'` のままでよい

### ブラウザ版と並べる撮影（一部だけ）
- `node tools/worldart/godot/pose_shots.mjs --only=gs_rest,gs_walk` は `out/godot-pose/poses.json` を書いたあと、playwright が無いので three.js の側で止まる（`playwright が見つかりません`）。この PC に playwright は入れていない
- `--godot` の部分は Linux 向け（`timeout -k 5 900 xvfb-run -a godot ...` と `VK_ICD_FILENAMES`）なので、同じ引数で手で呼んだ:
  `& $g --path . --resolution 960x720 scenes/pose_view.tscn -- '--list=C:\Users\shind\mmotest\out\godot-pose\poses.json'` → `pose_view: 2 枚 撮影（失敗 0）`、1.08 秒
- そのあと playwright を入れて three.js の側も撮った（2 枚で 4 秒）。`python.exe -I -X utf8 tools/worldart/godot/pose_sheet.py` → 大剣の休み・歩きで平均 IoU 0.996、輝度差の平均 1.81。このスクリプトは git に入っている `art/shots/godot-pose/` に書くので、結果は `.agents/windows-check/pose-sheet/` に移し、`pose_numbers.md` は元に戻した

### Blender と Luna
- Blender 4.2.23 で `build_assets.py -- --out .agents/windows-check/assets --blend .agents/windows-check/assets.blend`（8 秒）→ 70 個のうち 68 個が `public/worldart/assets/` の GLB とバイト単位で一致。`statue.glb`・`statue2.glb` の 2 つだけが違う（Linux で作ったものと比べたのか、元から違うのかはまだ見ていない）
- `sh tools/agents/luna.sh --check` → `OK  gpt-6-luna を呼べた（返事: LUNA_OK）`

### ゲームの自動の確認（client_test.sh）
Git Bash で、スクリプトは変えずに PATH の先頭へ小さな呼び出し口を置いて流した（`godot` → Godot 4.3 のコンソール版、`python3` → Python313 の `python.exe`、それと Node 22）:
```sh
# bin/godot の中身: #!/bin/sh / exec "<Godot_v4.3-stable_win64_console.exe の絶対パス>" "$@"
export PATH="<bin のフォルダー>:$LOCALAPPDATA/Programs/node22:$PATH"
sh tools/worldart/godot/client_test.sh
```
- Git Bash の `timeout -k` はそのまま動いた。`/tmp` は Git Bash の一時フォルダーになる。最後まで流れて **838 秒**（クラウドの記録は約 6 分）
- `OK` 76 行、`NG` 1 行（終了コード 1）:
  - `NG  大斧: 強攻撃が当たらない`（同じ回の `OK  大斧: 強攻撃（17 回）` なので出てはいる。`/tmp/godot_client_test_ax.log` は `HEAVY lv=2` が 17 回、`type=heavy` の HIT が 0、HIT 全体も 26 回と他の武器（48〜220 回）より少ない）。ボットの動きの揺れか Windows での違いかはまだ切り分けていない。直していない
  - ほかの片手剣・大剣・短剣・盾槍・弓の回と、最後の 4 つの照合（rules・skills・combat・poses）は全部 OK
- どの回のログにも `ERROR: Parameter "m" is null.`（`servers/rendering/dummy/storage/mesh_storage.h:120`）が 270〜460 回出る。`--headless` のダミーの描画の側の警告で、結果の判定には関係しない

### Godot MCP
このセッションは登録の前に始まったので、MCP のツールはこの会話には読み込まれなかった。登録と同じコマンド（Node 22 ＋ `build\index.js` ＋ `GODOT_PATH`）でサーバーを立て、標準入出力の JSON-RPC で直接呼んで確かめた:
- `tools/list`: launch_editor, run_project, get_debug_output, stop_project, get_godot_version, list_projects, get_project_info, create_scene, add_node, load_sprite, export_mesh_library, save_scene, get_uid, update_project_uids
- `get_godot_version` → `4.3.stable.official.77dcf97d8`
- `get_project_info`（`C:\Users\shind\mmotest\godot\worldart`）→ `name: worldart`、scenes 3・scripts 41・assets 45・other 423

次の会話からは `godot` の MCP のツールがそのまま使えるはず（`claude mcp get godot` は `√ Connected`）。

## 5. 気をつけること
- **Godot は 4.3 だけを使う**。4.4 以降でプロジェクトを開いて保存すると書式が変わる
- `--import` のあと、`godot/worldart/data/assets/*.import` など 186 件が `git status` で「変更あり」に見える。Godot が LF で書き直し、この PC の git が `core.autocrlf=true`（`C:/Program Files/Git/etc/gitconfig`）のため。`git diff` の中身は空で、実質の差は無い。コミットしない
- `--import` で `SHADER ERROR: グローバルuniform「wa_hemi_sky」は存在しません` が 15 回出る（`project.godot` には定義がある）。照合と撮影には影響しなかった
- `package-lock.json` の `"name"` が作業ツリーで `aincrad-mini` に変わっている（このセッションの前からあった変更。触っていない）
- 生成物（`.agents/`・`out/`・`combat_golden.json`・`poses_golden.json`・GLB・画像）はコミットしない

## 6. Windows で動かなかった所（スクリプトは直していない）
- `tools/worldart/godot/golden_combat.mjs`: 自分自身を子プロセスで呼ぶ所（503 行）で `new URL(import.meta.url).pathname` と `tmp.pathname` が `/C:/Users/...` になり、`Cannot find module 'C:\C:\Users\...'` で止まる。同じフォルダーに一時的な写しを作って、その 2 か所を `fileURLToPath(...)` に替えて流し、写しは消した（10376 場面、`他の武器の効果が働いた場面: 0 件`、`combat_golden.json` を書けた）。直すなら `fileURLToPath` を使う
- `tools/worldart/godot/pose_shots.mjs --godot`: `timeout`・`xvfb-run`・`VK_ICD_FILENAMES` が Linux 向け。上のとおり手で呼べば撮れる
- `python3` は Windows ではストアの仮の入口（`WindowsApps\python3.exe`）に当たる。`py` か Python313 の `python.exe` を使う
