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

### 国内网络访问（重要）

`*.workers.dev` 域名在中国大陆被 DNS 污染 + SNI 阻断，**国内用户不开代理时 OAuth 登录会卡在 token 兑换这一步**（GitHub 授权页和 GitHub Pages 站点本身可达，唯一被墙的一跳是浏览器 POST 到 workers.dev）。解决方案是给 Worker 绑定自定义域名（Cloudflare 自定义域名走 Cloudflare edge IP，国内可达）：

1. 将域名（或一个专用子域的 zone）迁移到 Cloudflare DNS（Workers 自定义域名要求 zone 托管在 Cloudflare；当前 `zenheart.site` 的 DNS 在阿里云，需迁移 NS 或换一个托管在 Cloudflare 的域名）。
2. 在 Cloudflare Dashboard → Workers → `mitosis-oauth-proxy` → Settings → Domains & Routes 添加自定义域名（如 `oauth.example.com`），或在 `worker/wrangler.jsonc` 配置 `routes` 后重新 `npx wrangler deploy`。
3. 构建前端时设置：

```text
VITE_OAUTH_PROXY_URL=https://oauth.example.com
```

未设置 `VITE_OAUTH_PROXY_URL` 时，默认仍使用 `mitosis-oauth-proxy.zenheart1991.workers.dev`（需要代理才能在国内访问）。前端在 token 兑换网络失败时会向用户提示国内网络场景的原因和出路。

> 迁移 DNS 后注意：`mitosis.zenheart.site` 的 CNAME（指向 `zenheart.github.io`）需要在 Cloudflare 中以 **DNS only**（灰云）模式重建，否则 GitHub Pages 的证书签发会失败。

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

### Mock 模式（无需 GitHub 仓库）

在 `.env.local` 中设置 `VITE_USE_MOCK_GITHUB=true`，然后直接运行：

```bash
npm run dev
```

> `.env.local` 已加入 `.gitignore`，不会被提交。

设置 `VITE_USE_MOCK_GITHUB=true` 后，所有 GitHub API 调用路由到浏览器 `localStorage`，无需真实仓库和 OAuth 配置。适合 UI 开发和集成测试：

- `mitosis_mock_sessions` — 存储 chat session 列表
- `mitosis_mock_sessions_messages` — 存储每个 session 的评论（消息）
- `/create 描述` 命令直接触发构建流程，跳过 AI 对话

清除 mock 数据：在浏览器控制台执行 `localStorage.removeItem('mitosis_mock_sessions')` 和 `localStorage.removeItem('mitosis_mock_sessions_messages')`，或在代码中调用 `clearMockData()`。

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
/goal Read goal.md and follow CLAUDE.md plus .claude/skills/setgoal/SKILL.md, complete all acceptance criteria, include verifier PASS and command outputs in the transcript, stop after 20 turns if blocked.
```
