# goal（唯一の優先目標）: 大剣ブランチ全体を Godot へ完全に移す

2026-10-21 にユーザーが目標をこの 1 つに統一した。ほかの goal 文書は優先対象から外す（下の「優先から外したもの」）。

## 目標
移植元（下の「移植元（確定）」）のゲーム全体（遊び・UI・人物と敵と武器のモデル・動き・エリア・ボス・音・見た目）を、Godot 4 で同じように遊べる状態にする。

## 移植元（確定、2026-10-21 ユーザーが選んだ）
**既定ブランチ `claude/loving-babbage-so7rp1`（15c948b）のゲーム ＋ PR #3（`claude/project-thread-tu085g`、9d57b04）。**
- 既定ブランチのゲームはこの作業ブランチに含まれている（ゲームのコードは同じ）。PR #3 はこの作業ブランチにマージして取り込む（マージ前の印: タグ `pre-pr3-merge`）
- 入れないもの: `happy-dirac-saapxt`（ElevenLabs の被弾音）、`serene-mendel-90a0lr`（森の家）、`codex/dawnring-valley`、ワールドアート（優先外）
- 照合の正本: 取り込み後の作業ブランチの `public/`・サーバー・`test/fixtures/golden-*.json`

### 決める前に調べた事実（記録）
| ブランチ | 最後のコミット | 中身 |
|---|---|---|
| `origin/codex/greatsword-unique-normal` | a2c1818（2026-10-15 17:54）「Add Greatsword normal forms and unique refinements」 | 大剣の通常の形と固有の大剣。200 ファイル。Godot・worldart なし |
| `origin/codex/greatsword-base-refine` | 491709f（2026-10-15 15:35）「Refine Greatsword models and register two unique swords」 | 上の 1 つ前 |
| `claude/funny-hypatia-z9ba69`（この会話の作業ブランチ） | c9ed64b 以降 | 履歴は上の 2 つとつながっていない（根が別: 1a10f3b「Plan Skorpio」2026-10-15）。大剣の主なファイル（`public/js/models/greatsword-forms.js`・`unique-greatswords.js`・`public/greatsword-expansion.html`・`docs/greatsword-model-refine.md`）は `greatsword-unique-normal` と**同じ中身**。そのうえにゲームの続き（砂塵の大蠍スコルピオ・クリスタロス・グラズ・振りの軌跡など、`public/js/` で 247 ファイルの差）と、この会話のワールドアート・Godot の作業が載っている |

### 訂正（2026-10-21、新しい会話で調べ直した）
前の表の「履歴がつながっていない」は**浅いクローン（深さ 50）による誤り**。`git fetch --unshallow` 後は根が共通（12e3f93「浮遊城エテルナ」）。
- リポジトリの既定ブランチは **`claude/loving-babbage-so7rp1`**（先端 15c948b、PR #4 のマージ）。`codex/greatsword-unique-normal`（a2c1818）はその祖先で、大剣の後にボス・生存力・地形エリア・精鋭・町の作り直しなどが続く
- この作業ブランチは既定ブランチを丸ごと含み、`public/`・サーバーへの差はワールドアートの追加だけ（ゲームのコードは既定ブランチと同じ）
- 既定ブランチに入っていない枝: **`claude/project-thread-tu085g`（PR #3、未マージ・open）**= 大剣の溜めモーションと強攻撃の縦の射程の修正・大きな振りかぶり、デバッグ部屋、エフェクト A+B、ヒット音（2b6c4ba から 10 コミット、35 ファイル）。`claude/happy-dirac-saapxt` = ElevenLabs の被弾音（1 コミット）。`claude/serene-mendel-90a0lr` = 森の家の地図（8 コミット）。`codex/dawnring-valley`（PR #2、open）= 暁の環谷（1 コミット、後の地形エリアと重なる）

→ 「大剣ブランチ」が `codex/greatsword-unique-normal` を指すのか、大剣の作業を含む今のゲームの最新（この作業ブランチの 1〜60 番目のコミットまで = 1a10f3b〜Skorpio・Crystalos の時点）を指すのかを、ユーザーに確かめてから移植元を固定する。

## 完了の条件（案。差の一覧を作ったら確定する）
1. 移植元のゲームの全エリア（屋外・屋内・町・ボス部屋）で、Godot のクライアントから今のサーバーにつないで遊べる
2. 6 種の武器（片手剣・大剣・大斧・短剣・盾槍・弓）の通常攻撃・強攻撃・武器スキル・武器ツリーが元と同じ数値で動く（照合テストで確かめる）
3. 人物（防具・武器の形違いを含む）・敵・ボスのモデルと動き、エフェクト、音
4. UI（ログイン・HUD・持ち物・装備・鍛冶屋・スキルツリー・クエスト・地図・共有ボックス）
5. 自動の確認（`tools/worldart/godot/client_test.sh` を広げたもの）と、ブラウザ版と並べた画面の確認

## これまでの関係する作業（この会話で済んだもの）
- Godot のゲームの試作 CP1〜CP6（`docs/godot/migration.md`）: 今のサーバーにつなぐ、歩く・当たり判定、片手剣の通常攻撃・溜め斬り・武器スキル、被弾、倒れる・力尽きる、経験値、出口、屋内のエリア、落とし物・持ち物・装備、人物と敵のモデル（第 1 層）。**大剣は通常攻撃だけ元の数値で、溜め斬り・武器スキルは片手剣の形で代用（未移植）**
- これはこの会話の作業ブランチ（ゲームの最新）を移植元にしている

## 優先から外したもの（記録として残す。作業しない）
- `docs/godot/goal-worldart-port.md`（ワールドマップの 12 枚を Godot へ。途中で止めた。`docs/handoff/2026-10-21-godot.md` に止めた所まで）
- `docs/world-art/goal-mihon2.md`・`goal-f1_field.md`（ワールドマップのアートスタイルの研究）
- この会話の始めにユーザーが `/goal` で設定した「見本②の再現」（Claude Code の組み込みの /goal。ユーザーが `/goal` で置き換える）
