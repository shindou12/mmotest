# M-0004 統合候補の調査

調査日: 2026-10-31 / 比較の基準: `dev` = `4438101`（M-0002・M-0150 を含む）

この文書は、各ブランチを `dev` に統合するか決めるための比較資料です。参照できるローカルのブランチだけを調べ、fetch・ブランチ切り替え・統合操作はしていません。

## 比較の読み方

- 差分は `git rev-list --left-right --count dev...<枝>` の順で「dev のみ / 枝のみ」。枝のみが `0` なら、その枝のコミットはすべて `dev` に含まれています。
- 統計は `git diff --stat dev...<枝>`、ディレクトリ件数は変更ファイルを上位 2 階層で数えています。最後のコミット日時はコミッター日時です。
- 競合は各枝について `git merge-base dev <枝>` を取り、`git merge-tree --trivial-merge <base> dev <枝>` で読み取り専用に確認しました。表の競合欄は、この枝単独を今の `dev` に合わせた結果です。

## ブランチ比較

| 枝 | dev のみ / 枝のみ | 最終コミット（日時 / 件名） | merge-base | 枝だけの作業、変更範囲と主なファイル | 3 方向の競合と包含関係 |
|---|---:|---|---|---|---|
| `origin/claude/godot-lab` | 14 / 12 | `2026-10-24 02:00:54 +09:00`<br>「調整ラボ 5: port_check の Windows 版を合流、8 枚 23 ビューで 19 合格（外れ 4 は明暗比）。README に調整ラボの使い方」 | `53b74f1` | 調整ラボの水面・にじみ・調整パネル・Windows 用 `port_check.py`。49 ファイル、+2,180/-215。上位ディレクトリ: `art/shots` 28、`godot/worldart` 17、`tools/worldart` 3、`public/worldart` 1。主な差分: `port_check.py`、`tuning_panel.gd`、`main.gd`、`public/worldart/world.js`。 | dev との競合なし。`godot-lab-check`、`godot-lab-ui`、`luna/diffmask` の各 tip を含む。L27 とは `53b74f1` から分岐し、L27 側に後続 8 コミットがあるため、現在の L27 tip 全体は含まない。 |
| `claude/godot-lab-check` | 14 / 6 | `2026-10-24 01:58:54 +09:00`<br>「調整ラボ 5（Luna）: port_check.py を Windows の GPU の Godot で動くように（xvfb なし、8097 番のサーバー、撮り直し）」 | `53b74f1` | 水面移植と Windows GPU 用ポート確認。35 ファイル、+846/-155。`art/shots` 24、`godot/worldart` 7、`tools/worldart` 3、`public/worldart` 1。主な差分: `port_check.py`、`world.js`、`export_godot.py`。 | dev との競合なし。tip は `origin/claude/godot-lab` に含まれるため、単独統合は不要。 |
| `claude/godot-lab-ui` | 14 / 6 | `2026-10-24 01:53:22 +09:00`<br>「調整ラボ 4（Luna）: 調整パネル（Tab）、押している間だけ見本（1）・既定（2）、保存と読み込み、コピー」 | `53b74f1` | 調整パネルと水面移植。38 ファイル、+1,072/-85。`art/shots` 25、`godot/worldart` 10、`tools/worldart` 2、`public/worldart` 1。主な差分: `tuning_panel.gd`、`world.js`、`main.gd`。 | dev との競合なし。tip は `origin/claude/godot-lab` に含まれるため、単独統合は不要。 |
| `luna/diffmask` | 23 / 1 | `2026-10-23 22:29:54 +09:00`<br>「にじみのマスク diffmask（depth・edge・veg・soft・lum、既定は切）と views.mjs の WA_PORT（Luna、試作）」 | `544fdcb` | にじみマスクの試作。23 ファイル、+209/-11。`art/shots` 21、`public/worldart` 1、`tools/worldart` 1。主なコード差分は `public/worldart/world.js`。 | 単独では `public/worldart/world.js` が競合。tip は `origin/claude/godot-lab` に含まれるため、ラボ枝を使う場合は別に統合しない。 |
| `origin/claude/funny-hypatia-z9ba69` | 35 / 1 | `2026-10-23 21:22:04 +09:00`<br>「G5・G7・G8 の小さな残り（Luna）: 転移の光柱、罠の予告の塗りと脈動、デバッグ部屋の項目、ブルーム」 | `9d44082` | 枝固有は上記 1 コミット。8 ファイル、+686/-69。`godot/worldart` 6、`art/shots` 1、`docs/godot` 1。主な差分: `debug_panel.gd`、`game.gd`、`visuals.gd`、`fx.gd`。 | `godot/worldart/scripts/game/game.gd` と `fx.gd` が競合。`luna/g-small` と同じ tip。 |
| `luna/g-small` | 35 / 1 | `2026-10-23 21:22:04 +09:00`<br>「G5・G7・G8 の小さな残り（Luna）: 転移の光柱、罠の予告の塗りと脈動、デバッグ部屋の項目、ブルーム」 | `9d44082` | `origin/claude/funny-hypatia-z9ba69` と同一コミット `f40cedc`。8 ファイル、+686/-69。主な差分は同じく `debug_panel.gd`、`game.gd`、`visuals.gd`、`fx.gd`。 | `game.gd` と `fx.gd` が競合。両方を統合せず、同じ枝の別名として一方だけを選ぶ。 |
| `origin/claude/art-style-L29` | 11 / 19 | `2026-10-28 09:45:38 Z`<br>「引継ぎ: 工程管理サイト Maestro を専用リポジトリで作る（要件・決まったこと・設計の案・種の場所）。作業の表を更新」 | `d598aa0` | L29 の草シェル・輪郭調査と比較ページ、Codex の樹木・校舎試作、Maestro の資料とサイト試作。382 ファイル、+79,472/-6。上位: `codex` 357、`maestro` 15、`docs` 5、ルート 2、`tools` 2、`public` 1。大きな追加は `codex/palm-billboard/assets/cards.json`、`codex/fir-study/*`。`public/worldart/world.js`、`docs/world-art/research/`、`docs/world-art/rules/review-L29.md` も変更。 | dev との競合は `.gitignore`。dev の `/debug.log` と枝側の `maestro/dist/` を両方残せる。Codex の `outline-study` と `school-horror` を含む。L27 とは `d598aa0` から分岐し、L27 側に後続 5 コミットがある。 |
| `origin/codex/world-art-outline-study` | 11 / 7 | `2026-10-28 09:00:00 Z`<br>「ワールドの樹木と輪郭・絵画風の比較試作を追加」 | `d598aa0` | Codex 内の樹木・輪郭比較と、2D 校舎・街路の試作。357 ファイル、+78,216。全変更が `codex/`。上位: `codex/school-horror` 95、`codex/fir-study` 58、`codex/fantasy-world` 28、`codex/palm-textures` 26。 | dev との競合なし。`origin/codex/school-horror` を含み、さらに `origin/claude/art-style-L29` に含まれる。 |
| `origin/codex/school-horror` | 11 / 6 | `2026-10-25 01:29:34 +09:00`<br>「2D画像素材で歩けるファンタジー街路を追加」 | `d598aa0` | 2D 画像の校舎・街路、室内の光・影・視差の試作。123 ファイル、+3,696。全変更が `codex/`。`codex/school-horror` 95、`codex/fantasy-world` 28。 | dev との競合なし。`origin/codex/world-art-outline-study` と `origin/claude/art-style-L29` に含まれる。 |
| `origin/wip/f1-maps` | 6 / 1 | `2026-10-31 21:10:21 +09:00`<br>「退避（#136）: art-style-L27 の作業ツリーに残っていた未コミットの変更（f1_field・f1_lake の地図データ、package-lock.json、L27e の撮影の道具、fir4 の撮影）。dev には入れない」 | `1cc99d4` | 地図 JSON、撮影道具、撮影画像、`package-lock.json`。13 ファイル、+210/-88。`art/shots` 8、`godot/worldart` 4、ルート 1。主な差分: `f1_field/map.json`、`f1_lake/map.json`、L27e 撮影道具。 | dev との競合なし。退避用で、コミット件名にも「dev には入れない」とある。 |
| `luna/g5-3-weather` | 57 / 0 | `2026-10-22 23:45:35 +09:00`<br>「G5-3: 天候（雨・霧・砂嵐、湖畔の雨）と流砂の減速（0.5 倍、r−0.3）をブラウザ版と同じに」 | `debebb4` | 天候と流砂の減速。枝 tip は `dev` に含まれ、0 ファイル差分。 | 取り込み済み。 |
| `luna/g7-2-hud` | 70 / 0 | `2026-10-22 14:18:35 +09:00`<br>「G7-2: HUD をブラウザ版の配置・見た目に（hud.gd に切り出し: HP・Lv・XP、アイコン入りのホットバーとクールタイム、バフ、所持金、溜め、回避の円、調べる案内、トースト・バナー、力尽きた画面）」 | `f31e00e` | HUD 一式。枝 tip は `dev` に含まれ、0 ファイル差分。 | 取り込み済み。 |
| `luna/g8-4-bgm` | 57 / 0 | `2026-10-22 22:03:51 +09:00`<br>「G8-4: BGM（10 地域 × 通常・ボス、16・8 小節のループ）・環境音のベッド 10・散発音 10・天候 3 を書き出す」 | `5ed1b15` | BGM・環境音・天候音の書き出し。枝 tip は `dev` に含まれ、0 ファイル差分。 | 取り込み済み。 |
| `luna/g8-6-music` | 52 / 0 | `2026-10-22 22:28:09 +09:00`<br>「G8-6: BGM・環境音・天候の音をゲームの中で鳴らす（music.gd: エリア → 地域の曲・ボス戦でボス版、曲 0.9 秒・環境音 1 秒のフェード、散発音の揺れ、OGG のループ）」 | `39769a0` | ゲーム内の地域 BGM・ボス曲・環境音再生。枝 tip は `dev` に含まれ、0 ファイル差分。 | 取り込み済み。 |
| `worktree-agent-a6eb6ff382941f964` | 87 / 0 | `2026-10-22 02:04:41 +09:00`<br>「goal: G4 を済みに」 | `c17e69d` | G4 完了記録。枝 tip は `dev` に含まれ、0 ファイル差分。 | 取り込み済み。 |
| `origin/claude/loving-babbage-so7rp1` | 206 / 0 | `2026-10-19 19:31:49 +09:00`<br>「Merge pull request #4 from shindou12/claude/project-thread-062nuc」 | `15c948b` | 古い既定ブランチ。tip は `dev` に含まれ、0 ファイル差分。 | 取り込み済み。履歴参照として残す用途がなければ整理候補。 |
| `origin/claude/project-thread-tu085g` | 207 / 0 | `2026-10-18 15:42:32 Z`<br>「ヒット音: 今の合成音の作りを残した自作のヒット音を3つ（重め・肉厚・締め）デバッグ部屋の候補に足す」 | `9d57b04` | PR #3 の枝。tip は `dev` に含まれ、0 ファイル差分。 | 取り込み済み。履歴参照として残す用途がなければ整理候補。 |

### L27・L29・調整ラボの関係

- `dev` は現在の `origin/claude/art-style-L27` の tip `1cc99d4` を含む。
- `origin/claude/godot-lab` は L27 の `53b74f1` から分岐し、L27 側に後続 8 コミットがある。ラボは L27 の現在の tip を丸ごと含まない。
- `origin/claude/art-style-L29` は `d598aa0` から分岐し、L27 側に後続 5 コミットがある。L29 は現在の L27 tip を丸ごと含まない。
- `origin/claude/godot-lab` と L29 を両方取り込む場合、両枝間の読み取り専用 3 方向比較では `public/worldart/world.js` が競合する。各枝を今の dev に単独で比べた結果（ラボは競合なし、L29 は `.gitignore` のみ）とは別に扱う。
- `CLAUDE.md` は調査した枝の差分に出ず、競合もない。`docs/` には L29 の調査記録と funny-hypatia の `docs/godot/goal.md` 変更があるが、dev との競合はない。

## 取り込み区分

| 区分 | 枝 | 理由 |
|---|---|---|
| 取り込み済みで消してよい | `luna/g5-3-weather`、`luna/g7-2-hud`、`luna/g8-4-bgm`、`luna/g8-6-music`、`worktree-agent-a6eb6ff382941f964` | 枝のみコミットが 0。ほかの作業が残っていなければ、ローカル枝を整理できる。 |
| 取り込み済みで消してよい | `origin/claude/loving-babbage-so7rp1`、`origin/claude/project-thread-tu085g` | tip は `dev` に含まれる。統合は不要。古い既定ブランチや PR の参照を保つ運用ならリモート参照は残す。 |
| 取り込む | `origin/claude/godot-lab` | 調整ラボの統合枝として一度だけ取り込む。`godot-lab-check`、`godot-lab-ui`、`luna/diffmask` はこの枝に含まれるので重ねない。統合後はこれらのローカル作業枝を整理できる。 |
| 取り込む | `origin/claude/funny-hypatia-z9ba69` または `luna/g-small` の一方 | 同一 tip `f40cedc` の枝固有 1 コミット。Godot のゲーム移植に残った G5/G7/G8 の小修正を追加する。 |
| 取り込まず記録として残す | `origin/claude/art-style-L29` | 382 ファイル中 357 が `codex/`、15 が `maestro/`。L29 の草・輪郭の資料は選べるが、枝全体を入れると別の試作と工程管理サイトまで入る。 |
| 取り込まず記録として残す | `origin/codex/world-art-outline-study`、`origin/codex/school-horror` | Codex 内の試作一式で、L29 に含まれている。別々に統合すると同じ履歴を重ねる。 |
| 取り込まず記録として残す | `origin/wip/f1-maps` | 退避枝で、件名にも dev に入れないとある。 |

## 取り込む順の案

### 案 1: Godot の統合作業を先に進める（推奨）

1. `origin/claude/godot-lab` を 1 本の統合候補にする。内包される check・ui・diffmask は別に統合しない。現在の dev に対する競合は検出されなかった。
2. `origin/claude/funny-hypatia-z9ba69` の枝固有コミット `f40cedc` を一度だけ取り込む。`game.gd` と `fx.gd` は dev 側の後続変更を残した上で、光柱・罠の予告・ブルームなどの差分を合わせる。
3. L29 と Codex の試作は記録に残す。L29 の成果を必要と判断した時点で、対象を絞った別の変更にする。

### 案 2: L29 の草シェル試作も選ぶ場合

案 1 の後に、L29 全体ではなく草シェルの `e5d4921`（試作）・`b3b3685`（描画されない問題の修正）と記録 `6882c50` だけを候補にする。Godot ラボとの組み合わせでは `public/worldart/world.js` が競合するので、ラボのにじみ処理と草シェルの処理を一つのファイルに合わせる必要がある。輪郭テスト、Codex の 357 ファイル、Maestro はこの案にも含めない。

## 競合の解き方

- `.gitignore`（L29）: dev の `/debug.log` と L29 の `maestro/dist/` を両方残す。
- `public/worldart/world.js`（diffmask を単独で入れる場合、または Godot ラボと L29 を合わせる場合）: ラボの diffmask を残し、L29 の草シェルを選ぶなら該当部分だけを合わせる。ファイル全体の置き換えは避ける。
- `godot/worldart/scripts/game/game.gd`・`fx.gd`（funny-hypatia / g-small）: dev の現在のゲーム実装を土台にし、枝固有の光柱・予告表示・エフェクトだけを取り込む。
- `docs/` と `CLAUDE.md`: 今回の単独比較で競合なし。`CLAUDE.md` の変更はない。

統計と競合一覧は現時点の `dev` を基準にした結果です。統合順を変える場合や複数枝を一度に組み合わせる場合は、その統合候補の状態で再比較してください。
