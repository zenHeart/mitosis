# Mitosis — 已完成工作记录

> **创建日期:** 2026-06-20  
> **最后更新:** 2026-06-20（结合代码实际状态修正）  
> **对应阶段:** Phase 0 — 项目审计 + Phase 1-7 大部分完成  
> **后续文档:** [target.md](./target.md) — 待执行清单（自包含）

---

## 1. 项目基线

截至 2026-06-20，已完成以下内容：

| 类别 | 内容 | 状态 |
|------|------|------|
| 项目架构 | README.md — 三阶段流程、架构设计、约束条件 | ✅ |
| GitHub 仓库 | `zenHeart/mitosis` (public)，默认分支 `master` | ✅ |
| GitHub Pages | `mitosis.zenheart.site` 已部署（CNAME → `zenHeart.github.io`） | ✅ |
| 项目脚手架 | Vue 3 + TS strict + Vite，`npm install` / `build` / `vue-tsc` 均通过 | ✅ |
| 前端组件 | LoginPage, SetupPage, Workspace, Gallery, AppCard | ✅ |
| 状态管理 | Pinia auth store（sessionStorage token + localStorage setup 标记） | ✅ |
| Composables | useAuth (OAuth + verifyRepoOwnership), useGitHubAPI (Issue/App CRUD), usePolling, useStepFun | ✅ |
| TypeScript 类型 | `auth.ts` (GitHubUser, AuthState), `app.ts` (AppInfo, BuildIssue) | ✅ |
| CI/CD | `mitosis.yml` (Issue 触发 Agent Loop) + `deploy.yml` (push → gh-pages) | ✅ |
| Cloudflare Worker | `worker/src/index.ts` — OAuth token 兑换代理（解决 CORS），已部署 | ✅ |
| Worker 配置 | `worker/wrangler.jsonc`, `worker/prompt.txt` (Agent prompt 模板) | ✅ |
| SPA 路由 | `public/404.html` — OAuth callback + `/apps/{name}/` fallback | ✅ |
| 版本化应用 | `apps/tetris-game/v1/` — 完整 Tetris 游戏（Vue 3 + TS + Vite） | ✅ |
| Git 忽略 | `.gitignore` — 正确处理 dist / node_modules / .env / app 产物 | ✅ |
| 文档集 | `docs/` 下 5 份文档 | ✅ |
| 匿名浏览 | Gallery 组件从 public GitHub API 读取应用列表，无需登录 | ✅ |
| Owner 门控 | Workspace 的聊天/构建功能限制为 repo owner (zenHeart) | ✅ |
| 构建产物部署 | deploy.yml 构建后推送到 gh-pages 分支，应用可直接访问 | ✅ |

---

## 2. 当前代码状态（经审计确认）

### 2.1 已验证正常工作的部分

#### Auth 流程（用户确认已走通）
- 404.html 将 `/auth/callback` 的 code 存入 sessionStorage 后 redirect 到 `/`
- LoginPage.vue `onMounted` 读取 code → 通过 Worker 兑换 token → 保存 session → emit login-success
- `defineEmits` 在 `<script setup>` 中作为 compiler macro 会被提升，`emit` 在 `onMounted` 中可用
- **结论：Auth 流程完整可用，无需修复**

#### 聊天 → Issue → Actions → Agent Loop 流程（代码已实现）
- Workspace.vue `handleSend()` → `chatWithStepFun()` → 正则匹配 `BUILD_APP: {name}` → `createIssue()` 
- createIssue 调用 GitHub API 创建带 `app/{name}` label 的 Issue
- mitosis.yml 触发条件：`issues: [opened, labeled]` + `issue_comment: [created]`（需 `/build` 命令）
- Agent Loop 使用 `claude -p --model step-3.7-flash` 执行 prompt.txt 中的构建指令
- 构建产物通过 deploy.yml 推送到 gh-pages 分支
- **结论：流程代码完整，但尚未通过 Web UI 端到端验证**

### 2.2 仍需修复/实现的问题

| # | 类型 | 文件 | 问题 | 优先级 |
|---|------|------|------|--------|
| 1 | Bug | `src/composables/useStepFun.ts:1` | 默认模型 `step-2-16k` 应为 `step-3.7-flash` | P0 |
| 2 | Gap | `src/components/SetupPage.vue` | `verifyRepoOwnership()` 已定义但未调用 | P1 |
| 3 | Gap | `apps/tetris-game/v1/` | 缺少 `.claude/settings.json`、`.github/workflows/mitosis.yml`、自举 UI | P0 |
| 4 | Gap | `worker/prompt.txt` | Agent 构建应用时未 instruct 创建自举文件 | P0 |
| 5 | Gap | `src/components/ChatInput.vue` | 输入区域仍内联在 Workspace.vue 中，未拆分为独立组件 | P2 |

### 2.3 文档不一致（需修正）

| 文档 | 问题 | 修正 |
|------|------|------|
| `docs/deployment.md` | 写 `base: '/mitosis/'` | 实际 `vite.config.ts` 使用 `base: '/'`（CNAME 方式） |
| `README.md:74-75` | OAuth callback 写子路径 `https://<用户>.github.io/mitosis/auth/callback` | 实际用 CNAME 域名 `https://mitosis.zenheart.site/auth/callback` |
| `docs/status.md` | 完成度标注 95%，Phase 8 标注 0% | 需根据实际状态调整 |

---

## 3. 审计结论

```
整体完成度: ██████████████████░░  85%

代码实现:   ██████████████████░░  85%  (1 bug, 4 gap)
配置就绪:   ██████░░░░░░░░░░░░░░  30%  (缺 .env, Secrets, Worker secrets)
文档一致:   ████████████████░░░░  75%  (deployment.md, README.md 有误)
```

**最大阻塞项:**
1. `useStepFun.ts` 模型名错误 — 导致 AI 对话使用错误/过时的模型
2. 自举闭环未完成 — 部署的应用缺少"基于此继续创造"能力
