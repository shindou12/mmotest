---
name: delegate
description: 範囲の決まった実装・道具づくり・移植・自動の確認を、Codex（GPT-6 Luna、codex exec）に依頼するときに使う。「Luna に任せる」「codex exec で」「委任」「分担」と言われたとき、または Opus が書くには長い機械的な実装を始める前。
---

# Luna に依頼する（docs/agents/collaboration.md の手順）

1. **作業を分ける**: A 純粋な処理（Luna）/ B 描画に触れる処理（実装は Luna、判断は Opus）/ C 見た目の判断（Opus）。迷ったら Opus 寄り。1〜2 回の小さな修正、画像を見ながらの微調整、原因のわからない見た目の不具合は渡さない。
2. **準備**: `sh tools/agents/setup.sh`（Godot の描画の確認が要る札なら `--godot`）→ `sh tools/agents/luna.sh --check`。NG（ログインなし）なら、ユーザーに `codex login --device-auth` の承認を頼んで止まる。API キー（従量課金）は使わない（collaboration.md の 8）。
3. **札を書く**: `docs/agents/task-card.md` の書式で `.agents/cards/<名前>.md` に。触ってよいファイル・触ってはいけないもの・守る約束（移植元・規則集の節）・完了条件（コマンドと期待する出力）を必ず。並行する札は触るファイルが重ならないこと。
4. **渡す**: `sh tools/agents/luna.sh .agents/cards/<名前>.md [--worktree]`。生成物を書き換える札は同時に 1 つだけ。
5. **確かめる**: `last.md`・`diffstat.txt`・テストの結果の行を読む。種類 B は差分より先に画像と数値。Opus が自分で同じ確認を回す（`client_test.sh`、撮影）。`events.jsonl` は失敗の調査のときだけ grep。
6. **直す・統合する**: 直しは `codex exec resume` か、直す内容だけの新しい札。2 回で通らなければ Opus が引き取る。通ったら Opus がコミット・プッシュし、規則集・記録を更新する（Luna の報告の失敗は pipeline の F 番号へ）。
