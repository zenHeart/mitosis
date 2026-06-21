#!/usr/bin/env bash
# setgoal/scripts/archive.sh — 目标归档操作脚本
# 用法: bash archive.sh <command> [args]
# Commands: snapshot <goal-id> | summary <goal-id> | reset-state

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$(dirname "$(dirname "$SKILL_DIR")")")"
GOAL_HISTORY_DIR="$PROJECT_ROOT/docs/goal-history"
AGENT_ARCHIVE="$PROJECT_ROOT/docs/goals/archive.md"
AGENT_BACKLOG="$PROJECT_ROOT/docs/goals/backlog.md"
GOAL_STATE="$PROJECT_ROOT/.claude/.goal-state.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[archive]${NC} $1"; }
warn() { echo -e "${YELLOW}[archive]${NC} $1"; }
error() { echo -e "${RED}[archive]${NC} $1"; }

# Command: snapshot — 生成目标快照
cmd_snapshot() {
  local goal_id="${1:?用法: archive.sh snapshot <goal-id>}"
  local goal_file="$PROJECT_ROOT/goal.md"

  if [[ ! -f "$goal_file" ]]; then
    error "goal.md 不存在"
    exit 1
  fi

  mkdir -p "$GOAL_HISTORY_DIR"

  local date_stamp
  date_stamp=$(date -u +"%Y-%m-%d")
  local snapshot_file="$GOAL_HISTORY_DIR/${date_stamp}-${goal_id}.md"

  # Read verdict from state if available
  local verdict="unknown"
  local turns="0"
  if [[ -f "$GOAL_STATE" ]] && command -v jq &>/dev/null; then
    verdict=$(jq -r '.last_verdict // "unknown"' "$GOAL_STATE" 2>/dev/null || echo "unknown")
    turns=$(jq -r '.turns_used // 0' "$GOAL_STATE" 2>/dev/null || echo "0")
  fi

  # Count criteria
  local total=0 pass=0 fail=0
  if [[ -f "$GOAL_STATE" ]] && command -v jq &>/dev/null; then
    total=$(jq '.criteria | length' "$GOAL_STATE" 2>/dev/null || echo "0")
    pass=$(jq '[.criteria[].status] | map(select(. == "pass")) | length' "$GOAL_STATE" 2>/dev/null || echo "0")
    fail=$(jq '[.criteria[].status] | map(select(. == "fail")) | length' "$GOAL_STATE" 2>/dev/null || echo "0")
  fi

  cat > "$snapshot_file" << EOF
---
goal_id: ${goal_id}
archived_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
final_verdict: ${verdict}
criteria_total: ${total}
criteria_pass: ${pass}
criteria_fail: ${fail}
turns_used: ${turns}
---

$(cat "$goal_file")
EOF

  info "快照已保存: $snapshot_file"
  echo "$snapshot_file"
}

# Command: summary — 生成归档摘要并追加到 docs/goals/archive.md
cmd_summary() {
  local goal_id="${1:?用法: archive.sh summary <goal-id>}"
  local goal_title=""

  # Extract title from goal.md
  if [[ -f "$PROJECT_ROOT/goal.md" ]]; then
    goal_title=$(grep -m1 "^# Goal:" "$PROJECT_ROOT/goal.md" | sed 's/^# Goal: *//' || echo "$goal_id")
  fi

  local date_stamp
  date_stamp=$(date -u +"%Y-%m-%d")

  # Read state for stats
  local verdict="unknown" turns="0" total=0 pass=0
  if [[ -f "$GOAL_STATE" ]] && command -v jq &>/dev/null; then
    verdict=$(jq -r '.last_verdict // "unknown"' "$GOAL_STATE" 2>/dev/null || echo "unknown")
    turns=$(jq -r '.turns_used // 0' "$GOAL_STATE" 2>/dev/null || echo "0")
    total=$(jq '.criteria | length' "$GOAL_STATE" 2>/dev/null || echo "0")
    pass=$(jq '[.criteria[].status] | map(select(. == "pass")) | length' "$GOAL_STATE" 2>/dev/null || echo "0")
  fi

  # Determine next goal location
  local next_ref="待定"
  if [[ -f "$AGENT_BACKLOG" ]]; then
    local now_item
    now_item=$(grep -A1 "^## Now" "$AGENT_BACKLOG" | tail -1 | sed 's/^- //' || echo "")
    if [[ -n "$now_item" ]]; then
      next_ref="$now_item"
    fi
  fi

  # Check if archive.md has existing entries to determine GOAL-NNN
  local goal_num="001"
  if [[ -f "$AGENT_ARCHIVE" ]]; then
    local last_num
    last_num=$(grep -oP 'GOAL-\d+' "$AGENT_ARCHIVE" | tail -1 | sed 's/GOAL-//' || echo "000")
    goal_num=$(printf "%03d" $((10#$last_num + 1)))
  fi

  # Build archive entry using template
  local entry
  entry=$(cat << ENTRY

### GOAL-${goal_num}: ${goal_title}
- **Goal ID**: ${goal_id}
- **归档时间**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- **快照**: [docs/goal-history/${date_stamp}-${goal_id}.md](../goal-history/${date_stamp}-${goal_id}.md)
- **完成度**: ${pass}/${total} criteria ${verdict}
- **Turns**: ${turns}
- **关键交付**: C1-C${total} 全部完成
- **后续**: 下一代目标见 docs/goals/backlog.md → ${next_ref}
ENTRY
  )

  # Append to archive.md
  if [[ -f "$AGENT_ARCHIVE" ]]; then
    echo "$entry" >> "$AGENT_ARCHIVE"
  else
    echo "# Agent Archive

> 本文件由 setgoal Phase 0 自动维护。禁止手动编辑。
$entry" > "$AGENT_ARCHIVE"
  fi

  info "归档摘要已追加: $AGENT_ARCHIVE"
}

# Command: reset-state — 重置 .goal-state.json
cmd_reset_state() {
  local goal_id="${1:?用法: archive.sh reset-state <goal-id>}"
  local goal_desc=""

  if [[ -f "$PROJECT_ROOT/goal.md" ]]; then
    goal_desc=$(grep -m1 "^# Goal:" "$PROJECT_ROOT/goal.md" | sed 's/^# Goal: *//' || echo "$goal_id")
  fi

  cat > "$GOAL_STATE" << EOF
{
  "current_goal": "${goal_id}",
  "goal_description": "${goal_desc}",
  "started_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "last_goal_sync": null,
  "turns_used": 0,
  "max_turns": 1000,
  "current_stage": null,
  "stages": [],
  "criteria": {},
  "last_verdict": null,
  "last_verifier_output": null,
  "feedback_history": [],
  "consecutive_failures": 0,
  "goal_history": [],
  "blocked_criteria": [],
  "classification": "new"
}
EOF

  info "状态已重置: $GOAL_STATE"
}

# Main
case "${1:-}" in
  snapshot)
    cmd_snapshot "$2"
    ;;
  summary)
    cmd_summary "$2"
    ;;
  reset-state)
    cmd_reset_state "$2"
    ;;
  *)
    echo "用法: archive.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  snapshot <goal-id>    生成目标快照到 docs/goal-history/"
    echo "  summary <goal-id>     生成归档摘要追加到 docs/goals/archive.md"
    echo "  reset-state <goal-id> 重置 .goal-state.json"
    exit 1
    ;;
esac
