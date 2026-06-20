# Agent Runtime

`agent/` 保存 Agent 执行当前目标所需的信息。长期产品和架构文档在 `docs/`。

## 开工顺序

1. [../goal.md](../goal.md) — 当前唯一活跃目标。
2. [../CLAUDE.md](../CLAUDE.md) 与 [../.claude/rules/goal-loop.md](../.claude/rules/goal-loop.md) — 本地 Claude Code 项目规则。
3. [loop.md](loop.md) — Agent loop 详细协议。
4. [acceptance.md](acceptance.md) — 完成前验收协议。
5. [verifier.md](verifier.md) — 本地与 CI verifier 输出格式。
6. [backlog.md](backlog.md) — MVP Now/Next/Done 队列。
7. [archive.md](archive.md) — 已完成 goal 摘要。

## 标准 `/goal`

```text
/goal Read goal.md and follow CLAUDE.md plus .claude/rules/goal-loop.md, complete all acceptance criteria, include verifier PASS and command outputs in the transcript, stop after 20 turns if blocked.
```

## 完成定义

一个 goal 只有在以下条件都满足时才算完成：

- `goal.md` 的验收标准全部满足。
- 相关验证命令已 fresh 运行。
- verifier PASS 出现在 transcript 中。
- 没有 P0/P1 未解释风险。
- `agent/backlog.md` 和 `agent/archive.md` 已按需更新。
