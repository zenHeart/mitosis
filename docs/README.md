# 文档地图

`docs/` 保存长期技术架构和规范。`docs/product/` 保存产品需求、功能设计和业务决策。

## 阅读顺序

| 顺序 | 文档 | 用途 |
|------|------|------|
| 1 | [product/overview.md](product/overview.md) | 产品目标、MVP 范围、自举闭环 |
| 2 | [architecture.md](architecture.md) | 代码结构、数据流、技术架构 |
| 3 | [setup.md](setup.md) | GitHub OAuth、StepFun、Cloudflare Worker 配置 |
| 4 | [agent-loop.md](agent-loop.md) | 单次 Plan/Execute、候选 artifact、独立 verifier 和人工发布闸门 |
| 5 | [quality.md](quality.md) | P1/P2/P3/F 质量标准和验收门控 |
| 6 | [security.md](security.md) | 密钥、敏感信息和本地文件规则 |
| 7 | [decisions.md](decisions.md) | ADR 决策记录 |
| 8 | [history.md](history.md) | 已完成里程碑和经验摘要 |
| 9 | [goals/README.md](goals/README.md) | Agent 运行时入口 |
| 10 | [.claude/skills/setgoal/review-engine/README.md](../.claude/skills/setgoal/review-engine/README.md) | UX Review Engine 使用指南 |

## docs/product/ — 产品需求文档

| 文档 | 用途 |
|------|------|
| [product/overview.md](product/overview.md) | 产品目标、MVP 范围、自举闭环 |
| [product/deployment.md](product/deployment.md) | 部署策略、GitHub Pages、Vite base 语义 |
| [product/chat-session-design.md](product/chat-session-design.md) | 聊天会话管理架构设计（Issue-backed sessions） |

## 非 docs 入口

| 文件 | 用途 |
|------|------|
| [../README.md](../README.md) | 项目目标、核心架构、文档总入口 |
| [../AGENT.md](../AGENT.md) | Agent 总入口 |
| [../goal.md](../goal.md) | 当前唯一活跃目标 |
| [../CLAUDE.md](../CLAUDE.md) | Claude Code 官方项目入口 |
| [../.claude/skills/setgoal/SKILL.md](../.claude/skills/setgoal/SKILL.md) | 本地 Claude Code `/goal` 规则 |
| [goals/README.md](goals/README.md) | Agent 执行文档入口 |
