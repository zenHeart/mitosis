# Mitosis — 执行目标

> **背景参阅:** [docs/done.md](./done.md)（问题详情 + 修复 rationale）  
> **架构参阅:** [README.md](../README.md)（三阶段流程、约束条件）  
> **部署参阅:** [docs/deployment.md](./deployment.md)

---

## 执行清单

### P0 — Bug 修复

#### BUG-1: useStepFun.ts 默认模型名不匹配

- **文件:** `src/composables/useStepFun.ts` 第 1 行
- **改:** `step-2-16k` → `step-3.7-flash`（与 `mitosis.yml` 中 `--model step-3.7-flash` 一致）
- **验:** `npm run build` 通过；Workspace 中 AI 对话使用 `step-3.7-flash`（Network 面板确认请求 payload）

---

### P0 — 功能实现

#### FEAT-1: 部署的应用包含 Mitosis 自举入口

- **文件:** `worker/prompt.txt` + `apps/tetris-game/v1/`（补全参考模板）
- **改:**
  1. `worker/prompt.txt` 增加步骤：创建 `.claude/settings.json`（模板，token 用占位符 `__STEP_TOKEN__`）、`.github/workflows/mitosis.yml`（简化版）、入口页面上的"基于此继续创造"按钮
  2. 用 `apps/tetris-game/v1/` 手动补全上述文件作为参考模板
- **验:** 访客访问部署的应用页面 → 看到"基于此继续创造"入口 → 点击后能进入 GitHub 登录 → 可基于该应用创建新应用

#### FEAT-2: 调用 `verifyRepoOwnership()`

- **文件:** `src/composables/useAuth.ts`（函数已存在）+ `src/components/SetupPage.vue`
- **改:** SetupPage 在 OAuth 成功后调用 `verifyRepoOwnership(token, userLogin)`；非 owner 显示创建仓库指引，owner 正常进入配置
- **验:** 非 zenHeart 用户登录后 SetupPage 显示仓库创建引导；zenHeart 用户正常进入 Step Token 配置

#### FEAT-3: 拆分 ChatInput 独立组件

- **新建:** `src/components/ChatInput.vue`
- **改:** 从 `Workspace.vue` 提取输入区域（textarea + send button），组件接收 `disabled`/`placeholder`/`modelValue` props，emit `send` 和 `update:modelValue` 事件
- **验:** `npm run build` 通过；Workspace 功能不变，`src/components/ChatInput.vue` 存在且被引用

---

### 用户配置（P0 — 需用户手动完成，Agent 仅提供指引）

| # | 配置项 | 操作 | 参考 |
|---|--------|------|------|
| 1 | GitHub OAuth App | 在 GitHub Settings → OAuth Apps 创建，Callback URL 填 `https://mitosis.zenheart.site/auth/callback` | [docs/oauth-setup.md](./oauth-setup.md) |
| 2 | `.env` 文件 | 项目根目录创建 `.env`，添加 `VITE_GITHUB_CLIENT_ID=你的ClientID` | — |
| 3 | `STEP_TOKEN` Secret | `gh secret set STEP_TOKEN --repo zenHeart/mitosis --body "你的Token"` | — |
| 4 | Cloudflare Worker | `cd worker && npm install && npx wrangler login && npx wrangler secret put GITHUB_CLIENT_ID && npx wrangler secret put GITHUB_CLIENT_SECRET && npx wrangler deploy` | [README.md](../README.md) §OAuth 后端代理 |

---

## 验收总 checklist

### Bug 修复
- [ ] BUG-1: AI 对话使用 `step-3.7-flash`（Network 面板确认）

### 功能
- [ ] FEAT-1: 部署的应用有"基于此继续创造"入口，tetris-game v1 包含自举文件
- [ ] FEAT-2: 非 owner 登录后 SetupPage 行为正确
- [ ] FEAT-3: `ChatInput.vue` 独立存在且功能正常

### 自举闭环
- [ ] 访客访问应用 → 看到自举入口 → 点击 → 登录 → 基于该应用创建新应用 → 新应用包含原应用功能
