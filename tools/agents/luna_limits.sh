#!/bin/sh
# Luna（Codex）の使用状況: いちばん新しいセッションの記録（~/.codex/sessions）の rate_limits を読む。
#   sh tools/agents/luna_limits.sh
F=$(ls -t "$HOME"/.codex/sessions/*/*/*/*.jsonl 2>/dev/null | head -1)
[ -n "$F" ] || { echo "記録がない"; exit 1; }
grep -o '"rate_limits":{.\{0,500\}' "$F" | tail -1 | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=s.match(/"primary":\{"used_percent":([\d.]+),"window_minutes":(\d+),"resets_at":(\d+)\},"secondary":\{"used_percent":([\d.]+),"window_minutes":(\d+),"resets_at":(\d+)\}/);
if(!m){console.log("読めない");return;}const t=x=>new Date(+x*1000).toLocaleString("ja-JP");
console.log(`5 時間の枠: ${m[1]}%（戻る ${t(m[3])}）`);console.log(`1 週間の枠: ${m[4]}%（戻る ${t(m[6])}）`);});'
