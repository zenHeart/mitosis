# Mitosis 项目状态总览

> **最后更新:** 2026-06-19
> **目标 URL:** `https://blog.zenheart.site/mitosis/`

## 当前状态

```
整体进度: ████████████████████░  95%

Phase 1  ████████████████████░  95% (仓库已创建，OAuth App 需用户手动配置)
Phase 2  ████████████████████░ 100% (项目脚手架完成，构建通过)
Phase 3  ████████████████████░  90% (OAuth 流程已实现，需用户提供 Client ID)
Phase 4  ████████████████████░ 100% (SetupPage 完成)
Phase 5  ████████████████████░ 100% (Workspace 完成)
Phase 6  ████████████████████░  90% (Workflow 完成，需用户添加 STEP_TOKEN Secret)
Phase 7  ████████████████████░ 100% (GitHub Pages 已部署，站点可访问)
Phase 8  ░░░░░░░░░░░░░░░░░░░░░   0% (待用户完成 OAuth + Token 配置后验证)
```

## 就绪项 ✅

- [x] 项目架构设计（README.md）
- [x] GitHub 仓库创建 (`zenHeart/mitosis`)
- [x] GitHub Pages 部署（`https://blog.zenheart.site/mitosis/` 已可访问）
- [x] 项目脚手架（Vue 3 + TS + Vite，构建通过）
- [x] GitHub OAuth 认证流程（LoginPage + useAuth composable）
- [x] SetupPage 初始化配置（Step Token 验证 + Secret 配置指引）
- [x] Workspace 工作区（侧边栏 + 对话区 + Issue 创建 + 轮询）
- [x] GitHub Actions 工作流（mitosis.yml）
- [x] 版本化部署结构（apps/{name}/v{n}/）
- [x] 文档集（docs/ 目录）
- [x] 构建产物部署（dist/ → 仓库根目录 → GitHub Pages）

## 待用户操作项

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 创建 GitHub OAuth App | 在 GitHub Settings → OAuth Apps 创建，Callback URL 填 `https://blog.zenheart.site/mitosis/callback` |
| 2 | 添加 Client ID 到环境 | 在项目根目录创建 `.env` 文件，添加 `VITE_GITHUB_CLIENT_ID=你的ClientID` |
| 3 | 配置 GitHub Secrets | 在仓库 Settings → Secrets 添加 `STEP_TOKEN`（StepFun API Key） |
| 4 | 访问验证 | 打开 https://blog.zenheart.site/mitosis/ 验证平台运行 |

## 阻塞项

| 阻塞原因 | 影响 | 解决方案 |
|----------|------|----------|
| 需用户创建 OAuth App | Phase 3 认证不可用 | 用户自行创建并提供 Client ID，填入 `.env` 文件 |
| 需用户添加 STEP_TOKEN | Phase 6 Agent Loop 不可用 | 用户在 GitHub Secrets 中添加 STEP_TOKEN |

## 关键决策记录

| 决策 | 原始方案 | 最终方案 | 原因 |
|------|----------|----------|------|
| 部署策略 | 跨仓库推送到 zenHeart.github.io | 单仓库 GitHub Pages | 简化架构，无需 PAT |
| OAuth App | Agent 自动创建 | 用户自行创建 | 安全考虑 |
| Secrets | MITOSIS_PAT (PAT) | GITHUB_OAUTH_CLIENT_ID/SECRET + STEP_TOKEN | 仓库 public，最小权限 |
| 默认分支 | main | master | 匹配 GitHub 创建默认分支 |
| 构建产物位置 | 独立分支 gh-pages | 仓库根目录 master | GitHub Pages 支持根目录部署 |

## 相关文档

| 文档 | 说明 |
|------|------|
| [target.md](../target.md) | 完整执行目标文档 |
| [README.md](../README.md) | 项目架构文档 |
| [docs/oauth-setup.md](./oauth-setup.md) | GitHub OAuth 配置指南 |
| [docs/deployment.md](./deployment.md) | 部署指南（单仓库 Pages） |
| [docs/agent-loop.md](./agent-loop.md) | Agent Loop 技术规格 |
| [docs/info-needed.md](./info-needed.md) | 需用户提供的信息 |
