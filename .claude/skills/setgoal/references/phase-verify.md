# Phase C: 验证结果

## 验证方法

### 1. 使用 Verifier 脚本

```bash
# 运行对应 verifier
bash .claude/skills/setgoal/verifiers/<name>.sh

# 或使用 mvp-verifier agent
```

### 2. 使用 mvp-verifier Agent

当需要端到端验证时，调用 `mvp-verifier` subagent：

```
Agent(name: "mvp-verifier", prompt: "验证目标: <目标描述>。读 goal.md 和 .claude/.goal-state.json，执行验证。输出严格 JSON。")
```

## Verdict 判定

| 条件 | Verdict |
|------|---------|
| 所有 criteria PASS/SKIPPED，无 FAIL | PASS |
| 1-2 个非阻断性 FAIL | PARTIAL |
| 阻断性 FAIL（平台构建失败、安全扫描发现 token） | FAIL |
| Phase 1 全部 SKIPPED 但 Phase 2/3 通过 | PARTIAL |

## 更新 State

```json
{
  "last_verdict": "PASS|FAIL|PARTIAL",
  "last_verifier_output": "<JSON 输出>",
  "criteria": {
    "<id>": {
      "status": "pass|fail",
      "last_result": "<详情>",
      "attempts": <N>
    }
  },
  "consecutive_failures": <N>
}
```

## 判断继续/停止

- **PASS** → 尝试停止，输出验收报告
- **FAIL/PARTIAL** → 记录失败原因，回到 Phase B 修复
