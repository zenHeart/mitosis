# GitHub OAuth App 配置指南

## 概述

Mitosis 使用 GitHub OAuth 2.0 进行用户认证。本文档指导如何创建和配置 GitHub OAuth App。

## 创建步骤

### 方式 A：通过 GitHub Web 界面（推荐）

1. 访问 https://github.com/settings/developers
2. 点击 **New OAuth App**
3. 填写以下信息:

| 字段 | 值 |
|------|-----|
| Application name | `Mitosis` |
| Homepage URL | `https://mitosis.zenheart.site` |
| Authorization callback URL | `https://mitosis.zenheart.siteauth/callback` |
| Device flow | 不勾选（MVP 不需要） |

4. 点击 **Register application**
5. 生成 Client Secret: 点击 **Generate a new client secret**
6. 记录以下信息:
   - **Client ID** — 前端代码使用
   - **Client Secret** — 存储为 GitHub Secret（`zenHeart/mitosis` 仓库）

### 方式 B：通过 GitHub API（需要 admin:oauth_app scope）

```bash
# 如果已有 PAT 包含 admin:oauth_app scope
curl -X POST \
  -H "Authorization: Bearer YOUR_PAT" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/applications \
  -d '{
    "name": "Mitosis",
    "url": "https://mitosis.zenheart.site",
    "callback_url": "https://mitosis.zenheart.siteauth/callback"
  }'
```

## 存储凭证

### Client ID — 前端使用

将 Client ID 写入 `.env` 文件（.gitignore 已排除）:

```
VITE_GITHUB_CLIENT_ID=Ov23xxxxxxxxxxxxxxxxxxxx
```

### Client Secret — GitHub Secret

```bash
gh secret set GITHUB_OAUTH_CLIENT_SECRET \
  --repo zenHeart/mitosis \
  --body "your-client-secret"
```

## OAuth 流程（MVP — Implicit Flow）

```
┌──────────┐     ┌──────────────┐     ┌─────────┐
│  浏览器   │────▶│  Mitosis 前端  │────▶│ GitHub  │
│          │     │              │     │  OAuth  │
└──────────┘     └──────────────┘     └─────────┘
       │                                     │
       │  1. GET /login/github               │
       │────────────────────────────────────▶│
       │                                     │
       │  2. 302 Redirect to:                │
       │     github.com/login/oauth/authorize│
       │     ?client_id=XXX                  │
       │     &redirect_uri=/auth/callback    │
       │     &scope=read:user,repo           │
       │────────────────────────────────────▶│
       │                                     │
       │  3. 用户授权后 GitHub 重定向:         │
       │     /auth/callback?code=XXX          │
       │◀─────────────────────────────────────│
       │                                     │
       │  4. POST github.com/login/oauth/    │
       │     access_token                    │
       │     (需要 Client Secret — 服务端)    │
       │                                     │
       │  ⚠️ MVP 方案:                        │
       │  Implicit flow 不可获取 refresh_token │
       │  每次会话需重新授权                    │
       └─────────────────────────────────────┘
```

### MVP 安全说明

MVP 阶段使用 **Implicit Flow**（纯前端 OAuth），存在以下限制:
- 无法获取 refresh_token，session 过期需重新登录
- token 存储在 sessionStorage（关闭标签页即丢失）
- 存在 XSS 风险（XSS 可窃取 token）

**生产环境建议:** 后续迭代添加后端服务（可通过初始化配置启用），使用 Authorization Code Flow + PKCE。

## Scope 选择

MVP 所需最小 Scope:

| Scope | 用途 |
|-------|------|
| `read:user` | 获取登录用户信息 |
| `repo` | 创建 Issue、读写仓库内容 |
| `workflow` | 触发/管理 GitHub Actions |

---

*配置完成后，将 Client ID 和 Client Secret 告知开发团队。*
