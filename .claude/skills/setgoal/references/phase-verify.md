# Phase C: 验证结果

## 验证方法

### 1. 安全审计（前置）

每轮 Phase C 必须先调用 `security-audit` skill，通过后才能继续：

```bash
Skill(skill: "security-audit")
```

执行 5 步快速扫描：
1. **敏感数据泄露** — rg 扫描 token/secret/非 VITE_ env var
2. **DOMPurify 配置** — 验证 ALLOWED_TAGS/ALLOWED_ATTR/on* 排除
3. **CI Owner 门控** — 检查 workflow 中的 owner 验证
4. **脱敏逻辑** — 检查 password/token/secret → *** 替换
5. **fetchWithTimeout** — 检查所有 fetch 调用是否带 timeout

**判定规则：**
- FAIL → 立即停止，回退修改，修复后再继续
- WARN → 继续执行，但需要人工确认
- PASS → 继续 verifier 验证

### 2. 功能验证（Verifier 脚本）

```bash
# 运行对应 verifier
bash .claude/skills/setgoal/verifiers/<name>.sh

# 或使用 mvp-verifier agent
```

### 3. UX 审查（功能验收通过后）

当 mvp-verifier 返回 PASS 后，执行 UX Review Engine：

**本地模式：**
```
Skill(skill: "ux-lead-auditor")
```

**CI 模式：**
```bash
bash .claude/skills/setgoal/review-engine/verifiers/ux-review.sh incremental
```

**UX 审查触发条件：**
- 功能验收通过（mvp-verifier PASS）
- 用户要求优化体验（/ux-polish）
- PR 评论触发（/ux-check）

**UX 审查模式：**
- 增量模式（默认）— 只审查变更文件影响的维度
- 全量模式（`full`）— 审查所有维度 + 回归检测

### 4. 使用 mvp-verifier Agent

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
