# Windows の PC に、Godot 版の移植作業の環境を整えて確かめる（PC 側のセッション用）

あなたは Windows の PC の上で動く Claude Code のセッション。リポジトリ `shindou12/mmotest` の作業ブランチ `claude/funny-hypatia-z9ba69` で進めている「大剣ブランチ全体を Godot 4 へ移す」作業（`docs/godot/goal.md`）のために、この PC の GPU で Godot を動かせる環境を整え、確かめる。
**ユーザーへの返答は必ず日本語で書く**（ログ・コマンドの出力は英語のままでよい）。最初に `CLAUDE.md` と、`docs/handoff/` の最新の引継ぎ文書（`CLAUDE.md` に名前がある）を読む。

## 背景
- 今まではクラウドの Linux のコンテナで作業していた。GPU がなく、描画がソフトウェアで遅い（1 枚に数分）。音も出ない
- この PC では、本物の GPU で Godot を描き、Godot MCP で本物のエディタを動かし、音を聞けるようにしたい
- クラウドのセッションも並行して動いている（ロジックの移植と照合）。2 つは git だけでつながる

## すること
1. リポジトリ: `git fetch origin` → `git checkout claude/funny-hypatia-z9ba69` → `git pull --ff-only`。浅いクローンなら `git fetch --unshallow origin`。作業ツリーに自分の知らない変更があれば、触らずにユーザーに知らせる
2. 入れるもの（すでにあれば版を確かめるだけ。入れる前にユーザーに一覧を見せて許可をもらう）:
   - **Godot 4.3 stable ちょうど**（4.4 以降はプロジェクトの書式を書き換えるので使わない）: `https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_win64.exe.zip` を `%LOCALAPPDATA%\Programs\Godot_4.3\` に展開する。主に使うのは、同じ zip に入っているコンソール版 `Godot_v4.3-stable_win64_console.exe`（出力が見える）
   - Node.js 22（`node -v` が v22.x。なければ winget か公式のインストーラ）
   - Python 3（3.11 以降）と Pillow（`py -m pip install --user pillow`）
   - Git for Windows の Git Bash（`tools/worldart/godot/*.sh` を動かすため。ふつうは Git と一緒に入っている）
3. Godot MCP: `https://github.com/Coding-Solo/godot-mcp` を `%LOCALAPPDATA%\godot-mcp` にクローンし、コミット `1209744fad78f3998f98c7394fd0f6ef50da5281` に切り替えてから `npm ci` → `npm run build` を実行する（npm の公開版は古く、その後に任意スクリプト実行の弱点が直っているので、npm 版は使わない）
   - 登録は**ローカルの範囲**で: `claude mcp add --scope local godot -e GODOT_PATH=<Godot のコンソール版の絶対パス> -- node <godot-mcp\build\index.js の絶対パス>`
   - リポジトリの `.mcp.json`（クラウドの Linux 用のパス）は**書き換えない**
4. プロジェクトの準備（リポジトリの一番上で）:
   - `npm ci`
   - 照合の値を作る: `node tools/worldart/godot/export_gamedata.mjs`、`golden_rules.mjs`、`golden_skills.mjs`、`golden_combat.mjs`、`export_rig.mjs`（どれも `tools/worldart/godot/` にある）
   - `godot/worldart` で `<godot> --headless --path . --import`
5. 確かめる（生の出力の要所を記録する）:
   - 照合（`godot/worldart` で）: `<godot> --headless --path . -s res://scripts/tests/rules_golden.gd`。同じ形で `skills_golden.gd`・`combat_golden.gd`・`poses_golden.gd` も流す。全部「照合 全部 OK」になること
   - **GPU での撮影**（画面ありで、xvfb なし）: `<godot> --path . --resolution 960x720 scenes/pose_view.tscn -- --weapon=greatsword:6:5 --state={"motion":"gs_guillotine","motionT":0.35} --out=<絶対パス>\gpu_check.png`
     - かかった秒数を測る（クラウドでは数分かかっていた）
     - 画像を見て、人物・大剣・輪郭線が描けていることを確かめる
   - ブラウザ版と並べる撮影（任意）: `node tools/worldart/godot/pose_shots.mjs --godot --only=gs_rest,gs_walk` → `py tools/worldart/godot/pose_sheet.py`
     - Windows で godot の呼び方が合わないときは、引数を手で合わせる（スクリプトは書き換えない）
   - ゲームの自動の確認（任意）: Git Bash で `sh tools/worldart/godot/client_test.sh`
     - Linux 向けの部分（`timeout -k` など）で動かなければ、どこで止まるかを記録するだけでよい（直さない）
   - Godot MCP: `get_godot_version` と `get_project_info`（プロジェクトは `godot/worldart`）が返ることを確かめる
6. 記録: `docs/godot/windows-setup.md` を新しく作り、次を書く。
   - 入れたもの（版とパス）
   - 手順
   - 確かめた結果
   - 撮影の秒数
   - 動かなかった所

   書いたら `git pull --ff-only` をしてから、**このファイルだけ**をコミットしてプッシュする（クラウドのセッションが同じブランチで作業しているため、ほかのファイルはコミットしない）。

## してはいけないこと
- 課金・API キーが要るもの
- Godot 4.3 以外の版でプロジェクトを開いて保存すること（書式が変わる）
- `.mcp.json`・ゲームのコード・生成物（GLB・画像）のコミット
- 強制プッシュ

## 終わったら
ユーザーに日本語で次を報告する: 入れたもの、照合の結果、GPU での撮影の秒数と画像の場所、Godot MCP が動いたか、`docs/godot/windows-setup.md` をプッシュしたか。そのうえで「クラウドのセッションに『PC の準備ができた』と伝えてください」と案内する。
