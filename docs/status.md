# Mitosis 项目状态总览

> **最后更新:** 2026-06-19
> **目标 URL:** `http://blog.zenheart.site/mitosis/`

## 当前状态

```
整体进度: ████░░░░░░░░░░░░░░░░ 15%

Phase 1  ████████░░░░░░░░░░░░ 40% (部分就绪)
Phase 2  ░░░░░░░░░░░░░░░░░░░░  0%
Phase 3  ░░░░░░░░░░░░░░░░░░░░  0%
Phase 4  ░░░░░░░░░░░░░░░░░░░░  0%
Phase 5  ░░░░░░░░░░░░░░░░░░░░  0%
Phase 6  ░░░░░░░░░░░░░░░░░░░░  0%
Phase 7  ░░░░░░░░░░░░░░░░░░░░  0%
Phase 8  ░░░░░░░░░░░░░░░░░░░░  0%
```

## 就绪项 ✅

- [x] 项目架构设计（README.md）
- [x] StepFun API 配置（.claude/settings.local.json）
- [x] GitHub CLI 认证（zenHeart 账号）
- [x] Git 全局配置
- [x] .gitignore 配置
- [x] 目标文档（target.md）
- [x] 文档集（docs/ 目录）
  - [x] oauth-setup.md — OAuth App 配置指南
  - [x] deployment.md — 单仓库 GitHub Pages 部署指南
  - [x] agent-loop.md — Agent Loop 技术规格
  - [x] info-needed.md — 用户需提供的信息清单

## 待执行项 ❌

### Phase 1 — 基础设施搭建
- [ ] 创建 `zenHeart/mitosis` GitHub 仓库
- [ ] 用户创建 GitHub OAuth App
- [ ] 初始化本地 Git 仓库并 push

### Phase 2 — 项目脚手架
- [ ] package.json + 依赖安装
- [ ] TypeScript 配置（strict 模式）
- [ ] Vite 配置（base: '/mitosis/'）
- [ ] 目录结构创建

### Phase 3 — GitHub OAuth 认证
- [ ] useAuth.ts composable
- [ ] LoginPage 组件
- [ ] OAuth callback 处理
- [ ] 仓库所有权验证

### Phase 4 — 初始化配置
- [ ] SetupPage 组件
- [ ] Step Token 验证
- [ ] 初始化完成

### Phase 5 — 工作区界面
- [ ] Workspace 布局（侧边栏 + 对话区）
- [ ] AppCard 组件
- [ ] Issue 创建流程
- [ ] 状态轮询

### Phase 6 — GitHub Actions
- [ ] mitosis.yml workflow
- [ ] Agent Loop 指令模板
- [ ] GitHub Secrets 配置（STEP_TOKEN, OAuth 凭证）

### Phase 7 — 部署
- [ ] 启用 GitHub Pages（`zenHeart/mitosis` 仓库）
- [ ] DNS 验证
- [ ] 访问验证

### Phase 8 — 自举验证
- [ ] 端到端测试
- [ ] 自举循环验证

## 阻塞项

| 阻塞原因 | 影响 | 解决方案 |
|----------|------|----------|
| 需用户创建 OAuth App | Phase 1-3 | 用户自行创建并提供 Client ID/Secret |
| 需用户确认 StepFun Token | Phase 6 | 用户确认使用 settings.local.json 中的 Token |

## 关键决策记录

| 决策 | 原始方案 | 最终方案 | 原因 |
|------|----------|----------|------|
| 部署策略 | 跨仓库推送到 zenHeart.github.io | 单仓库 GitHub Pages | 简化架构，无需 PAT |
| OAuth App | Agent 自动创建 | 用户自行创建 | 安全考虑 |
| Secrets | MITOSIS_PAT (PAT) | GITHUB_OAUTH_CLIENT_ID/SECRET + STEP_TOKEN | 仓库 public，最小权限 |

## 相关文档

| 文档 | 说明 |
|------|------|
| [target.md](../target.md) | 完整执行目标文档 |
| [README.md](../README.md) | 项目架构文档 |
| [docs/oauth-setup.md](./oauth-setup.md) | GitHub OAuth 配置指南 |
| [docs/deployment.md](./deployment.md) | 部署指南（单仓库 Pages） |
| [docs/agent-loop.md](./agent-loop.md) | Agent Loop 技术规格 |
| [docs/info-needed.md](./info-needed.md) | 需用户提供的信息 |
