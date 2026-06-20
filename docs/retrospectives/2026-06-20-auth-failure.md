# Mitosis 认证流程故障深度复盘

> **文档性质：** 深度事后复盘（Retrospective），非修复指南  
> **撰写日期：** 2026-06-20  
> **涉及时间窗口：** 2026-06-19 ~ 2026-06-20（Phase 2 脚手架阶段）  
> **严重等级：** P0 — 直接阻断核心用户流程（OAuth 登录完全失效）

---

## 一、事件概述

### 1.1 事件摘要

在 Mitosis MVP 自举开发过程中，认证流程经历了三次独立的破坏性变更，导致 OAuth 登录完全失效。问题从"未登录用户看不到登录页"演变为"已登录用户看不到 Workspace"，最终叠加为"CI 构建产物中登录按钮对所有用户禁用"。所有问题在本地开发环境中均不易察觉，仅在真实 OAuth 回调场景或 CI 构建产物中暴露。

### 1.2 时间线

```
2026-06-19
  └─ 4a0eafa  Phase 2 脚手架   [基线] 认证流程正常 ✅

2026-06-20
  ├─ 00:55  c63ec0c  feat: public gallery + owner-gated workspace
  │         └─ 引入 isGalleryPath 缺陷的雏形（view 默认值改为 gallery）
  │
  ├─ 17:33  656a32d  feat: verifier 核心修复 + Tetris v2 + 多 Agent 协议
  │         └─ 引入 isGalleryPath 计算属性，导致已登录用户始终看到 Gallery
  │
  ├─ 20:30  cda9ae0  fix: OAuth 防护 — client_id 为空时禁用登录按钮
  │         └─ 引入构建产物级别的阻断：CI 构建时 client_id 为空，所有用户登录按钮禁用
  │
  ├─ 21:24  23522bd  fix: 恢复 Gallery 登录按钮和文案 — 移除 OAuth 防护阻断
  │         └─ 部分修复：移除 oauthReady 禁用逻辑，但未修复 isGalleryPath 和 authStore OAuth 处理
  │
  ├─ 21:42  b48185f  fix: authStore.init() handle OAuth callback code exchange
  │         └─ 根因修复 #1：将 OAuth code exchange 从 LoginPage.vue 移至 authStore.init()
  │
  └─ 22:02  e1ac2da  fix: remove isGalleryPath override blocking Workspace view
            └─ 根因修复 #2：移除 isGalleryPath 计算属性及其模板使用

总计：3 个破坏性提交 → 3 个修复提交（含 1 个部分修复）
```

---

## 二、根因分析

### 2.1 破坏链全景图

```
OAuth 回调 (GitHub → 404.html)
  → 404.html 将 code 存入 sessionStorage.mitosis_oauth_code
  → 重定向到 /
  → App.vue onMounted → authStore.init()
      ├─ [原始状态] authStore.init() 不处理 oauth_code → view='login' → LoginPage 渲染 → onMounted 交换 token ✅
      ├─ [c63ec0c 后] view='gallery' → LoginPage 不渲染 → oauth_code 永远不交换 ❌
      ├─ [656a32d 后] 即使 authStore.init() 后续修复了 oauth_code 处理
      │   isGalleryPath=true 强制 Gallery 渲染，遮盖 Workspace ❌
      └─ [cda9ae0 后] 登录按钮 :disabled="!oauthReady" → CI 构建 client_id=空 → 按钮禁用 ❌
```

### 2.2 逐提交根因追溯

#### 提交 `c63ec0c` — 第一次破坏（2026-06-20 00:55）

**变更内容：**
- `App.vue`: `currentView` 默认值从 `'login'` 改为 `'gallery'`
- `App.vue`: 新增 `<Gallery v-if="view === 'gallery'" :initial-app="initialApp" />`
- `LoginPage` 变为 `v-else-if="view === 'login'"`

**根因：职责耦合（Coupling）**

OAuth 授权码交换逻辑被放在 `LoginPage.vue` 的 `onMounted` 生命周期中：

```javascript
// LoginPage.vue onMounted — 授权码交换耦合在 UI 组件中
const code = sessionStorage.getItem('mitosis_oauth_code')
if (!code) return
const { access_token } = await exchangeCodeForToken(code)
```

这种设计的隐含前提是：**OAuth 回调后，用户必定会看到 LoginPage**。当 `view` 默认值改为 `'gallery'` 后，这个前提被彻底打破：

```
用户从 GitHub OAuth 回调回来
  → 404.html 存 code → redirect /
  → authStore.init() 不处理 oauth_code（此时还没有这段逻辑）
  → isAuthenticated = false
  → view = 'gallery'
  → Gallery 渲染，LoginPage 不渲染
  → sessionStorage 中的 oauth_code 永远不会被消费
  → 用户永远卡在 Gallery，无法登录
```

**关键洞见：** 这不是一个简单的"默认值改错了"问题。根本问题在于 **OAuth 交换逻辑的归属位置错误**。它应该放在 `authStore.init()` 中（这是一个会在每次应用启动时无条件执行的入口），而不是放在 `LoginPage.vue` 的条件渲染生命周期中。

---

#### 提交 `656a32d` — 第二次破坏（2026-06-20 17:33）

**变更内容：**
- 新增 `isGalleryPath` 计算属性：`path === '/' || path === ''`
- 模板：`<Gallery v-if="view === 'gallery' || isGalleryPath" ... />`

**根因：逻辑错误（Logic Bug） + 防御性过度设计**

`isGalleryPath` 的引入动机是"确保根路径总是显示 Gallery"，但这个需求已经被 `view === 'gallery'` 覆盖了。`isGalleryPath` 是一个**纯路径检测**，它不关心认证状态，因此在任何 `/` 访问时都为 `true`。

更严重的问题是逻辑操作符的选择：使用 `||`（OR）而不是 `&&`（AND）。正确的逻辑应该是：

```
"仅在未登录且路径为根时显示 Gallery"
= !isAuthenticated && isGalleryPath
```

但实际写的是：

```
"当视图是 gallery 或路径是根时显示 Gallery"
= view === 'gallery' || isGalleryPath
= 任何路径为根的情况都显示 Gallery（覆盖了 workspace/setup）
```

这导致已登录用户在 `/` 路径下永远看到 Gallery 而非 Workspace。

**关键洞见：** 这个计算属性是**完全冗余的**。如果保留它，正确的写法应该是 `view === 'gallery' && isGalleryPath`（虽然仍是冗余），或者干脆删除它。它反映了一个常见的思维模式错误：**当看到一个边界条件时，倾向于用额外的判断来"兜底"，而不是质疑原有逻辑是否已经覆盖。**

---

#### 提交 `cda9ae0` — 第三次破坏（2026-06-20 20:30）

**变更内容：**
- `useAuth.ts`: 新增 `export const isOAuthConfigured = !!GITHUB_CLIENT_ID`
- `Gallery.vue`: 登录按钮增加 `:disabled="!oauthReady"` 和 `v-else-if="!oauthReady"` 提示文案
- `handleLogin()` 增加空 client_id 提前返回

**根因：环境变量生命周期误解 + 防御性逻辑的误用**

动机是合理的：在开发环境中 `GITHUB_CLIENT_ID` 可能为空，此时显示一个指向空 client_id 的 GitHub OAuth 链接没有意义。但实现方式存在双重问题：

1. **构建时注入 vs 运行时感知的混淆**：
   ```typescript
   // useAuth.ts — 这是 Vite build-time define，在 CI 中会被空字符串替换
   const GITHUB_CLIENT_ID = __GITHUB_CLIENT_ID__
   export const isOAuthConfigured = !!GITHUB_CLIENT_ID
   ```
   在 CI 环境中，`.env` 变量未传递，`__GITHUB_CLIENT_ID__` 被替换为 `''`，`isOAuthConfigured` 为 `false`，**所有 CI 构建产物的登录按钮都被禁用**。

2. **错误的保护范围**：应该只在"演示/开发模式"下禁用，而不是在所有环境下都禁用。正确的做法是区分环境：
   ```typescript
   // 正确做法：仅在本地开发且未配置时禁用
   export const isOAuthConfigured = import.meta.env.DEV ? !!GITHUB_CLIENT_ID : true
   ```

**关键洞见：** 这是一个**构建时 vs 运行时**边界的典型错误。`__GITHUB_CLIENT_ID__` 在构建时被替换为静态值，但代码逻辑错误地将其当作运行时配置来使用。在本地开发中 `import.meta.env.DEV` 会动态变化，但 `define` 注入的值在构建时就已经固化了。

---

#### 提交 `23522bd` — 部分修复（2026-06-20 21:24）

**变更内容：**
- 移除 `isOAuthConfigured` 导出和 `oauthReady` 计算属性
- 恢复登录按钮的点击行为（不再检查空 client_id）
- 移除"OAuth 未配置"提示文案

**修复了什么：** 第三次破坏（CI 构建产物登录按钮禁用）

**遗漏了什么：**
- `isGalleryPath` 仍然存在，已登录用户仍然看不到 Workspace
- `authStore.init()` 仍然不处理 `mitosis_oauth_code`，OAuth 回调仍然无法完成交换

**评价：** 这是一个"见一个打一个"的修复，而非系统性修复。修复者意识到 OAuth 防护过度了，但没有意识到还有另外两个同样严重的问题存在。

---

#### 提交 `b48185f` — 根因修复 #1（2026-06-20 21:42）

**变更内容：**
- `authStore.init()` 新增 OAuth 授权码交换逻辑
- 从 `sessionStorage.getItem('mitosis_oauth_code')` 读取 code
- 通过 Cloudflare Worker 代理交换 token
- 成功后调用 `saveSession()` 持久化

**修复了什么：** 第一次破坏的核心根因 — OAuth code exchange 从 LoginPage 移至 authStore

**为什么有效：** `authStore.init()` 在每次 App.vue onMounted 时无条件执行，不再依赖 LoginPage 是否渲染。无论当前 view 是什么，OAuth code 都会被正确消费。

---

#### 提交 `e1ac2da` — 根因修复 #2（2026-06-20 22:02）

**变更内容：**
- 删除 `isGalleryPath` 计算属性
- 模板改为 `<Gallery v-if="view === 'gallery'" ... />`

**修复了什么：** 第二次破坏 — 已登录用户在根路径被强制显示 Gallery

**为什么有效：** 移除了冗余且逻辑错误的路径检测。`view === 'gallery'` 本身已经足够表达"未登录用户看 Gallery"的意图。

---

## 三、影响范围

### 3.1 用户影响矩阵

| 用户类型 | 影响描述 | 严重等级 |
|---------|---------|---------|
| 首次 OAuth 登录用户 | OAuth 回调后永远卡在 Gallery，无法完成登录 | P0 |
| 已登录用户刷新页面 | 始终看到 Gallery 而非 Workspace，无法使用聊天功能 | P0 |
| CI 构建产物的所有用户 | 登录按钮禁用，任何人都无法登录 | P0 |
| 本地开发用户 | 无明显影响（Vite 热更新不走 define 注入逻辑） | 无 |

### 3.2 破坏叠加效应

三次破坏不是孤立的，而是叠加的：

```
c63ec0c:  OAuth code 永不交换 → 新用户无法登录
656a32d: 已登录用户被强制回 Gallery → 老用户无法使用
cda9ae0: 登录按钮全面禁用 → 任何人无法登录
```

这三个问题叠加后，**整个认证流程对 100% 的用户完全不可用**。但由于本地开发环境的特殊性（`import.meta.env.DEV` + 手动 token 注入），开发者在本地不会遇到这些问题，导致问题持续了多个提交才被发现。

### 3.3 未被影响的路径

- 本地开发通过 `VITE_GITHUB_TOKEN` 环境变量注入 token 的路径**不受影响**，因为该路径不经过 OAuth 回调
- 已通过 `mitosis_token` + `mitosis_user` 保持登录态的用户（不刷新页面）**不受影响**

---

## 四、修复过程

### 4.1 修复时序

```
21:24  23522bd  部分修复 — 移除 OAuth 防护阻断（登录按钮恢复）
21:42  b48185f  根因修复 #1 — authStore.init() 接管 OAuth code 交换
22:02  e1ac2da  根因修复 #2 — 移除 isGalleryPath 覆盖逻辑
```

### 4.2 修复策略评估

| 修复提交 | 策略 | 评价 |
|---------|------|------|
| 23522bd | 症状修复（Symptom Fix） | 移除了一组有问题的代码，但没有解决根本问题 |
| b48185f | 架构修复（Architectural Fix） | 将 OAuth 交换逻辑从 UI 组件移至 auth store，修复了职责归属 |
| e1ac2da | 简化修复（Simplification Fix） | 删除了冗余的计算属性，回归到最简单的条件渲染 |

### 4.3 为什么修复花了 2 个提交而非 1 个

根因修复 #1（b48185f）和根因修复 #2（e1ac2da）是**两个独立的问题**，需要分别修复：

- 即使移除了 `isGalleryPath`，OAuth code 仍然不会被交换（因为 authStore 还不处理它）
- 即使修复了 authStore 的 OAuth 处理，已登录用户仍然被强制显示 Gallery

两个问题互相独立，但症状表现类似（用户无法正常使用认证功能），因此在排查时容易被混淆。

---

## 五、深度反思

### 5.1 为什么每个错误会发生？

#### 错误 #1：OAuth 交换逻辑放在 LoginPage.vue 而非 authStore

**直接原因：** 开发时以"组件思维"而非"状态管理思维"来组织代码。`LoginPage.vue` 作为一个独立的登录表单组件，在 `onMounted` 中处理回调是直觉上的选择。

**深层原因：**
- **缺乏对跨组件状态共享的抽象**：在脚手架阶段，auth store 被设计为只读取持久化状态，不处理"一次性回调"这种临时状态
- **OAuth 流程的隐性假设未被显式化**：开发者没有意识到"OAuth callback 后必须渲染 LoginPage"是一个脆弱的假设
- **没有设计文档**：OAuth 流程涉及 5 个文件（404.html → sessionStorage → App.vue → authStore → LoginPage → useAuth.ts → Cloudflare Worker），但没有一个人能清晰描述整个流程

#### 错误 #2：isGalleryPath 的 `||` 逻辑错误

**直接原因：** 开发者想"确保 Gallery 在根路径总是显示"，但没有仔细考虑这个条件在已登录场景下的后果。

**深层原因：**
- **增量开发的短路思维**：添加一个 computed 来"兜底"一个已经存在的条件，而不是质疑原有条件是否足够
- **缺乏边界条件测试**：没有测试"已登录用户访问根路径"这个场景
- **对 v-if 优先级的理解偏差**：开发者可能认为 `v-if` 会根据上下文自动选择，但实际上 Vue 的 `v-if / v-else-if` 是按顺序评估的

#### 错误 #3：OAuth 防护的构建时/运行时混淆

**直接原因：** 将 Vite `define` 注入的构建时常量当作运行时配置来使用。

**深层原因：**
- **对 Vite define 机制的理解不足**：`__GITHUB_CLIENT_ID__` 在构建时被替换为字符串字面量，它是一个编译期常量，不是环境变量
- **防御性编程的滥用**：开发者想要"防止用户看到无效的登录按钮"，但没有区分"开发环境"和"生产环境"的差异
- **CI 环境的特殊性被忽视**：在 CI 中，环境变量通常不会传递给构建步骤，这是 CI 配置的问题，但被错误地在应用代码中"修复"

### 5.2 共同的根本原因

所有三个错误的共同根源是：

1. **没有将认证流程作为独立系统来设计** — OAuth 回调涉及的多个文件（404.html, sessionStorage, authStore, LoginPage, useAuth, Worker）之间没有清晰的职责边界和接口契约
2. **缺乏端到端测试** — OAuth 流程从未被完整测试过。如果有测试覆盖"OAuth callback → code exchange → login success"这个完整路径，c63ec0c 的破坏就会被立即发现
3. **AI 辅助开发的"局部最优"陷阱** — 每个提交都是 AI 辅助生成的，AI 倾向于"完成当前任务"而非"审视整体架构"。c63ec0c 的 AI 正确地实现了 Gallery 功能，但没有意识到它对认证流程的副作用

---

## 六、预防措施

### 6.1 架构层面

1. **认证状态机显式化**
   - 创建 `docs/auth-flow.md` 文档，描述完整的 OAuth 流程状态图
   - 定义清晰的职责边界：
     - `404.html` — 只负责将 OAuth code 存入 sessionStorage，不做任何逻辑判断
     - `authStore.init()` — 负责在应用启动时恢复所有认证状态（token/OAuth code/本地 token）
     - `useAuth.ts` — 负责纯函数式认证操作（exchange/fetch/save/clear）
     - `LoginPage.vue` — 纯 UI 组件，只渲染登录按钮，不做任何副作用

2. **视图切换的条件最小化原则**
   - `App.vue` 中的 `v-if` 条件应该只依赖 `currentView` 这一个状态源
   - 禁止在模板条件中混合路径检测和认证状态（`view === 'gallery' || isGalleryPath` 这种写法应该被 lint 规则禁止）
   - 所有路由/视图逻辑应该在 `onMounted` 中统一处理，不在模板中"兜底"

3. **构建时与运行时配置的严格分离**
   - 创建一个 `src/config/oauth.ts` 文件，明确区分：
     ```typescript
     // 构建时常量（由 Vite define 注入，不可变）
     export const GITHUB_CLIENT_ID = __GITHUB_CLIENT_ID__
     
     // 运行时配置（由环境变量或 feature flag 决定）
     export const shouldDisableLoginInDev = import.meta.env.DEV && !GITHUB_CLIENT_ID
     ```
   - 在代码审查中，任何使用 `__*__` 变量的代码都应该被特别关注

### 6.2 流程层面

1. **端到端测试强制要求**
   - 任何涉及认证流程的提交都必须包含 Playwright 测试
   - 测试场景：
     1. 匿名用户访问 `/` → 看到 Gallery
     2. OAuth callback → 自动登录 → 进入 Workspace
     3. 已登录用户刷新 `/` → 仍在 Workspace
     4. 退出 → 回到 Gallery

2. **CI 构建产物验证**
   - 在 CI 中加入对构建产物的 snapshot 测试，确保关键 UI 元素（如登录按钮）存在且未被禁用
   - 使用 Playwright 对 CI 构建产物进行冒烟测试

3. **每次提交后的手动验证清单**
   - 匿名访问 `/` → Gallery 正常
   - 点击登录 → 跳转到 GitHub（检查 URL 中的 client_id 非空）
   - 模拟 OAuth callback → 进入 Workspace
   - 刷新页面 → 仍在 Workspace

### 6.3 AI 辅助开发约束

1. **变更影响分析强制要求**：AI 在修改涉及认证/路由的代码前，必须先描述影响范围
2. **禁止在模板中添加"兜底"条件**：所有视图切换逻辑必须在 JavaScript 中显式处理
3. **构建时变量使用审查**：任何使用 `__*__` 注入变量的代码需要人类审查

---

## 七、沉淀资产

### 7.1 需要创建/更新的文档

| 文档 | 路径 | 状态 |
|------|------|------|
| 认证流程架构文档 | `docs/auth-flow.md` | 待创建 |
| OAuth 端到端测试用例 | `tests/e2e/auth.spec.ts` | 待创建 |
| App.vue 视图切换规范 | `docs/view-routing.md` | 待创建 |
| 构建时/运行时配置指南 | `docs/build-time-config.md` | 待创建 |

### 7.2 需要创建的测试

```
tests/e2e/auth.spec.ts:
  - test('OAuth callback → auto login → workspace'): 
    模拟 404.html 存 code → 加载 App → authStore.init() 交换 token → 进入 Workspace
  
  - test('authenticated user refresh → stays in workspace'):
    预设 token → 加载 App → authStore.init() 恢复状态 → view === 'workspace'
  
  - test('anonymous user → sees gallery'):
    清除 token → 加载 App → authStore.init() 无状态 → view === 'gallery'
  
  - test('login button has valid client_id'):
    访问 Gallery → 检查登录按钮 URL 包含非空 client_id
```

### 7.3 需要添加到项目的代码规范

```typescript
// src/composables/useAuth.ts — 新增类型安全导出
export const OAUTH_CONFIG = {
  get isConfigured(): boolean {
    return typeof __GITHUB_CLIENT_ID__ === 'string' && __GITHUB_CLIENT_ID__.length > 0
  },
  get clientId(): string {
    if (!OAUTH_CONFIG.isConfigured) {
      throw new Error('OAuth client_id not configured')
    }
    return __GITHUB_CLIENT_ID__
  }
} as const
```

---

## 八、最佳实践对照

### 8.1 Claude Code AI 辅助开发最佳实践检查

| 实践 | 本次事件符合度 | 说明 |
|------|--------------|------|
| **变更影响范围分析** | 不符合 | c63ec0c 的 AI 在添加 Gallery 时，没有分析对 LoginPage 渲染路径的影响 |
| **跨文件状态一致性** | 不符合 | OAuth code 的"生产者"（404.html）和"消费者"（LoginPage）的关联被打破后没有检测 |
| **边界条件测试** | 不符合 | 未测试"已登录用户访问根路径"这个关键边界条件 |
| **构建产物验证** | 不符合 | cda9ae0 的改动在 CI 构建后没有被验证 |
| **增量变更的最小性** | 部分符合 | 每个提交的变更范围相对集中，但缺少对连锁反应的考虑 |
| **人类审查关键路径** | 不符合 | 认证流程的变更在多个提交中累积，没有触发人工审查 |
| **文档先行** | 不符合 | OAuth 流程没有文档，导致每个开发者（包括 AI）都用自己的理解来实现 |

### 8.2 具体教训：AI 辅助开发中的"局部最优"陷阱

本次事件完美展示了 AI 辅助开发中的一个经典问题：

```
AI 的任务: "添加一个公开 Gallery 页面"
AI 的执行:
  1. 修改 App.vue 默认 view 为 'gallery' ✅（任务完成）
  2. 添加 Gallery 组件 ✅（任务完成）
  3. 没有检查: "这个修改会影响 LoginPage 的渲染条件吗？" ❌

AI 的任务: "修复 verifier + Tetris v2"
AI 的执行:
  1. 添加 isGalleryPath 确保 Gallery 在根路径显示 ✅（任务完成）
  2. 没有检查: "这个 computed 在已登录场景下的行为" ❌

AI 的任务: "修复 OAuth 未配置时的误导性文案"
AI 的执行:
  1. 添加 isOAuthConfigured 标记 ✅（任务完成）
  2. 没有检查: "这个标记在 CI 构建时的值" ❌
```

**核心教训：** AI 执行任务时是**局部最优导向**的 — 它完成当前任务描述的功能，但不会主动审视对其他功能的影响。这要求：

1. **任务描述必须包含影响范围**："添加 Gallery，同时确保 OAuth 回调流程不受影响"
2. **关键路径需要显式测试要求**："添加 Gallery 后，OAuth 登录测试必须仍然通过"
3. **AI 生成的代码需要人类对认证/路由/权限等关键路径进行审查**

### 8.3 推荐的 AI 辅助开发工作流改进

```
Before AI 修改认证/路由相关代码:
  1. 要求 AI 输出变更影响矩阵（哪些文件、哪些条件分支会受影响）
  2. 要求 AI 确认是否有测试覆盖受影响路径
  3. 如果答案是"没有测试"，先让 AI 编写测试，再修改代码

After AI 修改完成:
  1. 运行相关端到端测试
  2. 手动验证关键用户路径
  3. 检查构建产物（特别是涉及环境变量的场景）
```

---

## 九、总结

### 9.1 事件根本原因一句话总结

> **OAuth 授权码交换逻辑被耦合在条件渲染的 UI 组件（LoginPage.vue）中，当 Gallery 成为默认视图后，LoginPage 不再渲染，导致 OAuth 回调永远无法完成。后续的 isGalleryPath 和 OAuth 防护变更进一步扩大了破坏范围。**

### 9.2 修复后的当前状态

截至 `e1ac2da`，认证流程已恢复正常：

```
OAuth 回调流程:
  404.html → sessionStorage.mitosis_oauth_code
    → App.vue onMounted → authStore.init()
      → 检测 oauth_code → exchangeCodeForToken() → saveSession()
      → isAuthenticated = true
      → view = 'workspace'（或 'setup'）

视图切换逻辑:
  currentView 默认 'gallery'
  onMounted 后根据 authStore 状态切换
  v-if 条件仅依赖 currentView（无冗余路径检测）
  Gallery: view === 'gallery' ✅
  Workspace: view === 'workspace' ✅
```

### 9.3 最重要的三条行动项

1. **立即**：编写 OAuth 端到端 Playwright 测试，覆盖完整回调流程
2. **本周内**：创建 `docs/auth-flow.md` 文档，显式化认证状态机
3. **持续**：在 AI 辅助开发流程中加入"认证/路由变更影响分析"检查点

---

*本文档由深度复盘分析生成，基于 git 历史追溯和代码审查。*
