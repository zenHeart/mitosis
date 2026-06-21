---
name: vite-proxy-direct-to-upstream
description: "Vite dev server proxy should target upstream API directly, not through unnecessary local middleman processes"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 459fe9cf-3e89-4b1f-8225-7b6670cb9b5f
---

## 问题根因

`vite.config.ts` 的 proxy target 指向 `localhost:5174`（`tools/github-proxy.js`），但该 Node.js 进程不会随 `npm run dev` 自动启动。开发者期望"本地直接运行调试线上授权场景"，结果必然遇到 ECONNREFUSED。

## 根本原因

`tools/github-proxy.js` 存在的唯一目的是给 GitHub API 请求注入 `Authorization: Bearer TOKEN` header。但 Vite proxy 原生支持 `headers` 选项，可以直接完成同一件事——不需要额外的 Node.js 进程作为中间层。

## 错误架构（已废弃）

```
浏览器 → Vite proxy(5173) → localhost:5174(github-proxy.js) → api.github.com
         ↑ 中间层多余，不随 npm run dev 管理
```

## 正确架构

```
浏览器 → Vite proxy(5173) → api.github.com
         headers 中直接注入 Authorization
```

## Vite proxy 最佳实践

```typescript
server: {
  proxy: {
    '/api/github/': {
      target: 'https://api.github.com',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/github/, ''),
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    },
  },
},
```

## 设计规则（铁律）

> **不要创建随 dev server 不会自动管理的本地中间进程。Vite proxy 能直接代理到上游时，直接在 proxy headers 中注入所需 header，不需要 node tools/xxx.js 作为中间人。**

| 检查项 | 标准 |
|--------|------|
| proxy 是否需要 auth header？ | 直接在 Vite proxy `headers` 中注入 |
| proxy 是否需要修改 body？ | Vite proxy 支持，不需要本地中间层 |
| proxy 需要 CORS 绕过？ | Vite proxy + `changeOrigin: true` 处理 |
| 额外启动的进程是否随 npm run dev 管理？ | 不应该有额外进程 |

## 相关记忆

- [[gallery-api-timeout-protection]] — Gallery API 超时保护
- [[oauth-redirect-loop-github-pages]] — OAuth 本地调试模式
