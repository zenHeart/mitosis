---
name: gallery-api-timeout-protection
description: Gallery API calls must have timeout protection and LOCAL_APPS default to prevent stuck loading states
metadata: 
  node_type: memory
  type: reference
  originSessionId: 725bec4d-6db0-475b-b6b9-b3c430755295
---

# Gallery API 超时保护与 LOCAL_APPS 默认值

## 问题

Gallery 从 GitHub API 加载应用列表时，如果 API 响应慢或失败，页面会永远处于 loading 状态。同时 `LOCAL_APPS` 如果未定义默认值，也会导致同样的卡死。

## 规则

1. **所有 Gallery API 调用必须设置超时**（建议 8-10 秒），超时后 fallback 到本地数据或显示错误提示
2. **`LOCAL_APPS` 必须提供默认值**，不能依赖外部 API 成功才渲染
3. **加载状态必须有超时兜底**：`loading && elapsed > timeout → show error/fallback`

## 反模式

```typescript
// ❌ 无超时，API 慢则永远 loading
const apps = await fetchGitHubApps()

// ✅ 超时 + fallback
const apps = await fetchWithTimeout(url, {}, 8000).catch(() => LOCAL_APPS)
```

## 教训来源

- `658d062` — Gallery API timeout + LOCAL_APPS default to prevent stuck loading
- `d0ccdd9` — CI deploy cd路径错误 + Gallery API超时保护
- 用户反馈：Gallery 页面加载卡死

## 相关记忆

- [[github-oauth-static-hosting]] — 静态托管下的 API 调用限制
- [[use-worktree-for-branch-operations]] — 构建发布操作注意事项
