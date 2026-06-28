# Goals — 目标生命周期

`docs/goals/` 保存目标从活跃 → 队列 → 归档的完整生命周期。长期技术和架构文档在 `docs/` 根目录。

## 开工顺序

1. [/goal.md](/goal.md) — 当前唯一活跃目标。
2. [/CLAUDE.md](/CLAUDE.md) 与 [/.claude/skills/setgoal/SKILL.md](/.claude/skills/setgoal/SKILL.md) — 本地 Claude Code 项目规则。
3. [/docs/agent-loop.md](/docs/agent-loop.md) — Agent Loop 详细协议（含本地和 CI）。
4. [/docs/architecture.md](/docs/architecture.md) — 代码结构、数据流。
5. [acceptance.md](acceptance.md) — 完成前验收协议。
6. [verifier.md](verifier.md) — 本地与 CI verifier 输出格式。
7. [backlog.md](backlog.md) — MVP Now/Next/Done 队列。
8. [archive/README.md](archive/README.md) — 已完成 goal 归档索引 + 快照规则。
9. [/.claude/skills/setgoal/review-engine/README.md](../.claude/skills/setgoal/review-engine/README.md) — UX Review Engine（体验打磨）。

## 标准 `/goal`

```text
/goal Read goal.md and follow CLAUDE.md plus .claude/skills/setgoal/SKILL.md, complete all acceptance criteria, include verifier PASS and command outputs in the transcript, stop after 20 turns if blocked.
```

## 完成定义

一个 goal 只有在以下条件都满足时才算完成：

- `goal.md` 的验收标准全部满足。
- 相关验证命令已 fresh 运行。
- verifier PASS 出现在 transcript 中。
- 没有 P0/P1 未解释风险。
- `docs/goals/backlog.md` 和 `docs/goals/archive/README.md` 已按需更新。
- 功能验收通过后，UX Review Engine 已执行（增量模式），报告中无 critical/high 级别未处理问题。
