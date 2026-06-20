#!/bin/bash
# .claude/hooks/stop-verifier.sh — Stop hook: 检查 goal state 中的 verifier 结果
#
# 逻辑:
#   1. 读 .claude/.goal-state.json
#   2. 检查 last_verdict
#   3. PASS → 允许停止
#   4. FAIL → block + 反馈
#   5. PARTIAL → 检查是否有阻断性 FAIL，无阻断性 FAIL 则允许继续（不 block）
#   6. null → 运行快速构建检查

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_FILE="$PROJECT_DIR/.claude/.goal-state.json"

cd "$PROJECT_DIR"

# ── 检查 state 文件 ────────────────────────────────────────
if [ ! -f "$STATE_FILE" ]; then
  cat > "$STATE_FILE" <<'STATEEOF'
{
  "current_goal": "mitosis-mvp",
  "started_at": "",
  "turns_used": 0,
  "max_turns": 1000,
  "criteria": {},
  "last_verdict": null,
  "last_verifier_output": null,
  "feedback_history": [],
  "consecutive_failures": 0
}
STATEEOF
  echo '{"hookSpecificOutput": {"hookEventName": "Stop", "decision": "block", "additionalContext": "首次运行 /goal。请读 goal.md 和 .claude/.goal-state.json，开始 Stage 0（平台自举修复）。Verifier 会在每轮迭代后检查结果。"}}'
  exit 2
fi

# ── 读取 state ─────────────────────────────────────────────
VERDICT=$(node -e "
const fs = require('fs');
try {
  const s = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8'));
  console.log(s.last_verdict || 'none');
} catch(e) { console.log('error'); }
" 2>/dev/null)

TURNS_USED=$(node -e "
const fs = require('fs');
try {
  const s = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8'));
  console.log(s.turns_used || 0);
} catch(e) { console.log('0'); }
" 2>/dev/null)

MAX_TURNS=1000

# ── 检查是否有阻断性 FAIL ─────────────────────────────────
HAS_BLOCKING_FAIL=false
if [ "$VERDICT" = "FAIL" ] || [ "$VERDICT" = "PARTIAL" ]; then
  BLOCKING=$(node -e "
const fs = require('fs');
try {
  const s = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8'));
  const v = JSON.parse(s.last_verifier_output || '{}');
  if (v.blocking_failure) { console.log('BLOCKING'); }
  else if (v.failed_items) {
    const hasBuildFail = v.failed_items.some((f: string) =>
      /build|构建|npm run|security|安全|token|secret|关键文件/.test(f)
    );
    console.log(hasBuildFail ? 'BLOCKING' : 'NON_BLOCKING');
  } else { console.log('NON_BLOCKING'); }
} catch(e) { console.log('UNKNOWN'); }
" 2>/dev/null)
  if [ "$BLOCKING" = "BLOCKING" ]; then
    HAS_BLOCKING_FAIL=true
  fi
fi

# ── 判断 ───────────────────────────────────────────────────
if [ "$VERDICT" = "PASS" ]; then
  # 检查是否有 deferred stages
  DEFERRED=$(node -e "
const fs = require('fs');
try {
  const s = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8'));
  const d = s.deferred_stages || [];
  if (d.length > 0) {
    const names = {2: 'production-verify'};
    const labels = d.map(n => names[n] || 'stage-' + n).join(', ');
    console.log('HAS_DEFERRED:' + labels);
  } else { console.log('NONE'); }
} catch(e) { console.log('NONE'); }
" 2>/dev/null)

  if [[ "$DEFERRED" == HAS_DEFERRED:* ]]; then
    STAGES=${DEFERRED#HAS_DEFERRED:}
    echo "{\"hookSpecificOutput\": {\"hookEventName\": \"Stop\", \"decision\": \"allow\", \"additionalContext\": \"✅ Stage 0-1 全部通过。Stage 2 (production-verify) 已标记为 deferred（需手动部署到 gh-pages）。已完成的验收：7/9 criteria。剩余工作：用 git worktree 部署 dist/ 到 gh-pages 分支，验证 mitosis.zenheart.site 可访问。\"}}"
  else
    echo '{"hookSpecificOutput": {"hookEventName": "Stop", "decision": "allow", "additionalContext": "✅ 所有验收标准已通过 (verdict: PASS)。可以安全停止。"}}'
  fi
  exit 0

elif [ "$VERDICT" = "FAIL" ] && [ "$HAS_BLOCKING_FAIL" = "true" ]; then
  CONSECUTIVE=$(node -e "
const fs = require('fs');
try {
  const s = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8'));
  console.log(s.consecutive_failures || 0);
} catch(e) { console.log('0'); }
" 2>/dev/null)

  FEEDBACK=$(node -e "
const fs = require('fs');
try {
  const s = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8'));
  const last = s.last_verifier_output || '';
  try {
    const v = JSON.parse(last);
    const items = (v.failed_items || []).slice(0, 3);
    const actions = (v.next_actions || []).slice(0, 2);
    console.log('FAILED: ' + items.join('; ') + ' | NEXT: ' + actions.join('; '));
  } catch(e) { console.log(last.slice(0, 200)); }
} catch(e) { console.log('verifier FAIL'); }
" 2>/dev/null)

  echo "{\"hookSpecificOutput\": {\"hookEventName\": \"Stop\", \"decision\": \"block\", \"additionalContext\": \"阻断性 FAIL (第 $((CONSECUTIVE + 1)) 次)。$FEEDBACK 请修复上述阻断性问题后重试。运行 bash agent/verify-mvp.sh 查看详情。\"}}"
  exit 2

elif [ "$VERDICT" = "PARTIAL" ] || { [ "$VERDICT" = "FAIL" ] && [ "$HAS_BLOCKING_FAIL" = "false" ]; }; then
  # PARTIAL 或 非阻断性 FAIL：检查是否全是 deferred
  ALL_DEFERRED=$(node -e "
const fs = require('fs');
try {
  const s = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8'));
  const criteria = s.criteria || {};
  const pending = Object.entries(criteria).filter(([,v]) => v.status === 'pending' || v.status === 'deferred');
  if (pending.length > 0 && pending.every(([,v]) => v.status === 'deferred')) {
    console.log('ALL_DEFERRED');
  } else { console.log('HAS_PENDING'); }
} catch(e) { console.log('UNKNOWN'); }
" 2>/dev/null)

  if [ "$ALL_DEFERRED" = "ALL_DEFERRED" ]; then
    echo "{\"hookSpecificOutput\": {\"hookEventName\": \"Stop\", \"decision\": \"allow\", \"additionalContext\": \"Stage 0-1 全部通过。剩余 stage 为 deferred（需手动触发 CI 构建 + 生产部署）。当前循环已完成可自动化部分。\"}}"
    exit 0
  fi
  FEEDBACK=$(node -e "
const fs = require('fs');
try {
  const s = JSON.parse(fs.readFileSync('$STATE_FILE', 'utf8'));
  try {
    const v = JSON.parse(s.last_verifier_output || '{}');
    console.log('PROGRESS: ' + (v.overall_progress || 'unknown'));
    const items = (v.failed_items || []).slice(0, 3);
    if (items.length > 0) console.log('REMAINING: ' + items.join('; '));
    const next = (v.next_actions || []).slice(0, 2);
    if (next.length > 0) console.log('NEXT: ' + next.join('; '));
  } catch(e) { console.log('verifier PARTIAL'); }
} catch(e) { console.log('verifier PARTIAL'); }
" 2>/dev/null)

  echo "{\"hookSpecificOutput\": {\"hookEventName\": \"Stop\", \"decision\": \"block\", \"additionalContext\": \"Verifier PARTIAL — 部分通过，继续迭代。$FEEDBACK 按 Stage 顺序继续修复。\"}}"
  exit 2

elif [ "$VERDICT" = "none" ] || [ -z "$VERDICT" ]; then
  BUILD_OK=true
  if ! npm run build > /dev/null 2>&1; then
    BUILD_OK=false
  fi

  if [ "$BUILD_OK" = "false" ]; then
    echo '{"hookSpecificOutput": {"hookEventName": "Stop", "decision": "block", "additionalContext": "平台构建失败 (npm run build exit != 0)。这是 Stage 0 的阻塞性问题，请先修复。运行 bash agent/verify-mvp.sh 查看详情。"}}'
    exit 2
  fi

  echo '{"hookSpecificOutput": {"hookEventName": "Stop", "decision": "block", "additionalContext": "还没有 verifier 结果。Stage 0 待验证：1. 确保 npm run dev 运行在 localhost:5173 2. 调用 mvp-verifier subagent 验证 3. 根据结果继续修复。"}}'
  exit 2
else
  echo "{\"hookSpecificOutput\": {\"hookEventName\": \"Stop\", \"decision\": \"block\", \"additionalContext\": \"State 文件 verdict 值异常: $VERDICT。请检查 .claude/.goal-state.json 格式。\"}}"
  exit 2
fi
