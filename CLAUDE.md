# このリポジトリで作業するときの案内

どの作業でも守る決まり（日本語で答える・進捗ログ・実装の決まり・相談すること）は、ユーザー個人の `~/.claude/CLAUDE.md` にある。ここにはこのリポジトリの決まりだけを書く。

## 今の作業
**今の作業と最新の引継ぎ文書は `docs/handoff/README.md` の表で確かめる。** 新しい会話はそこから読む。

## 背景のグラフィック（RO風の見た目）

マップ・地形・木・岩・草・光・カメラ・仕上げなど、背景の見た目を作る・直すときは、**必ず先に `docs/ro-look-method.md` を全部読み、その手順と数値に従う**。
「このリポジトリを参照して」「RO風で」「いつもの手順で」と言われたら、この手順書のこと。手順はスキル `.claude/skills/ro-look` にもまとめてある。

- 使う部品: `public/js/previews/ro-style.js`（地面）、`foliage.js`（木・茂み・草）、`ro-rock.js`（岩・崖）
- 新しい場面は `public/js/previews/ref-forest.js` を複製して作る（レンダラー・光・仕上げ・配置の道具が入っている）
- 基準の画面: `lab.html?style=ro`（実験場）と `ref-forest.html`（見本の再現）。これより見劣りしたら手順から外れている
- 確かめ方: `tools/ro-look/shot.mjs` で撮り、`tools/ro-look/compare.py` で見本と比べる。差が一番大きいものを1つずつ直す
- 新しくわかったこと（失敗とその原因・効いた数値）は `docs/ro-look-method.md` の失敗集・早見表に書き足す
- キャラクター（人物）はトゥーンと輪郭線のまま。背景だけを RO風にする

## ワールドマップの見た目（参考画像からの研究・Blender の制作体系）

参考画像（Ragnarok Online 3 のキャプチャ）に合わせたワールドマップを作る・直すときは、**まず `docs/world-art/rulebook.md`（第 3 世代の規則集。規則・数値・判断基準・検証の目標）を読む**。全体の地図は `docs/world-art/README.md`。手順はスキル `.claude/skills/world-art` にもまとめてある。
上の `docs/ro-look-method.md` は先行研究で、そのうち光の強さ・彩度の数値は実験で棄却した（`docs/world-art/hypotheses.md`）。
- 規則と数値: `docs/world-art/rulebook.md`（`style-spec.md` は第 2 世代までの記録。食い違えば rulebook が優先）、新しい地図の雛形: `docs/world-art/templates/map-gen3.json`、手順: `docs/world-art/pipeline.md`、実験の記録: `docs/world-art/experiments.md`
- アセットと地形は Blender で作る（`tools/worldart/blender/`、Blender 4.2.23。Windows の場所は `docs/godot/windows-setup.md`）。実行画面は `public/worldart/index.html?map=<名>`
- 出典（参考にした手法・オープンソース）は `docs/world-art/sources.md` に残す

## 作業の分担（Opus がリーダー、実装は Sonnet のサブエージェントか Luna）

範囲の決まった実装・道具づくり・移植・自動の確認は、**まず Codex（GPT-6 Luna、推論 max・高速。`sh tools/agents/luna.sh <依頼の札.md>`）に渡す**。任せてもだめそうだと判断したら Sonnet 5.5 のサブエージェント（Agent の `model: "sonnet"` を必ず指定）に渡し直す（ユーザー、2026-10-22）。Luna は画像の生成（image_generation）もできる。先に絵を作ったほうが質や効率がよい作業では使う（生成した絵は見本にしない）。**アイコンはもう生成しない**: 既存の 163 個か、ブラウザ版と同じ絵文字・記号を使う（ユーザー、2026-10-22 夜）。規則の正本は **`docs/agents/collaboration.md`**（役割・委任する作業の選び方・レビューと検証・ログ・サブエージェントの使い方・競合の避け方・相談の条件）。手順はスキル `.claude/skills/delegate`。Luna が守ることは `AGENTS.md`。
- 見た目の判断（見本との比較・規則の採用・構図・色・アセットの形）、統合（コミット・プッシュ）、規則集と記録の更新は Opus が自分でする
- **確かめ方は軽く**（ユーザー、2026-10-23）: 報告は要約と NG の有無だけ読む、client_test は G の区切りにまとめて 1 回、比較シートは見た目の判断が要る作業だけ。壊れたら直す。詳しくは `docs/agents/collaboration.md` の「確かめ方を軽くする」
- 生成物（Blender の組み立て・Godot への書き出し・撮影）を書き換える作業は同時に 1 つだけ。並行の Luna の作業は worktree を分ける

## 会話の切り替え（引継ぎ）
- 作業の節目（チェックポイントのコミット・プッシュの後、goal の段階が変わるとき）か、会話が重くなる前（コンテキストの圧縮が 1 回起きた後、画像を 30 枚以上見た、同じ切り分けで 3 往復以上した、依頼が別の目標に変わった）に、切り替えの時期かを判断する
- 切り替えるときは、ユーザーに知らせる → `docs/handoff/<日付>-<題>.md` に引継ぎ（目標・状態・変更・未完了・次にすること・再開の手順）→ `docs/handoff/README.md` の表を書き直す → コミット・プッシュ → 新しい会話で使う短い引継ぎ文を示して止まる。会話の切り替えはユーザーがする
