---
name: stop-hook-reentry-guard
description: Stop hooks must detect re-entry conditions (CLAUDE_CODE_STOP_HOOK_ACTIVE) to prevent deadlock from consecutive blocks
metadata: 
  node_type: memory
  type: reference
  originSessionId: 725bec4d-6db0-475b-b6b9-b3c430755295
---

# Stop Hook 必须检测重入条件防止死锁

## 问题

当 Stop hook 连续多次返回 `block` 时，Claude Code 系统会设置 `CLAUDE_CODE_STOP_HOOK_ACTIVE=true` 强制要求放行。如果 hook 不检测此变量，会导致：
1. 系统报错：`'9 consecutive times' 强制覆盖`
2. Hook 陷入无限 block 死循环

## 规则

1. **Stop hook 必须在逻辑最开始检测 `CLAUDE_CODE_STOP_HOOK_ACTIVE`**
2. 如果该变量为 `true`，立即返回 `allow`，不执行任何其他逻辑
3. 此检测是所有后续逻辑的前置条件

## 正确写法

```bash
#!/bin/bash
# ── 系统覆盖检测 ──────────────────────────────────────────────
# 当 stop hook 连续多次 block 时，系统会设置此变量要求 hook 放行
if [ "${CLAUDE_CODE_STOP_HOOK_ACTIVE:-}" = "true" ]; then
  echo '{"hookSpecificOutput": {"hookEventName": "Stop", "decision": "allow", "additionalContext": "系统覆盖：连续多次 block 后强制放行。"}}'
  exit 0
fi

# ← 其他逻辑（读取 state、检查 verifier 等）放在这里
```

## 教训来源

- `ed12279` — stop-verifier.sh 检测 CLAUDE_CODE_STOP_HOOK_ACTIVE 防止连续 block 死循环
- `9bd8145` — 最终移除 stop-verifier.sh hook 及相关配置（MVP 完成后不再需要）

## 相关记忆

- [[use-worktree-for-branch-operations]] — Git 操作注意事项
