---
name: github-oauth-static-hosting
description: GitHub OAuth cannot be fully implemented on pure static hosting (GitHub Pages) — deep analysis of why and what works
metadata: 
  node_type: memory
  type: reference
  originSessionId: 92fdb38b-33bf-441b-b511-862d36c8514f
---

# GitHub OAuth on Pure Static Hosting — 根本限制

## 核心结论

**纯静态托管（GitHub Pages / Cloudflare Pages 等）上无法完整实现 GitHub OAuth 的标准流程。**

## 官方文档确认（2026-06）

从 GitHub 官方文档（`docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps`）确认：

1. **"The implicit grant type is not supported."** — GitHub 官方**不推荐/不支持** Implicit Flow（`response_type=token`）
2. Web Application Flow 使用 authorization code grant type，**第 3 步需要 `client_secret`** 才能兑换 token
3. PKCE (`code_challenge` + `code_challenge_method=S256`) 被标记为 "strongly recommended"，但**兑换步骤仍然需要 `client_secret`**
4. GitHub 的 **CORS pre-flight requests (OPTIONS) 不被支持** — 浏览器无法直接调用 `/login/oauth/access_token` 端点
5. 仅支持两种流程：**Web Application Flow** 和 **Device Authorization Grant**

## 三种 OAuth 方案对比

| 方案 | 需要后端 | GitHub 官方支持 | 纯静态可用 | 实际效果 |
|------|---------|---------------|-----------|---------|
| Implicit Flow (`response_type=token`) | ❌ | ❌ 不支持 | ✅ 可用 | **目前唯一可行方案** |
| Authorization Code + PKCE | ✅ 需要 proxy | ✅ 推荐 | ❌ CORS 阻塞 | 浏览器内 token 兑换失败 |
| Device Flow | ✅ 需要后端轮询 | ✅ 支持 | ❌ UX 差 | 用户需手动输入 code |

## 为什么 Implicit Flow 仍能用

尽管官方文档声明 "not supported"，GitHub 的 OAuth 服务器**仍然接受** `response_type=token` 参数并返回 `#access_token=xxx`。这是事实上的兼容行为，不是设计特性 — 随时可能被 GitHub 关闭。

## 根本原因分析

```
纯 GitHub Pages = 纯静态 HTML/JS/CSS
    ↓
GitHub OAuth Web Application Flow 要求:
    1. 用户授权 → 获得 code ✅ (纯前端可完成)
    2. 用 client_secret + code 兑换 token ❌ (需要后端)
       ↓
    CORS 阻止浏览器直接请求 /login/oauth/access_token
    ↓
    即使只用 code_verifier (PKCE)，GitHub 文档要求 client_secret
```

## 可行的解决方案

### 方案 A: 继续使用 Implicit Flow（当前方案）
- **优点**: 无需后端，纯前端完成
- **缺点**: 非官方支持，token 出现在 URL hash 中（有一定泄露风险），OAuth 2.1 已废弃
- **风险**: GitHub 随时可能关闭对此 flow 的支持

### 方案 B: 添加轻量后端（推荐长期方案）
使用 Cloudflare Worker / Vercel Function / Netlify Function 作为 token 兑换 proxy：
```
前端 → Worker (兑换 token, 使用 client_secret) → GitHub
```
- **优点**: 使用官方推荐的 Authorization Code + PKCE，安全合规
- **缺点**: 需要额外部署和维护一个 serverless 函数

### 方案 C: GitHub App + JWT
GitHub App 使用 JWT 认证，但其流程也不适合纯静态场景（需要生成 JWT 签名）。

## 经验教训

1. **GitHub 文档没有明确指出静态托管不可行** — 需要自己通过实际测试（CORS 错误）才能发现
2. **"Strongly recommended" ≠ "required"** — PKCE 被推荐但不解决 CORS 问题
3. **Implicit Flow 是事实上的可行方案** — 尽管官方不支持，但在实践中可用
4. **根本限制是静态托管没有后端** — 这不是代码问题，是架构限制
5. **正确阅读 CORS 错误**: `Access to fetch at 'https://github.com/login/oauth/access_token' from origin 'https://xxx' has been blocked by CORS policy` — 这是 GitHub 端点明确拒绝跨域请求

## 相关记忆
- [[oauth-redirect-loop-github-pages]] — 404.html SPA fallback 方案
- [[vite-build-time-env-vars]] — __GITHUB_CLIENT_ID__ 注入方式
