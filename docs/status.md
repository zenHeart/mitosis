# Mitosis 项目状态总览

> **最后更新:** 2026-06-20
> **目标 URL:** `https://mitosis.zenheart.site`

## 文档索引

| 文档 | 说明 |
|------|------|
| [target.md](../target.md) | **当前执行目标** — 待修复的 bug、待实现的功能、验收标准 |
| [done.md](./done.md) | 已完成工作记录 — 项目基线 + 审计发现的所有问题 |
| [README.md](../README.md) | 项目架构文档 — 三阶段流程、约束条件、路线图 |
| [oauth-setup.md](./oauth-setup.md) | GitHub OAuth 配置指南 |
| [deployment.md](./deployment.md) | 部署指南（gh-pages 分支 + CNAME） |
| [agent-loop.md](./agent-loop.md) | Agent Loop 技术规格 |

## 当前状态

```
整体进度: ████████████████████░  85%

代码实现:   ██████████████████░░  85%  (1 bug, 4 gap)
配置就绪:   ██████░░░░░░░░░░░░░░  30%  (缺 .env, Secrets, Worker secrets)
文档一致:   ████████████████░░░░  75%  (已修正 deployment.md)
```

## 已就绪 ✅

- [x] 项目架构设计（README.md）
- [x] GitHub 仓库创建 (`zenHeart/mitosis`)
- [x] GitHub Pages 部署（`https://mitosis.zenheart.site` 已可访问）
- [x] 项目脚手架（Vue 3 + TS + Vite，构建通过）
- [x] GitHub OAuth 认证流程（LoginPage + useAuth composable + Worker 代理）
- [x] SetupPage 初始化配置（Step Token 验证 + Secret 配置指引）
- [x] Workspace 工作区（侧边栏 + 对话区 + Issue 创建 + 轮询）
- [x] GitHub Actions 工作流（mitosis.yml + deploy.yml）
- [x] 版本化部署结构（apps/{name}/v{n}/）
- [x] 文档集（docs/ 目录）
- [x] 匿名用户 Gallery 浏览（public GitHub API）
- [x] Owner 门控（Workspace 仅 repo owner 可构建）
- [x] Tetris 游戏 v1 构建并部署（apps/tetris-game/v1/）

## 待完成项

| # | 类型 | 事项 | 优先级 |
|---|------|------|--------|
| 1 | Bug | `useStepFun.ts` 模型名 `step-2-16k` → `step-3.7-flash` | P0 |
| 2 | 功能 | 部署应用增加自举入口（`.claude/` + `.github/workflows/` + "继续创造"按钮） | P0 |
| 3 | 功能 | SetupPage 调用 `verifyRepoOwnership()` | P1 |
| 4 | 功能 | 拆分 ChatInput 独立组件 | P2 |
| 5 | 文档 | README.md OAuth callback URL 修正为 CNAME 域名 | P2 |

## 待用户配置

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 创建 GitHub OAuth App | 在 GitHub Settings → OAuth Apps 创建，Callback URL 填 `https://mitosis.zenheart.site/auth/callback` |
| 2 | 添加 Client ID 到环境 | 在项目根目录创建 `.env` 文件，添加 `VITE_GITHUB_CLIENT_ID=你的ClientID` |
| 3 | 配置 GitHub Secrets | 在仓库 Settings → Secrets 添加 `STEP_TOKEN`（StepFun API Key） |
| 4 | 部署 Cloudflare Worker | `cd worker && npm install && npx wrangler login && npx wrangler secret put GITHUB_CLIENT_ID && npx wrangler secret put GITHUB_CLIENT_SECRET && npx wrangler deploy` |

## 阻塞项

| 阻塞原因 | 影响 | 解决方案 |
|----------|------|----------|
| 需用户创建 OAuth App | 登录功能不可用 | 用户自行创建并提供 Client ID |
| 需用户添加 STEP_TOKEN | Agent Loop 不可用 | 用户在 GitHub Secrets 中添加 STEP_TOKEN |
| 需用户部署 Cloudflare Worker | OAuth token 兑换不可用 | 用户部署 Worker 并配置 secrets |

## 关键决策记录

| 决策 | 原始方案 | 最终方案 | 原因 |
|------|----------|----------|------|
| 部署策略 | 跨仓库推送到 zenHeart.github.io | 单仓库 gh-pages 分支 | 简化架构，无需 PAT |
| OAuth App | Agent 自动创建 | 用户自行创建 | 安全考虑 |
| Secrets | MITOSIS_PAT (PAT) | GITHUB_OAUTH_CLIENT_ID/SECRET + STEP_TOKEN | 仓库 public，最小权限 |
| 默认分支 | main | master | 匹配 GitHub 创建默认分支 |
| 部署分支 | 仓库根目录 master | 独立分支 gh-pages | GitHub Pages 支持独立分支 |
| 部署路径 | 子路径 `/mitosis/` | 根路径 `/`（CNAME 方式） | 简化路径，CNAME 直接映射 |

## 相关文档

| 文档 | 说明 |
|------|------|
| [target.md](../target.md) | 当前执行目标（自包含，含所有上下文） |
| [done.md](./done.md) | 已完成工作记录与审计问题清单 |
| [README.md](../README.md) | 项目架构文档 |
| [oauth-setup.md](./oauth-setup.md) | GitHub OAuth 配置指南 |
| [deployment.md](./deployment.md) | 部署指南（gh-pages 分支 + CNAME） |
| [agent-loop.md](./agent-loop.md) | Agent Loop 技术规格 |
