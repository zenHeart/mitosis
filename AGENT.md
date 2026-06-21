# AGENT.md

你在 Mitosis 仓库中工作。Mitosis 的核心目标是通过 `mitosis.zenheart.site` 页面自举迭代 Mitosis 本身，并创建和迭代应用。

## 开工顺序

1. 读 [goal.md](goal.md)：当前唯一活跃目标、范围、验收标准。
2. 读 [CLAUDE.md](CLAUDE.md) 和 [.claude/skills/setgoal/SKILL.md](.claude/skills/setgoal/SKILL.md)：本地 Claude Code 项目规则。
3. 读 [docs/goals/README.md](docs/goals/README.md)：Agent 工作流入口。
4. 按 [docs/quality.md](docs/quality.md) 和 [docs/goals/acceptance.md](docs/goals/acceptance.md) 验收。

## 不可违反

- 只做 `goal.md` 范围内的工作，不顺手重构。
- 不读取、复制、提交 `.claude/settings.local.json` 或任何真实 token/key。
- 不给虚假通过。没有 fresh verifier 结果，就不能说完成。
- 平台主站 Vite `base: '/'`；Agent 生成应用 Vite `base: './'`。
- CI 路径使用 `--bare`，不能依赖本地 hooks、MCP、subagent、`.claude/rules/*` 或 `CLAUDE.md` 自动加载。

## 标准命令

```text
/goal Read goal.md and follow CLAUDE.md plus .claude/skills/setgoal/SKILL.md, complete all acceptance criteria, include verifier PASS and command outputs in the transcript, stop after 20 turns if blocked.
```

## 文档入口

- 项目总览：[README.md](README.md)
- 长期文档：[docs/README.md](docs/README.md)
- Agent 执行：[docs/goals/README.md](docs/goals/README.md)
- CI Loop：[docs/agent-loop.md](docs/agent-loop.md)
- 安全规则：[docs/security.md](docs/security.md)
