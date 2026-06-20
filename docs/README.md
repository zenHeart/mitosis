# Mitosis 文档地图

`docs/` 保存长期核心信息。当前目标和执行状态不放在这里，而放在根目录 `goal.md` 与 `agent/`。

## 阅读顺序

| 顺序 | 文档 | 用途 |
|------|------|------|
| 1 | [overview.md](overview.md) | 产品目标、MVP 范围、自举闭环 |
| 2 | [architecture.md](architecture.md) | 当前代码结构和端到端数据流 |
| 3 | [setup.md](setup.md) | GitHub OAuth、StepFun、Cloudflare Worker 配置 |
| 4 | [deployment.md](deployment.md) | GitHub Pages 部署和 Vite base 语义 |
| 5 | [agent-loop.md](agent-loop.md) | CI Agent Loop 和 `--bare` 执行路径 |
| 6 | [quality.md](quality.md) | P1/P2/P3/F 质量标准和验收门控 |
| 7 | [security.md](security.md) | 密钥、敏感信息和本地文件规则 |
| 8 | [decisions.md](decisions.md) | ADR 决策记录 |
| 9 | [history.md](history.md) | 已完成里程碑和经验摘要 |

## 非 docs 入口

| 文件 | 用途 |
|------|------|
| [../README.md](../README.md) | 项目目标、核心架构、文档总入口 |
| [../AGENT.md](../AGENT.md) | Agent 总入口 |
| [../goal.md](../goal.md) | 当前唯一活跃目标 |
| [../CLAUDE.md](../CLAUDE.md) | Claude Code 官方项目入口 |
| [../.claude/rules/goal-loop.md](../.claude/rules/goal-loop.md) | 本地 Claude Code `/goal` 规则 |
| [../agent/README.md](../agent/README.md) | Agent 执行文档入口 |
