# Goal Loop Rules — Executor + Verifier 双 Agent 协议

## 核心循环（每 turn）

```
Executor turn 完成
  → 调用 mvp-verifier subagent（独立上下文）
  → Verifier 返回 JSON 报告
  → Executor 更新 .claude/.goal-state.json
  → Executor 尝试停止
  → Stop hook 拦截，检查 state 中的 verdict
  → verdict=PASS → 允许停止
  → verdict=FAIL → block + additionalContext → Executor 继续
```

## 每 turn 的执行步骤

1. **读状态** — 读 `.claude/.goal-state.json`，提取未通过 criteria 和上一轮反馈
2. **读目标** — 读 `goal.md`，确认当前需要验证的验收项
3. **选任务** — 选择下一个 `pending` 或 `fail` 的 criteria，一次只做 1 个
4. **执行** — 最小化修改实现该验收项
5. **构建** — 运行 `npm run build` + 相关命令
6. **调用 Verifier** — 使用 `Agent` 工具调用 `mvp-verifier` subagent，传入 goal.md + state 路径
7. **读 Verifier 报告** — 解析 JSON 输出，提取 `failed_items` 和 `next_actions`
8. **更新 State** — 写回 `.claude/.goal-state.json`，更新 criteria 状态和 `last_verdict`
9. **判断** —
   - `verdict=PASS` → 尝试停止 → Stop hook 确认 PASS → 允许停止 → 输出验收报告
   - `verdict=PARTIAL` → 基于 `next_actions` 继续修复
   - `verdict=FAIL` → 基于 `failed_items` 修复
10. **如果被 Stop hook block** → 读 `additionalContext` → 回到步骤 1

## State 文件格式（`.claude/.goal-state.json`）

```json
{
  "current_goal": "mitosis-mvp",
  "started_at": "2026-06-20T...",
  "turns_used": 0,
  "max_turns": 1000,
  "criteria": {
    "c1-anon-gallery": {
      "description": "匿名用户可以浏览 Gallery 并打开应用",
      "status": "pending|pass|fail",
      "attempts": 0,
      "last_result": "verifier 返回的 detail",
      "verifier_phase": "phase1-browser"
    }
  },
  "last_verdict": "PASS|FAIL|PARTIAL|null",
  "last_verifier_output": "verifier subagent 的完整 JSON 输出",
  "feedback_history": ["上一轮 verifier 的失败摘要"],
  "consecutive_failures": 0
}
```

## Stop Hook 行为

> **MVP 完成后已移除 stop hook**（2026-06-20）。以下为历史参考。

- 原文件 `.claude/hooks/stop-verifier.sh` 已删除
- 原因：MVP 闭环已完成（9/9 PASS），hook 始终返回 `allow`，无阻断价值
- 如需恢复，参考 git history 恢复该文件 + `settings.json` 中的 hooks 配置

## Verifier Subagent（`mvp-verifier`）

定义在 `.claude/agents/verifier.md`。

**三大阶段：**
- Phase 1: Playwright MCP 浏览器测试（匿名 Gallery → 登录 → Workspace 分流）
- Phase 2: Bash 构建验证（npm run build + verify-build.sh + 安全扫描）
- Phase 3: GitHub API 状态检查（Issue label + PR 状态）

**输出：** 严格 JSON，包含 `verdict` + `criteria_results` + `failed_items` + `next_actions`

## 判定规则

| 条件 | Verdict |
|------|---------|
| 所有 criteria PASS/SKIPPED，无 FAIL | PASS |
| 1-2 个非阻断性 FAIL | PARTIAL |
| 阻断性 FAIL（平台构建失败、安全扫描发现 token） | FAIL |
| Phase 1 全部 SKIPPED 但 Phase 2/3 通过 | PARTIAL |

**阻断性 FAIL：** 平台 `npm run build` 失败、安全扫描发现真实 token/key/secret、关键文件缺失

## Verifier 调用示例

```
# Executor turn 结束时，使用 Agent 工具调用:
Agent(name: "mvp-verifier", prompt: "验证 Mitosis MVP 验收标准。读 goal.md 和 .claude/.goal-state.json，执行 Phase 1 (Playwright)、Phase 2 (Bash)、Phase 3 (GitHub) 验证。输出严格 JSON。")
```

## 禁止事项

- 禁止声称通过而没有 Verifier 的 fresh JSON 输出
- 禁止同时修改多个验收项（一次一个）
- 禁止编辑 `.claude/.goal-state.json` 跳过失败项
- 禁止超过 1000 turn（足够完成任何 MVP 级目标）
- 禁止将 Verifier 的 SKIPPED 当作 PASS
- 禁止在 verifier 输出前停止

## 与 CI Loop 的关系

| 维度 | 本地 /goal | CI --bare |
|------|-----------|-----------|
| 机制 | Executor + Verifier subagent + Stop hook | Shell for-loop + verify-build.sh |
| 验证 | Playwright + Bash + GitHub MCP | verify-build.sh (构建+功能) |
| 重试 | 1000 turn 上限，verifier 驱动 | 3 次 attempt，shell 驱动 |
| 适用 | 平台流程验证（端到端） | 生成应用质量（构建产物） |
| 人工介入 | Stop hook block + 反馈 | draft PR + human review |
