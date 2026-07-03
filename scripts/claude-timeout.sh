#!/usr/bin/env bash
# claude-timeout.sh — claude -p 的硬超时包装器
# 解决 timeout/setsid 无法有效杀掉 claude 子进程的问题
# 用法: claude-timeout.sh <seconds> [claude args...]
set -euo pipefail

MAX_SECONDS="${1:-900}"
shift

# 启动后台 watchdog：超时后杀掉整个进程组
(
  sleep "$MAX_SECONDS"
  # 杀掉此脚本所在的整个进程组（包括前台 claude）
  kill -- -$$ 2>/dev/null || true
) &
WATCHDOG_PID=$!

# 确保脚本退出时杀掉 watchdog
cleanup() {
  kill "$WATCHDOG_PID" 2>/dev/null || true
}
trap cleanup EXIT

# 在独立进程组中运行 claude
setsid "$@" &
CLAUDE_PID=$!

# 等待 claude 完成
wait "$CLAUDE_PID" 2>/dev/null || true
EXIT_CODE=$?

# 清理 watchdog
cleanup
trap - EXIT

exit "$EXIT_CODE"
