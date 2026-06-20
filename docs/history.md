# History

本文档只保留高信号历史，不复制长日志。

## 2026-06-20 项目基线

- Vue 3 + TypeScript + Vite 平台脚手架完成。
- GitHub OAuth 登录流程接入 Cloudflare Worker。
- Workspace 可创建 GitHub Issue。
- GitHub Actions 可触发 Claude Code Agent Loop。
- Gallery 支持匿名浏览应用。
- `apps/tetris-game/v1` 作为首个生成应用存在。
- 自举入口通过 `?ref={app-name}` 回到主站。

## 2026-06-20 文档重构

- 根 README 收口为项目目标、架构、使用路径和文档导航。
- `docs/` 收口为长期核心信息。
- `agent/` 收口为执行、验收、目标队列和完成记录。
- `goal.md` 成为当前唯一活跃目标。
- `CLAUDE.md` 与 `.claude/rules/goal-loop.md` 成为本地 Claude Code 官方规则入口。
- CI 路径明确为 `--bare` + 显式 verifier loop。
- IssueOps 收口为 owner gate + verifier + draft PR review，不直接自动合入主干。

## 经验

- Prompt 变长不能替代验收门控。
- 本地 Claude Code loop 和 CI `--bare` 是两套执行环境，文档必须分开描述。
- `base: '/'` 和 `base: './'` 都正确，但适用对象不同。
- verifier 通过前 commit/deploy 会把低质量产物固化到 Pages。
