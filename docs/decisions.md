# Decisions

ADR 只追加，不重写历史语义。新决策应写明日期、状态、理由和替代方案。

## 已接受决策

| # | 决策 | 状态 | 理由 | 替代方案 |
|---|------|------|------|----------|
| ADR-001 | 单仓库 `gh-pages` 部署 | 接受 | 无需 PAT，GitHub Actions 可直接推送 | 独立仓库 per app |
| ADR-002 | 自举是页面驱动闭环 | 接受 | MVP 核心是通过 Mitosis 页面迭代平台和应用，不复制完整平台到每个应用 | 每个 app 自带完整 Mitosis |
| ADR-003 | Issue 正文是生成应用唯一权威规格 | 接受 | prompt 模板只能提供通用规则，不能覆盖用户需求 | prompt 类型指南优先 |
| ADR-004 | CI 使用 `--bare` | 接受 | GitHub Actions 需要可复现，不加载本地 hooks/MCP/CLAUDE | 加载项目 hooks，但 CI 不稳定 |
| ADR-005 | CI verifier 显式运行 | 接受 | `--bare` 不加载本地 loop，必须在 workflow 中运行 `verify-build.sh` | 依赖 Claude 自检 |
| ADR-006 | 平台主站 `base: '/'` | 接受 | CNAME 根路径部署 | 子路径部署 |
| ADR-007 | 生成应用 `base: './'` | 接受 | 应用部署到版本子目录，需要相对资源路径 | 绝对 `/assets/` |
| ADR-008 | OAuth 使用 Worker 代理 Authorization Code Flow | 接受 | GitHub Pages 是静态站点，client secret 不能放浏览器 | 浏览器保存 client secret |
| ADR-009 | 当前模型继续观察 `step-3.7-flash` | 观察 | 先通过 loop/verifier 提升质量，模型替换另行决策 | 立即切换模型 |
| ADR-010 | IssueOps owner gate | 接受 | 开源仓库中外部 Issue/评论不能直接触发写权限 Agent Loop | 信任所有 Issue |
| ADR-011 | 验证后 draft PR 审查 | 接受 | verifier 通过不等于业务通过，owner 审查后再合入主干部署 | 跳过人工审查 |
| ADR-012 | Issue-backed chat sessions | 接受 | 一个 GitHub Issue = 一个聊天 session，Issue comments = 消息持久化。天然支持历史恢复、owner 权限、CI 集成 | 自建后端存储 |
| ADR-013 | `/create` comment 显式触发 agent loop | 接受 | 防止误触，owner 明确确认后才触发构建。替代自动触发（issue opened → agent loop） | Issue opened 即触发 |
| ADR-014 | GFM 渲染 + DOMPurify XSS 防护 | 接受 | 消息支持 markdown 渲染（代码块、表格、任务列表），同时防止 XSS 攻击 | 纯文本渲染 |
| ADR-015 | 本地 mock 模式调试 | 接受 | 开发环境用 localStorage mock GitHub API，完整调试聊天功能后再走真实代理 | 直接依赖真实 GitHub API 调试 |

## 待决策

| 决策 | 待确认 |
|------|--------|
| 生成应用历史版本保留策略 | 长期保留全部 vN，还是仅保留最近 N 个 |
| 应用类型专项 verifier | 是否为游戏、工具、内容页分别生成 Playwright 测试模板 |
| Mitosis 自身迭代入口 | 何时从外部 GitHub Issue loop 迁移到应用内部 loop |
