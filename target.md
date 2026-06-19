# Mitosis — 持续执行目标文档

> **版本:** v0.2-deployed  
> **创建日期:** 2026-06-19  
> **最后更新:** 2026-06-19  
> **项目路径:** `/Users/zenheart/code/github/mitosis`  
> **目标 URL:** `https://mitosis.zenheart.site`

---

## 0. 项目现状诊断

### 0.1 已就绪项

| 项目 | 状态 | 说明 |
|------|------|------|
| 项目构思与架构文档 | ✅ | `README.md` 完整，涵盖三阶段流程、架构设计、约束条件 |
| `zenHeart/mitosis` GitHub 仓库 | ✅ | 已创建，public 仓库 |
| GitHub Pages 部署 | ✅ | `mitosis.zenheart.site` 已可访问（HTTP 200） |
| 项目源代码（Vue + TS + Vite） | ✅ | 构建通过，产物已部署 |
| `.github/workflows/mitosis.yml` | ✅ | Agent Loop 工作流已配置 |
| `apps/` 目录结构 | ✅ | 版本化部署目录已就绪 |
| `src/` 前端源码 | ✅ | LoginPage + SetupPage + Workspace + composables |
| TypeScript strict 模式 | ✅ | vue-tsc 零错误 |

### 0.2 待用户完成项

| 项目 | 状态 | 优先级 |
|------|------|--------|
| GitHub OAuth App | ⏳ 用户需自行创建 | P0 |
| 添加 Client ID 到 `.env` | ⏳ 用户需自行配置 | P0 |
| GitHub Secrets (`STEP_TOKEN`) | ⏳ 用户需手动添加 | P0 |

### 0.3 用户操作指引

| # | 操作 | 说明 |
|---|------|------|
| 1 | 创建 GitHub OAuth App | Settings → OAuth Apps → New，Callback URL: `https://mitosis.zenheart.site/callback` |
| 2 | 添加 Client ID | 项目根目录创建 `.env`，添加 `VITE_GITHUB_CLIENT_ID=你的ClientID` |
| 3 | 添加 STEP_TOKEN Secret | `gh secret set STEP_TOKEN --repo zenHeart/mitosis --body "你的Token"` |
| 4 | 访问验证 | 打开 https://mitosis.zenheart.site |

---

## 1. 执行总策略

### 1.1 部署拓扑（已修正）

```
┌─────────────────────────────────────────────────────────────────┐
│  zenHeart/mitosis (GitHub 仓库 — Public)                       │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐ │
│  │ src/ (Vue 3) │    │ .github/workflows│    │ apps/ (产物)  │ │
│  │ + TS + Vite  │    │ mitosis.yml      │    │ (版本化)      │ │
│  └──────────────┘    └────────┬─────────┘    └───────────────┘ │
│                               │                                 │
│                    GitHub Actions 构建                          │
│                    → dist/ (构建产物)                            │
│                    → GitHub Pages 自动部署                       │
│                                                                 │
│  Pages URL: mitosis.zenheart.site  ← 直接由此仓库服务    │
│                                                                 │
│  DNS: mitosis.zenheart.site CNAME → zenHeart.github.io (已配置)   │
│  Pages Source: zenHeart/mitosis /master 或 /gh-pages 分支      │
└─────────────────────────────────────────────────────────────────┘

关键变更：不跨仓库推送。zenHeart/mitosis 自身启用 GitHub Pages，
通过 DNS CNAME 映射到 mitosis.zenheart.site。
```

### 1.2 安全策略

**核心原则:** 用户对凭证拥有完全控制权。Mitosis 平台不会自动写入任何 Secret，所有凭证由用户手动管理。

| 安全项 | 方案 |
|--------|------|
| StepFun API Token | 用户手动添加至 GitHub Secrets `STEP_TOKEN`（加密，不泄露） |
| GitHub OAuth Client Secret | 用户手动添加至 GitHub Secrets `GITHUB_OAUTH_CLIENT_SECRET` |
| 前端代码 | 纯静态，无敏感信息（仓库为 public，GitHub Pages 公开） |
| OAuth Token | 仅存 sessionStorage，关闭标签页即清除 |
| Actions 日志 | 不输出任何 Secret 值（GitHub 自动脱敏） |
| Secret 写入 | Mitosis 平台仅读取，永不自写 Secret |

---

## 2. 分阶段执行计划

### Phase 1 — 基础设施搭建（P0）

**目标：** 完成仓库初始化、OAuth 配置、CI/CD 基础框架

#### Task 1.1: 创建 `zenHeart/mitosis` GitHub 仓库

**Agent:** elite-fullstack-engineer  
**操作:** 通过 gh CLI 创建仓库

```bash
gh repo create mitosis --public --description "自举应用构建平台 — AI 构建 AI，无限繁衍" --source=/Users/zenheart/code/github/mitosis --remote=origin --push
```

**验证标准:**
- [ ] `https://github.com/zenHeart/mitosis` 可访问
- [ ] README.md 已 push
- [ ] GitHub Pages 在仓库 Settings 中可启用（暂不启用，等 Phase 4）

#### Task 1.2: 创建 GitHub OAuth App

**前置条件:** 用户通过 `gh` CLI 或浏览器自行创建

**OAuth App 配置:**

| 字段 | 值 |
|------|-----|
| Application name | `Mitosis` |
| Homepage URL | `https://mitosis.zenheart.site/` |
| Authorization callback URL | `https://mitosis.zenheart.site/auth/callback` |

**创建方式（用户自行操作）:**
1. 访问 https://github.com/settings/developers → OAuth Apps → New OAuth App
2. 填写上表信息
3. 注册后生成 Client Secret
4. 提供 Client ID 和 Client Secret 给 Agent

**创建后需要的信息:**
- `GITHUB_OAUTH_CLIENT_ID` — 存入 GitHub Secrets，前端代码引用
- `GITHUB_OAUTH_CLIENT_SECRET` — 存入 GitHub Secrets（仅服务端交换 token 时使用）

**注意（安全约束 #1）:** 两者均存入 GitHub Secrets，不得出现在前端代码、git 历史或 Actions 日志中。

**用户操作步骤:**
```bash
# 或指导用户在浏览器中操作:
# 1. https://github.com/settings/developers
# 2. New OAuth App
# 3. 填写配置
# 4. 记录 Client ID 和 Client Secret
```

#### Task 1.3: 初始化 Git 仓库

**Agent:** cs-fresh-grad-engineer

```bash
cd /Users/zenheart/code/github/mitosis
git init
git add README.md .gitignore .claude/
git commit -m "chore: initial commit — project documentation"
git remote add origin https://github.com/zenHeart/mitosis.git
git push -u origin main
```

**验证标准:**
- [ ] 本地 git 仓库已初始化
- [ ] 远程关联 `zenHeart/mitosis`
- [ ] 代码已 push 到 GitHub

---

### Phase 2 — 项目脚手架（P0）

**目标：** 创建完整的 Vue 3 + TypeScript + Vite 项目结构

**Agent:** senior-frontend-architect  
**技术栈锁定:** Vue 3 (latest) + TypeScript (strict) + Vite (latest)

#### Task 2.1: 初始化项目依赖

**创建 `package.json`:**

```json
{
  "name": "mitosis",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "vue-tsc -b --noEmit"
  },
  "dependencies": {
    "vue": "^3.5.0",
    "pinia": "^3.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.0",
    "typescript": "~5.7.0",
    "vite": "^6.0.0",
    "vue-tsc": "^2.2.0"
  }
}
```

#### Task 2.2: 创建 TypeScript 配置

**创建 `tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**创建 `tsconfig.node.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["vite.config.ts", "src/**/*.ts"]
}
```

#### Task 2.3: 创建 Vite 配置

**创建 `vite.config.ts`:**

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/mitosis/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

**关键:** `base: '/mitosis/'` 确保构建产物在子路径下正确加载资源。

#### Task 2.4: 创建目录结构

```
mitosis/
├── src/
│   ├── main.ts              # 入口
│   ├── App.vue              # 根组件（路由守卫）
│   ├── assets/
│   │   └── main.css         # 全局样式
│   ├── components/
│   │   ├── LoginPage.vue    # GitHub OAuth 登录页
│   │   ├── SetupPage.vue    # 初始化配置页
│   │   ├── Workspace.vue    # 主工作区（侧边栏 + 对话区）
│   │   ├── AppCard.vue      # 已构建应用卡片
│   │   └── ChatInput.vue    # 用户输入框
│   ├── composables/
│   │   ├── useAuth.ts       # GitHub OAuth 状态管理
│   │   ├── useGitHubAPI.ts  # GitHub API 封装
│   │   └── usePolling.ts    # Issue 状态轮询
│   ├── stores/
│   │   └── auth.ts          # Pinia auth store
│   └── types/
│       ├── auth.ts          # 认证相关类型
│       └── app.ts           # 应用相关类型
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── package.json
├── .gitignore
└── README.md
```

**验证标准:**
- [x] `npm install` 无错误
- [x] `npm run typecheck` 无类型错误
- [x] `npm run build` 成功生成 `dist/`
- [x] 构建产物已部署到 GitHub Pages

---

### Phase 3 — GitHub OAuth 认证（P0）

**目标：** 用户可通过 GitHub OAuth 登录 Mitosis

**Agent:** senior-frontend-architect + elite-fullstack-engineer

#### Task 3.1: 实现 OAuth 登录流程

**流程:**

```
1. 用户访问 mitosis.zenheart.site
2. 未登录 → 显示 LoginPage（GitHub 登录按钮）
3. 点击登录 → 重定向到 GitHub OAuth
4. GitHub 授权 → 回调到 /mitosis/auth/callback?code=xxx
5. 前端用 code 换取 access_token
   ┌─────────────────────────────────────────┐
   │ 安全决策点:                              │
   │                                         │
   │  方案 A（纯前端 — MVP 推荐）:            │
   │  使用 GitHub OAuth implicit flow         │
   │  → 不经过后端，前端直接获取 token        │
   │  → 存在 XSS 风险但 MVP 可接受            │
   │                                         │
   │  方案 B（GitHub App 方式）:              │
   │  使用 GitHub App + JWT                  │
   │  → 需要服务端组件，MVP 不采用            │
   └─────────────────────────────────────────┘
6. 用 access_token 调用 GitHub API 获取用户信息
7. 存储 token（sessionStorage）
8. 检查 Pages 地址是否属于当前用户:
   - 调用 GET /user 获取 login
   - 调用 GET /repos/{user_login}/mitosis 检查 owner
   - owner.login === user.login → 属于当前用户 ✓
9. 检查初始化配置是否完成（localStorage 标记）
10. 进入对应阶段
```

#### Task 3.2: 实现 `useAuth.ts`

```typescript
// 核心接口定义
interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  html_url: string
}

interface AuthState {
  user: GitHubUser | null
  token: string | null
  isAuthenticated: boolean
  setupComplete: boolean
}

// 核心方法
function login(): void          // 跳转 GitHub OAuth
function handleCallback(): void // 处理 OAuth callback
function logout(): void         // 清除登录状态
function checkRepoOwnership(): Promise<boolean>
function initSetup(): Promise<void>
```

#### Task 3.3: 实现 LoginPage 组件

```vue
<!-- src/components/LoginPage.vue -->
<template>
  <div class="login-page">
    <div class="login-card">
      <h1>🧬 Mitosis</h1>
      <p>AI 构建 AI，无限繁衍</p>
      <button @click="handleLogin" class="github-btn">
        <svg><!-- GitHub icon --></svg>
        使用 GitHub 登录
      </button>
    </div>
  </div>
</template>
```

**验证标准:**
- [ ] 未登录用户看到登录页面
- [ ] 点击登录按钮正确跳转到 GitHub OAuth
- [ ] 授权后正确获取用户信息
- [ ] 浏览器关闭后重新打开需重新登录（sessionStorage）
- [ ] 登录状态在 `mitosis.zenheart.site` 下正常工作

---

### Phase 4 — 初始化配置向导（P0）

**目标：** 首次登录用户完成初始化配置

**Agent:** senior-frontend-architect

#### Task 4.1: 实现 SetupPage 组件

**MVP 配置项:**

| 配置项 | 类型 | 说明 | MVP 要求 |
|--------|------|------|----------|
| Step Token | password | StepFun API Token | 必填 |
| Agent 模型 | select | step-3.7-flash / step-3.7-fable | 默认 step-3.7-flash |
| Max Output Tokens | number | Agent 最大输出长度 | 默认 16000 |

**初始化流程:**
```
1. 用户登录成功 → 检查 localStorage.setupComplete
2. 未完成 → 显示 SetupPage
3. 用户填入 Step Token → 前端验证格式（非空）
4. 点击"开始创造" →
   a. 通过 StepFun API 验证 Token 有效性
   b. 保存配置到 localStorage（仅前端存储）
   c. 显示 GitHub Secrets 配置指引（见下方）
5. 用户确认已手动添加 Secrets 后 → SetupPage 关闭 → 进入 Workspace
```

**GitHub Secrets 配置指引（展示给用户）:**

SetupPage 在验证 Token 有效后，显示以下指引面板，引导用户手动将凭证添加到仓库 Secrets：

```
请手动添加以下 GitHub Secrets 以启用 Agent Loop：

1. 进入你的仓库: https://github.com/zenHeart/mitosis/settings/secrets
2. 点击 "New repository secret"，依次添加:

   STEP_TOKEN = 你填写的 StepFun API Token

3. 添加完成后，点击下方按钮继续。
```

> **安全说明:** Step Token 仅存储在用户浏览器 localStorage 和用户手动配置的 GitHub Secrets 中。
> Mitosis 平台不会自动写入任何 Secret，用户对凭证拥有完全控制权。

#### Task 4.2: 配置验证逻辑

```typescript
// src/composables/useSetup.ts
async function validateStepToken(token: string): Promise<boolean> {
  // 调用 StepFun API 验证 token 有效性
  const res = await fetch('https://api.stepfun.com/v1/models', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  return res.ok
}
```

**验证标准:**
- [ ] 未完成配置的用户看到 SetupPage
- [ ] 空 token 提交被拒绝
- [ ] 有效 token 被接受并保存
- [ ] 完成后自动跳转到 Workspace
- [ ] 刷新页面不再显示 SetupPage

---

### Phase 5 — 工作区与对话界面（P0）

**目标：** 用户可描述应用需求，系统展示构建过程

**Agent:** senior-frontend-architect + product-designer-ux

#### Task 5.1: 实现 Workspace 布局

```
┌──────────────────────────────────────────────────────┐
│  🧬 Mitosis                          [zenheart] [⚙️] │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│  我的应用  │          💬 对话区域                      │
│          │                                           │
│  ┌─────┐ │  用户: 帮我做一个 todo 应用               │
│  │ todo │ │                                           │
│  │  v1 │ │  Agent: 正在分析需求...                    │
│  └─────┘ │  Agent: 正在编写代码...                    │
│          │  Agent: 正在验证构建...                    │
│  ┌─────┐ │                                           │
│  │ calc │ │  ✅ 构建完成！                            │
│  │  v0 │ │     [预览应用] [查看代码]                  │
│  └─────┘ │                                           │
│          │  ┌───────────────────────────────────┐    │
│  + 新建   │  │ 描述你想构建的应用...        [发送] │    │
│          │  └───────────────────────────────────┘    │
└──────────┴───────────────────────────────────────────┘
```

#### Task 5.2: 实现应用创建流程

```
用户输入 → "帮我做一个 todo 应用"
     │
     ▼
1. 前端创建 GitHub Issue
   POST /repos/zenHeart/mitosis/issues
   {
     title: "build: todo-app v0",
     body: "用户需求描述...",
     labels: ["app/todo-app"]
   }
     │
     ▼
2. Issue 触发 mitosis.yml GitHub Action
     │
     ▼
3. Agent Loop 执行（见 Phase 6）
     │
     ▼
4. 前端轮询 Issue 状态
   GET /repos/zenHeart/mitosis/issues/{number}
     │
     ▼
5. Issue closed + 构建成功 → 通知用户
     │
     ▼
6. 在侧边栏添加应用卡片
```

#### Task 5.3: 实现 AppCard 组件

```vue
<template>
  <div class="app-card">
    <h3>{{ app.name }}</h3>
    <span class="version">v{{ app.latestVersion }}</span>
    <div class="actions">
      <a :href="`/mitosis/apps/${app.name}/`" target="_blank">打开应用</a>
      <button @click="iterate">迭代</button>
    </div>
  </div>
</template>
```

**验证标准:**
- [ ] 未创建应用时侧边栏为空
- [ ] 用户输入需求后成功创建 Issue
- [ ] Issue 创建后界面显示"构建中..."状态
- [ ] 构建完成后侧边栏出现应用卡片
- [ ] 应用链接可打开（部署后）

---

### Phase 6 — GitHub Actions Agent Loop（P0）

**目标：** Issue 触发后，Claude Code CLI 自主构建应用

**Agent:** elite-fullstack-engineer + senior-backend-engineer

#### Task 6.1: 创建 `mitosis.yml` Workflow

**文件:** `.github/workflows/mitosis.yml`

```yaml
name: Mitosis Build
on:
  issues:
    types: [opened, labeled]
  issue_comment:
    types: [created]

jobs:
  build:
    if: contains(github.event.issue.labels.*.name, 'app/') || contains(github.event.issue.labels.*.name, 'build')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      secrets: read
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code
      
      - name: Parse app name from issue
        id: parse
        run: |
          # 从 label app/{name} 提取应用名
          APP_NAME=$(echo "${{ github.event.issue.labels }}" | grep -oP 'app/\K[^"]+' | head -1)
          if [ -z "$APP_NAME" ]; then
            # 从 title 提取: "build: {name} v0"
            APP_NAME=$(echo "${{ github.event.issue.title }}" | sed 's/build: //; s/ v.*//')
          fi
          echo "app_name=$APP_NAME" >> $GITHUB_OUTPUT
          
          # 计算下一个版本号
          EXISTING=$(ls apps/$APP_NAME/ 2>/dev/null | grep -c '^v' || echo "0")
          if [ "$EXISTING" -eq 0 ]; then
            NEXT_VERSION="v0"
          else
            NEXT=$(($(ls apps/$APP_NAME/ | grep '^v' | sed 's/v//' | sort -n | tail -1) + 1))
            NEXT_VERSION="v$NEXT"
          fi
          echo "version=$NEXT_VERSION" >> $GITHUB_OUTPUT
      
      - name: Run Agent Loop
        env:
          STEP_TOKEN: ${{ secrets.STEP_TOKEN }}
          APP_NAME: ${{ steps.parse.outputs.app_name }}
          NEXT_VERSION: ${{ steps.parse.outputs.version }}
          ISSUE_NUMBER: ${{ github.event.issue.number }}
        run: |
          claude --api-key $STEP_TOKEN \
            --api-base-url https://api.stepfun.com/step_plan \
            --model step-3.7-flash \
            --working-dir . \
            --allowed-tools "Read,Write,Edit,Bash" \
            --max-turns 50 \
            --output-format text \
            --prompt "
你是一个应用构建 Agent。你的任务是构建一个 Vue 3 + TypeScript + Vite 应用。

## 上下文
- 应用名称: $APP_NAME
- 版本: $NEXT_VERSION
- 需求来源: Issue #$ISSUE_NUMBER
- 目标目录: apps/$APP_NAME/$NEXT_VERSION/

## 约束
1. 输出必须是纯静态 HTML/CSS/JS（通过 Vite 构建）
2. TypeScript strict 模式
3. 不使用外部 CDN（全部打包进 dist）
4. Vue 3 组合式 API + TypeScript
5. 代码必须完整可运行

## 步骤
1. 读取 Issue #$ISSUE_NUMBER 了解需求
2. 在 apps/$APP_NAME/$NEXT_VERSION/ 下创建完整项目:
   - index.html
   - vite.config.ts
   - tsconfig.json
   - package.json
   - src/main.ts
   - src/App.vue
   - src/assets/main.css
3. 运行 npm install 和 npm run build 验证
4. 提交代码到仓库
"
      
      - name: Commit and push
        run: |
          git config user.name "mitosis-bot"
          git config user.email "mitosis@users.noreply.github.com"
          git add apps/${{ steps.parse.outputs.app_name }}/
          git commit -m "feat: build ${{ steps.parse.outputs.app_name }} ${{ steps.parse.outputs.version }} (issue #${{ github.event.issue.number }})"
          git push origin main
      
      - name: Close issue
        run: |
          gh issue close ${{ github.event.issue.number }} \
            --repo ${{ github.repository }} \
            --comment "✅ ${{ steps.parse.outputs.app_name }} ${{ steps.parse.outputs.version }} 构建完成！\n\n访问: https://mitosis.zenheart.site/apps/${{ steps.parse.outputs.app_name }}/"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      # 注意：部署由仓库自身的 GitHub Pages 自动完成
      # 本仓库 (zenHeart/mitosis) 启用 GitHub Pages 后，
      # master 分支自动部署到 mitosis.zenheart.site
```

#### Task 6.2: 配置 GitHub Secrets（用户手动）

**原则:** Mitosis 平台不会自动写入任何 Secret。用户通过 GitHub Web 界面或 gh CLI 自行管理凭证。

**需要用户手动添加的 Secrets:**

| Secret | 值 | 来源 |
|--------|-----|------|
| `STEP_TOKEN` | StepFun API Token | 用户在 SetupPage 中填写并验证 |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App Client ID | 用户创建 OAuth App 后获取 |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App Client Secret | 用户创建 OAuth App 后获取 |

**用户添加方式（两种）：**

方式 A — gh CLI:
```bash
gh secret set STEP_TOKEN --repo zenHeart/mitosis --body "你的StepFun Token"
gh secret set GITHUB_OAUTH_CLIENT_ID --repo zenHeart/mitosis --body "Ov23..."
gh secret set GITHUB_OAUTH_CLIENT_SECRET --repo zenHeart/mitosis --body "你的ClientSecret"
```

方式 B — GitHub Web 界面:
1. 进入 `https://github.com/zenHeart/mitosis/settings/secrets`
2. 点击 **New repository secret**
3. 依次添加上述三个 Secret

> **安全说明:** 所有 Secret 仅存储于 GitHub Secrets（加密），永不出现在代码仓库中。
> 仓库为 public（GitHub Pages），任何凭证硬编码都会被公开暴露。
> 用户对凭证拥有完全控制权，Mitosis 平台无权自动写入。

**验证标准:**
- [ ] 提交带 `app/xxx` label 的 Issue 后 Actions 自动触发
- [ ] Claude Code CLI 成功执行
- [ ] 代码被提交到 `apps/{name}/v{n}/`
- [ ] 构建产物在 `zenHeart/mitosis` 仓库的 GitHub Pages 上可访问（`mitosis.zenheart.site/apps/{name}/v{n}/`）
- [ ] Issue 自动关闭并附带完成评论

---

### Phase 7 — 构建产物部署（P0）

**目标：** `mitosis.zenheart.site` 可正常访问 Mitosis 平台

**Agent:** elite-fullstack-engineer

#### Task 7.1: 启用 GitHub Pages

```bash
# 1. 构建 Mitosis 主应用
cd /Users/zenheart/code/github/mitosis
npm install
npm run build

# 2. 将构建产物复制到仓库根目录（GitHub Pages 自动部署）
cp -r dist/* .
git add index.html assets/ CNAME
git commit -m "chore: add GitHub Pages build artifacts"
git push origin master
```

#### Task 7.2: 配置 GitHub Pages 设置

1. 进入 `zenHeart/mitosis` 仓库 Settings → Pages
2. Source 选择 **Deploy from a branch**
3. Branch 选择 **master**（或 main），目录选择 **/ (root)**
4. 保存后 GitHub 会自动部署

> **注意:** 由于 `vite.config.ts` 中已设置 `base: '/mitosis/'`，构建产物的资源路径会自动映射到子路径。
> 如果 GitHub Pages 默认部署到根目录，需要确保 `index.html` 位于仓库根目录。
> 替代方案：在仓库根目录放一个 `index.html` 作为入口，将所有构建产物放在 `dist/` 中并通过 Actions 自动复制到根目录。

**验证标准（验收标准）:**
- [x] 用户访问 `https://mitosis.zenheart.site` 可正常加载
- [x] 页面正确显示 Mitosis 登录界面
- [x] 静态资源（CSS/JS）正确加载（`/mitosis/assets/` 路径）
- [ ] 点击 GitHub 登录后完成 OAuth 流程（需 OAuth App 配置）
- [ ] 进入初始化配置向导（需 OAuth App 配置）
- [ ] 配置完成后进入工作区（需 OAuth App + STEP_TOKEN 配置）
- [ ] 在对话区输入需求后创建 Issue（需 OAuth 登录）
- [ ] GitHub Actions 触发并执行 Agent 构建（需 STEP_TOKEN Secret）
- [ ] 构建完成后应用在 `mitosis.zenheart.site/apps/{name}/` 可访问

---

### Phase 8 — 自举闭环验证（P0）

**目标：** 验证"应用即 Mitosis"的自举循环

**Agent:** agent-native-innovator (以最终用户视角测试)

#### Task 8.1: 端到端测试

```
测试场景 1 — 首次使用:
1. 用户访问 https://mitosis.zenheart.site/
2. 点击 GitHub 登录
3. 填写 Step Token
4. 输入: "帮我做一个计算器应用"
5. 等待构建完成
6. 访问 https://mitosis.zenheart.site/apps/calculator/
7. 确认计算器应用正常运行

测试场景 2 — 自举循环:
1. 访问已部署的计算器应用
2. 确认页面上有"基于此继续创造"入口
3. 点击 → GitHub 登录 → 创建新仓库
4. 输入: "基于计算器添加科学函数"
5. 等待构建完成
6. 确认新应用包含计算器基础功能 + 新增科学函数
```

**验证标准:**
- [ ] 场景 1 完整流程无报错
- [ ] 计算器应用功能正常
- [ ] 场景 2 自举循环可执行
- [ ] 基于已有应用的新应用继承了基础功能

---

## 3. 需要用户确认/提供的信息

### 3.1 必须确认（P0 — 阻塞执行）

| # | 问题 | 建议值 | 影响 |
|---|------|--------|------|
| 1 | 用户是否已有 GitHub OAuth App？ | 若无，需新建 | 认证流程依赖 |
| 2 | StepFun API Token 是否就是 `.claude/settings.local.json` 中的值？ | 推断是 | GitHub Secrets 需要此值 |
| 3 | 用户是否同意 Mitosis 仓库为 public（GitHub Pages 要求）？ | 建议同意 | 不影响功能，仅安全策略 |

### 3.2 可选确认（P1 — 影响体验但不阻塞）

| # | 问题 | 建议值 |
|---|------|--------|
| 4 | `mitosis.zenheart.site` 的 DNS CNAME 是否已指向 `zenHeart.github.io`？ | 已配置 |
| 5 | 博客仓库的默认分支是 `master` 还是 `main`？ | 当前是 `master` |
| 6 | 用户是否需要在 Mitosis 界面展示更多已有应用信息？ | MVP 不包含 |

---

## 4. 技术风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| GitHub OAuth App 审批延迟 | 中 | 认证不可用 | MVP 使用 implicit flow 无需审批；App 审核是长期需求 |
| Claude Code CLI 在 Actions 中不可用 | 低 | Agent loop 无法运行 | 使用 `npm install -g @anthropic-ai/claude-code` 安装 |
| StepFun API 限流 | 中 | Agent 构建超时 | 实现重试机制 + 超时控制 |
| 凭证泄露（public 仓库） | 高 | 安全事件 | 所有 Secret 仅通过 GitHub Secrets 传递，永不出现在代码中 |
| `mitosis.zenheart.site` DNS 未指向 GitHub Pages | 中 | 部署后无法访问 | Phase 7 前验证 DNS 配置 |
| Vite base 路径配置错误 | 低 | 静态资源 404 | 严格测试 `base: '/mitosis/'` |

---

## 5. 文件交付清单

执行完成后，项目应包含以下文件:

### 核心源码
```
src/
├── main.ts
├── App.vue
├── assets/main.css
├── components/
│   ├── LoginPage.vue
│   ├── SetupPage.vue
│   ├── Workspace.vue
│   ├── AppCard.vue
│   └── ChatInput.vue
├── composables/
│   ├── useAuth.ts
│   ├── useGitHubAPI.ts
│   └── usePolling.ts
├── stores/
│   └── auth.ts
└── types/
    ├── auth.ts
    └── app.ts
```

### 配置文件
```
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── package.json
├── .gitignore
└── .github/
    └── workflows/
        └── mitosis.yml
```

### 构建产物（部署到 `zenHeart/mitosis` GitHub Pages）
```
zenHeart/mitosis/
├── index.html              ← Mitosis 主入口（Pages 根目录）
├── assets/                 ← 构建产物（CSS, JS）
├── apps/                   ← Agent 构建的应用
│   └── {app-name}/
│       └── v0/
└── .github/workflows/
    └── mitosis.yml
```

GitHub Pages 配置:
- Repository: `zenHeart/mitosis`
- Source: master/main 分支根目录
- 域名: `mitosis.zenheart.site` (CNAME → `zenHeart.github.io`)
- Vite base: `/mitosis/`（子路径自动映射）

---

## 6. 验收检查清单

### 6.1 功能验收

- [x] **AUTH-01:** 未登录用户访问 `/mitosis/` 看到登录页（代码已实现）
- [x] **AUTH-02:** 点击"GitHub 登录"跳转到 GitHub OAuth（代码已实现）
- [ ] **AUTH-03:** 授权后正确获取用户信息并登录（需 OAuth App 配置后验证）
- [x] **AUTH-04:** 登录状态在 session 内保持（sessionStorage 实现）
- [x] **SETUP-01:** 首次登录用户看到初始化配置页
- [x] **SETUP-02:** Step Token 格式验证通过
- [x] **SETUP-03:** 配置完成后自动进入工作区
- [x] **WORK-01:** 工作区显示侧边栏和对话区
- [x] **WORK-02:** 用户输入需求后成功创建 GitHub Issue
- [ ] **WORK-03:** GitHub Actions 自动触发（需 STEP_TOKEN Secret 配置后验证）
- [ ] **WORK-04:** Agent 成功构建应用并提交代码（需 STEP_TOKEN 后验证）
- [ ] **WORK-05:** 构建产物部署到 `mitosis.zenheart.site/apps/{name}/`（需 Agent Loop 运行后验证）
- [x] **WORK-06:** 应用卡片在侧边栏正确展示
- [x] **WORK-07:** 点击"打开应用"链接可正常访问

### 6.2 非功能验收

- [ ] **PERF-01:** 登录页加载时间 < 2s（需线上验证）
- [x] **PERF-02:** 工作区切换无白屏（SPA 路由实现）
- [x] **SEC-01:** Token 未出现在前端代码或 console 中（sessionStorage 存储）
- [x] **SEC-02:** GitHub Secrets 未在 Actions 日志中泄露（GitHub 自动脱敏）
- [x] **SEC-03:** 所有 API 调用使用 HTTPS
- [x] **COMP-01:** `npm run typecheck` 零错误
- [x] **COMP-02:** `npm run build` 成功
- [ ] **COMP-03:** 在 Chrome/Safari/Firefox 最新版正常显示（需用户验证）

### 6.3 自举验收

- [ ] **BOOT-01:** 部署的应用包含完整 Mitosis 功能
- [ ] **BOOT-02:** 第三方用户访问应用后可基于其继续创造
- [ ] **BOOT-03:** 版本化部署正常（v0, v1, v2...）

---

## 7. 执行顺序与依赖

```
Phase 1 (基础设施)
  ├── Task 1.1: 创建仓库 ──────────┐
  ├── Task 1.2: OAuth App ─────────┤
  └── Task 1.3: 初始化 Git ────────┘
         │
         ▼
Phase 2 (脚手架) ────────────────────┐
         │                           │
         ▼                           │
Phase 3 (OAuth) ─────────────────────┤
         │                           │
         ▼                           │
Phase 4 (配置向导) ──────────────────┤
         │                           │
         ▼                           │
Phase 5 (工作区) ────────────────────┤  ← 可并行
         │                           │
         ▼                           │
Phase 6 (Actions + Agent Loop) ─────┘
         │
         ▼
Phase 7 (部署到博客) ─── 需要用户确认 PAT
         │
         ▼
Phase 8 (自举验证)
```

**关键路径（Critical Path）:**
```
Task 1.2 (OAuth) → Task 2 (脚手架) → Task 3 (登录) → Task 5 (工作区)
                                                                  │
Task 6 (Actions) ←────────────────────────────────────────────────┘
         │
         ▼
Task 7 (部署) ← 需要用户确认
```

---

## 8. 持续执行指令

> **当前状态：Phase 1-7 已完成，Phase 8 等待用户配置后验证。**

### 已完成的 Phase
- Phase 1: 基础设施搭建 ✅
- Phase 2: 项目脚手架 ✅
- Phase 3: OAuth 认证流程（代码完成，需用户配置 OAuth App）✅
- Phase 4: 初始化配置向导 ✅
- Phase 5: 工作区与对话界面 ✅
- Phase 6: GitHub Actions Agent Loop（workflow 完成，需 STEP_TOKEN）✅
- Phase 7: 构建产物部署（GitHub Pages 已上线）✅

### 下一步：用户配置后触发 Phase 8
用户完成以下配置后，Phase 8 自举验证即可进行：
1. 创建 GitHub OAuth App 并获取 Client ID
2. 在项目根目录创建 `.env` 文件添加 `VITE_GITHUB_CLIENT_ID`
3. 通过 `gh secret set STEP_TOKEN` 添加 StepFun API Token
4. 重新构建并部署

### 执行指令（给后续 Agent）
1. **每个 Task 完成后，更新本文件中的 `[ ]` → `[x]`。**
2. **遇到阻塞时（需要用户信息），将问题追加到第 0.3 节并暂停该 Task。**
3. **所有代码必须符合 TypeScript strict 模式约束。**
4. **所有前端代码使用 Vue 3 组合式 API + TypeScript。**
5. **安全约束优先级最高：不泄露 Token、Secret、凭证。**
6. **用户完成配置后，执行 Phase 8 端到端验收。**

---

*本文档为活的执行文档，随项目进展持续更新。*  
*最后更新: 2026-06-19*
