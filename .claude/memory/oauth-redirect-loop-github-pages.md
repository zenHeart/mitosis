---
name: oauth-redirect-loop-github-pages
description: "OAuth on static hosting: 404.html fallback pattern + code exchange MUST be in authStore.init() (not conditionally-rendered UI)"
metadata:
  node_type: memory
  type: reference
  originSessionId: 92fdb38b-33bf-441b-b511-862d36c8514f
---

# OAuth on Static Hosting — 404.html Fallback + authStore.init() 铁律

## 问题

GitHub Pages 是纯静态托管，**不支持客户端路由**。当 OAuth 回调到 `/auth/callback#access_token=xxx` 时：
- GitHub Pages 找不到这个路径 → 返回 404
- 如果没有 404.html fallback → 用户看到 404 页面，token 丢失

## 解决方案：404.html SPA Fallback

在 `public/404.html` 中：
1. 检测路径是否为 `/auth/callback`
2. 保存 OAuth 数据（code 或 hash）到 sessionStorage
3. 重定向到 `/`（Vue SPA 入口）
4. SPA 从 sessionStorage / URL hash 中恢复 token

### 关键：保留 Hash Fragment

对于 Implicit Flow，token 在 URL hash 中（`#access_token=xxx`）。404.html 必须**显式保留 hash**：

```javascript
// ❌ 错误：location.replace('/') 会丢失 hash
window.location.replace('/');

// ✅ 正确：手动拼接 hash
var target = '/';
if (hash) { target += hash; }
window.location.replace(target);
```

## 铁律：OAuth Code Exchange 必须在 authStore.init()

404.html 将 code 存入 sessionStorage 后，SPA 启动时 `authStore.init()` 必须**无条件消费**这个 code：

```typescript
// ✅ authStore.init() — 每次启动无条件执行
async function init() {
  const code = sessionStorage.getItem('mitosis_oauth_code')
  if (code) {
    const { access_token } = await exchangeCodeForToken(code)
    // ... 设置 token + user
  }
}

// ❌ LoginPage.vue onMounted — 条件渲染时可能不执行
// 如果 view='gallery'，LoginPage 不渲染 → code 永远不交换 → 用户卡住
```

**规则：**
- OAuth code 是"一次性状态"，由 store（状态管理层）处理，不由 UI 组件处理
- `authStore.init()` 在 App.vue onMounted 时无条件执行，不依赖任何 UI 组件是否渲染
- LoginPage 只负责渲染 UI，不做任何副作用（API 调用、token 交换等）

## 根本限制：纯静态托管无法完成标准 OAuth

从 GitHub 官方文档确认：
1. **"The implicit grant type is not supported."** — 官方不推荐 Implicit Flow
2. Web Application Flow 需要 `client_secret` 兑换 token，但 CORS 阻止浏览器直接调用
3. PKCE 被标记为 "strongly recommended"，但兑换步骤仍然需要 `client_secret`
4. **根本限制是静态托管没有后端** — 这不是代码问题，是架构限制

**当前方案：** 继续使用 Implicit Flow（`response_type=token`）—— 尽管官方不支持，GitHub 服务器仍然接受并返回 `#access_token=xxx`。这是事实上的兼容行为，不是设计特性，随时可能被关闭。

## 相关记忆

- [[github-oauth-static-hosting]] — 根本限制的完整分析
- [[vite-proxy-direct-to-upstream]] — Vite proxy 直接代理到 api.github.com
- [[ci-workflow-lessons-learned]] — CI 构建时环境变量处理（Lesson 6）
