# 需要用户提供的信息

> 本文档列出 Mitosis 项目执行前需要用户确认或提供的信息。
> 按优先级排列，P0 为阻塞项。

---

## P0 — 阻塞执行

### 1. GitHub OAuth App 凭证

**需要:** Client ID 和 Client Secret

**选项 A — 用户已有:** 提供 Client ID 和 Client Secret
**选项 B — 用户无:** 用户自行通过 GitHub Web 或 gh CLI 创建

**用途:** 前端 OAuth 登录流程

**创建步骤:**
```bash
# 方式 A: gh CLI 创建
gh auth login
gh api \
  -X POST \
  /applications \
  -f name="Mitosis" \
  -f url="http://blog.zenheart.site/mitosis/" \
  -f callback_url="http://blog.zenheart.site/mitosis/auth/callback"

# 方式 B: GitHub Web 界面
# https://github.com/settings/developers → New OAuth App
# Homepage URL: http://blog.zenheart.site/mitosis/
# Authorization callback URL: http://blog.zenheart.site/mitosis/auth/callback
```

**存储方式 (创建后):**
```bash
gh secret set GITHUB_OAUTH_CLIENT_ID --repo zenHeart/mitosis --body "你的ClientID"
gh secret set GITHUB_OAUTH_CLIENT_SECRET --repo zenHeart/mitosis --body "你的ClientSecret"
```

**参考文档:** [docs/oauth-setup.md](./oauth-setup.md)

---

### 2. StepFun API Token

**状态:** 已确认存在于 `.claude/settings.local.json`

**需要:** 用户确认是否将此 Token 用于 GitHub Secrets `STEP_TOKEN`

**说明:** 用户在 Mitosis SetupPage 中填写 Token 后，平台会展示指引，引导用户手动在 GitHub 仓库 Settings → Secrets 中添加 `STEP_TOKEN`。Mitosis 不会自动写入任何 Secret。

```bash
# 用户手动执行（或通过 GitHub Web 界面）
gh secret set STEP_TOKEN --repo zenHeart/mitosis --body "你的StepFun Token"
```

---

## P1 — 增强但不阻塞

### 3. 应用模板偏好

**需要:** 用户是否希望 Mitosis 内置一些常用应用模板

**示例:**
- Todo 应用
- 计算器
- Markdown 编辑器
- 数据可视化面板

### 4. 多语言支持

**需要:** MVP 界面语言偏好

**建议:** 中文（与 README 一致）

---

## 快速确认表单

```
请确认以下信息:

1. OAuth App
   [ ] 已有 OAuth App → Client ID: _______
   [ ] 需要新建（用户自行创建）

2. StepFun Token
   [ ] 使用 settings.local.json 中的 Token
   [ ] 提供新 Token: _______

3. 应用模板
   [ ] 内置模板（Todo/计算器/编辑器）
   [ ] 纯空白模板
```

---

*填写完成后，Agent 将从 Phase 1 开始执行。*
