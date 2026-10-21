#!/bin/sh
# Luna（GPT-6 Luna、Codex CLI の codex exec）に依頼の札を 1 枚渡して実行する（docs/agents/collaboration.md）。
#   sh tools/agents/luna.sh <依頼の札.md> [--worktree] [--name <名前>] [--effort <low|medium|high|xhigh|max>] [--ephemeral]
#   sh tools/agents/luna.sh --check          # 認証と呼び出しの確認だけ（一言返させる。読み取り専用・保存しない）
# 記録は .agents/runs/<日時>-<名前>/ に: card.md（依頼）・last.md（最後の報告）・events.jsonl（全経過）・stderr.txt・diffstat.txt
# リーダー（Opus）は last.md・diffstat.txt と、テストの結果の行だけを読む。秘密情報は扱わない（認証は環境の設定から Codex が読む）
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MODEL=${LUNA_MODEL:-gpt-6-luna}
EFFORT=${LUNA_EFFORT:-max}
command -v codex >/dev/null 2>&1 || { echo "codex がない: sh tools/agents/setup.sh"; exit 2; }

if [ "${1:-}" = "--check" ]; then
  # 返事は -o のファイルだけで判定する（標準出力には依頼の文がそのまま出るので、そこで探すと誤判定する）
  tmp=$(mktemp -d)
  out=$(cd "$ROOT" && timeout 180 codex exec --ephemeral -s read-only -m "$MODEL" -c "model_reasoning_effort=\"low\"" -o "$tmp/last.txt" "Reply with exactly: LUNA_OK" < /dev/null 2>&1)
  reply=$(cat "$tmp/last.txt" 2>/dev/null); rm -rf "$tmp"
  if [ "$(echo "$reply" | tr -d '[:space:]')" = "LUNA_OK" ]; then echo "OK  $MODEL を呼べた（返事: LUNA_OK）"; exit 0; fi
  if echo "$out" | grep -qE "401|Unauthorized"; then
    echo "NG  ログインしていない（401）。ChatGPT のアカウントでログインする: codex login --device-auth（ユーザーがブラウザで承認。API キーは使わない: docs/agents/collaboration.md の 8）"; exit 3; fi
  echo "NG  呼べない（認証以外）。最後の数行:"; echo "$out" | tail -5; exit 4
fi

CARD=${1:?"依頼の札（.md）を渡す"}; shift
WT=""; NAME=$(basename "$CARD" .md); EPH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --worktree) WT="--worktree" ;;
    --name) NAME=$2; shift ;;
    --effort) EFFORT=$2; shift ;;
    --ephemeral) EPH="--ephemeral" ;;
  esac; shift
done
RUN="$ROOT/.agents/runs/$(date +%Y%m%d-%H%M%S)-$NAME"
mkdir -p "$RUN"
cp "$CARD" "$RUN/card.md"
echo "実行: $MODEL（推論 $EFFORT）$WT → $RUN"
( cd "$ROOT" && codex exec $WT $EPH -s workspace-write -m "$MODEL" -c "model_reasoning_effort=\"$EFFORT\"" \
    -o "$RUN/last.md" --json - < "$RUN/card.md" > "$RUN/events.jsonl" 2> "$RUN/stderr.txt" )
code=$?
( cd "$ROOT" && git diff --stat > "$RUN/diffstat.txt"; git status --short >> "$RUN/diffstat.txt" )
echo "終了コード $code"
echo "--- 変更（作業ツリー。--worktree のときは worktree の側を見る）"; head -40 "$RUN/diffstat.txt"
echo "--- 報告（$RUN/last.md の先頭）"; head -60 "$RUN/last.md" 2>/dev/null
[ $code -ne 0 ] && { echo "--- エラーの最後"; tail -5 "$RUN/stderr.txt"; }
exit $code
