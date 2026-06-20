# Setup

本文档描述运行 Mitosis MVP 所需的外部配置。

## OAuth 后端代理（Cloudflare Worker）

由于 GitHub Pages 是纯静态托管，浏览器无法直接调用 GitHub 的 `/login/oauth/access_token` 端点（CORS 限制）。Mitosis 使用 [Cloudflare Workers](https://developers.cloudflare.com/workers/) 部署一个轻量级 OAuth Token 兑换代理，解决此问题。

### 架构

```text
┌─────────────┐     ┌──────────────────────────────────┐     ┌─────────────┐
│  浏览器 SPA  │────▶│  Cloudflare Worker (OAuth Proxy) │────▶│   GitHub    │
│  (GitHub    │     │  mitosis-oauth-proxy.workers.dev │     │  OAuth API  │
│   Pages)    │◀────│  兑换 code → access_token         │◀────│             │
└─────────────┘     └──────────────────────────────────┘     └─────────────┘
```

### 部署 OAuth Proxy Worker

Worker 源码位于本仓库的 `worker/` 目录：

```bash
cd worker

# 1. 安装依赖
npm install

# 2. 登录 Cloudflare
npx wrangler login

# 3. 设置 Secrets
npx wrangler secret put GITHUB_CLIENT_ID     # <github-oauth-client-id>
npx wrangler secret put GITHUB_CLIENT_SECRET # <github-oauth-client-secret>

# 4. 部署
npx wrangler deploy
```

授权流程使用 Authorization Code Flow（`response_type=code`），Worker 代理负责用 `client_secret` 兑换 token。

## 1. GitHub OAuth App

在 GitHub Developer settings 创建 OAuth App：

| 字段 | 值 |
|------|-----|
| Application name | `Mitosis` |
| Homepage URL | `https://mitosis.zenheart.site` |
| Authorization callback URL | `https://mitosis.zenheart.site/auth/callback` |

Mitosis 使用 Authorization Code Flow。浏览器拿到 `code` 后交给 Cloudflare Worker，Worker 使用服务端 secret 向 GitHub 换取 token，避免浏览器直接持有 client secret。

## 2. 前端 Client ID

本地开发时在 `.env` 写入：

```text
VITE_GITHUB_CLIENT_ID=<github-oauth-client-id>
VITE_GITHUB_REPO_OWNER=<github-user-or-org>
VITE_GITHUB_REPO_NAME=mitosis
```

生产部署时在 GitHub Actions secret 或 Pages 构建环境中配置同名值。默认仓库是 `zenHeart/mitosis`；fork/复制到自己的仓库后，应把 `VITE_GITHUB_REPO_OWNER` 改为自己的 GitHub 用户名或组织名。

## 3. Cloudflare Worker

Worker 位于 `worker/`，负责 OAuth code exchange。

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

只把真实 secret 值写入 Cloudflare secret store，不写入仓库。

## 4. StepFun Token

GitHub Actions 中的 Claude Code 使用 StepFun：

```bash
gh secret set STEP_TOKEN --repo <github-user-or-org>/mitosis --body "<stepfun-api-key>"
```

CI 使用：

```text
ANTHROPIC_API_KEY=${{ secrets.STEP_TOKEN }}
ANTHROPIC_BASE_URL=https://api.stepfun.com/step_plan
```

如需改用 StepFun 官方 `.ai` endpoint，先用 `/status` 和最小文件写入任务验证 Claude Code 当前配置，不要只改文档。

## 5. 本地 Claude Code

本地 `/goal` 可读取 `CLAUDE.md`、`.claude/rules/*.md`、hooks、MCP 和 subagent。真实模型配置只能放在 `.claude/settings.local.json` 或用户级设置中，并且不得提交。

`.claude/settings.json` 只保存可共享的项目级安全设置，例如拒绝读取本地 secret 文件。不要把 API key、模型 token 或个人偏好写入其中。

推荐命令：

```text
/goal Read goal.md and follow CLAUDE.md plus .claude/rules/goal-loop.md, complete all acceptance criteria, include verifier PASS and command outputs in the transcript, stop after 20 turns if blocked.
```
