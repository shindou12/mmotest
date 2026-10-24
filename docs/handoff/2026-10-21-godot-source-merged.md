# 引継ぎ（2026-10-21）: 移植元を確定し PR #3 を取り込んだ（チェックポイント）

新しい会話はこの文書と `docs/godot/goal.md` を最初に読む。前の引継ぎは `2026-10-21-godot.md`（その「履歴がつながっていない」は誤り）。

## 1. 目標（1 つだけ）
**大剣ブランチ全体を Godot へ完全に移す**（`docs/godot/goal.md`）。ワールドマップの作業（アートスタイル研究・12 枚の Godot 移植）は再開しない。コミットは残してある。

## 2. 移植元（確定）
**既定ブランチ `claude/loving-babbage-so7rp1`（15c948b）のゲーム ＋ PR #3（`claude/project-thread-tu085g`、9d57b04）**。ユーザーが 2026-10-21 に選んだ。
- PR #3 = 大剣の溜めモーションと強攻撃の縦の射程の修正・大きな振りかぶり、デバッグ部屋（`?debug`）、エフェクト A+B、ヒット音
- 入れない: `happy-dirac-saapxt`（ElevenLabs の被弾音）、`serene-mendel-90a0lr`（森の家）、`codex/dawnring-valley`
- 照合の正本: 作業ブランチ（6b7f278 以降）の `public/`・`server.js`・`public/shared/`・`e2e/fixtures/*.json`・`test/fixtures/golden-*.json`

## 3. この区切りでしたこと
| コミット | 中身 |
|---|---|
| 073de5f | goal.md: 候補を調べ直した事実（浅いクローンの誤りの訂正） |
| b9fc852 | goal.md に移植元を確定、前の引継ぎの誤りに印。**PR #3 を取り込む前の戻り先** |
| 6b7f278 | PR #3 を作業ブランチにマージ（普通のマージ。ぶつかりなし）。PR #3 自体は open のまま |

## 4. 確かめた結果（生の出力から）
| 確認 | 取り込み前（b9fc852） | 取り込み後（6b7f278） |
|---|---|---|
| `npm test` | 131 / 131 pass | 137 / 137 pass（PR #3 の sample-sfx のテストが増えた） |
| `node --test e2e/combat.golden.e2e.mjs` | pass | pass（PR #3 が記録を更新済み） |
| `node --test e2e/app.golden.e2e.mjs` | pass | pass |
| `node --test e2e/render.golden.e2e.mjs` | pass | pass |
| `sh tools/worldart/godot/client_test.sh` | — | 全部 OK（草原・攻撃 102・撃破 19・街・洞窟・溜め斬り 17・武器スキル 16・拾う 4・装備） |

注意:
- golden の e2e は 3 つまとめると 10 分を超える。1 つずつ流す（上の表のコマンド）
- client_test のログ（`/tmp/godot_client_test.log`）に `ERROR: Parameter "m" is null`（`servers/rendering/dummy/storage/mesh_storage.h`）が数百行出る。画面なし（--headless）の空の描画サーバーがメッシュを持たないためで、画面なしの時だけ出る。判定には影響しない
- `godot --import` で `wa_hemi_sky` の SHADER ERROR が 5 件（取り込みの時だけ。ワールドアート側のシェーダー）。ゲームの試作の確認は通る
- プロキシはタグのプッシュを通さない（`pre-pr3-merge` はローカルだけ）。戻り先はコミット b9fc852 で指す

## 5. 環境（コンテナが作り直されると消える）
- Godot 4.3（`sh tools/agents/setup.sh --godot`）。xvfb はある。ソフトウェアの Vulkan（lavapipe）は入らなかった（画面ありの撮影が要るときに入れ直す）
- `npm ci` 済み。Codex は未ログイン（使わない。使うならユーザーの承認）
- 履歴が浅いクローンのときは `git fetch --unshallow origin claude/funny-hypatia-z9ba69` をしてから枝を比べる

## 6. 次にすること
1. 移植元と Godot の試作（`godot/worldart/scripts/game/`、`docs/godot/migration.md`）の差を一覧にする（武器 6 種の技・ツリー、エリア、ボス、敵、UI、モデルと動き、エフェクト、音、デバッグ部屋）。これは調べものなので Sonnet のサブエージェントに分けてよい（`model: "sonnet"`）
2. 差の一覧から goal.md の完了の条件と、チェックポイントの順を確定する（案: 大剣の技を元の数値で → 他の武器 → 全エリア → ボス → UI → モデルと動き → エフェクトと音）
3. 数値は照合テスト（元の JavaScript で作った期待値と GDScript を比べる。`docs/agents/cards/01-rules-golden.md`）で確かめる。見た目は Opus がブラウザ版と並べて判断する

## 7. 再開の手順
```sh
cd /home/user/mmotest
git fetch origin && git checkout claude/funny-hypatia-z9ba69 && git pull --ff-only
git fetch --unshallow origin claude/funny-hypatia-z9ba69 2>/dev/null || true
npm ci && npm test
sh tools/agents/setup.sh --godot
(cd godot/worldart && godot --headless --path . --import)
sh tools/worldart/godot/client_test.sh      # 全部 OK になるはず
```
