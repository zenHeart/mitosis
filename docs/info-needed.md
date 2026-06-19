# 需要用户提供的信息

> 本文档列出 Mitosis 项目执行前需要用户确认或提供的信息。  
> 按优先级排列，P0 为阻塞项。

---

## P0 — 阻塞执行

### 1. GitHub OAuth App 凭证

**需要:** Client ID 和 Client Secret

**选项 A — 用户已有:** 提供 Client ID 和 Client Secret
**选项 B — 用户无:** Agent 指导用户创建，或由 Agent 创建（如果 PAT 有 `admin:oauth_app` scope）

**用途:** 前端 OAuth 登录流程

**参考文档:** [docs/oauth-setup.md](./oauth-setup.md)

---

### 2. GitHub PAT（Personal Access Token）

**需要:** 一个具备 `repo` + `workflow` scope 的 PAT

**用途:** 
1. GitHub Actions 中跨仓库部署（`zenHeart/mitosis` → `zenHeart/zenHeart.github.io`）
2. Actions 读取仓库内容、commit、push

**创建步骤:**
```bash
# 通过 gh CLI 生成
gh auth token

# 或在浏览器中:
# https://github.com/settings/tokens → Generate new token (classic)
# scopes: repo, workflow
```

**存储方式:**
```bash
gh secret set MITOSIS_PAT --repo zenHeart/mitosis --body "ghp_你的token"
```

---

### 3. 确认：自动 commit 到博客仓库

**需要:** 用户确认同意 Agent 通过 PAT 自动 commit 到 `zenHeart/zenHeart.github.io`

**影响:** 如果不允许，`blog.zenheart.site/mitosis/` 部署路径需要更换方案

**替代方案:**
- 使用 GitHub Pages 直接部署 `zenHeart/mitosis` 到 `mitosis.zenheart.site`
- 用户手动将构建产物复制到博客仓库

---

## P1 — 增强但不阻塞

### 4. StepFun API Token

**状态:** 已确认存在于 `.claude/settings.local.json`

**需要:** 用户确认是否将此 Token 用于 GitHub Secrets `STEP_TOKEN`

```bash
# Token 值（已脱敏）
ANTHROPIC_AUTH_TOKEN=4tgg2...（见 settings.local.json）
```

---

### 5. 博客仓库结构确认

**需要:** 确认 `zenHeart/zenHeart.github.io` 中是否已有 `mitosis/` 目录

**当前状态:** 未知（博客仓库为 private 或内容未列出）

**影响:**
- 已有目录 → 合并或覆盖（Agent 选择覆盖以确保一致性）
- 无目录 → 创建

---

## P2 — 优化项

### 6. 应用模板偏好

**需要:** 用户是否希望 Mitosis 内置一些常用应用模板

**示例:**
- Todo 应用
- 计算器
- Markdown 编辑器
- 数据可视化面板

### 7. 多语言支持

**需要:** MVP 界面语言偏好

**建议:** 中文（与 README 一致）

---

## 快速确认表单

```
请确认以下信息:

1. OAuth App
   [ ] 已有 OAuth App → Client ID: _______
   [ ] 需要新建

2. PAT
   [ ] 已有 PAT → Token: _______
   [ ] 需要新建

3. 博客仓库权限
   [ ] 同意 Agent 自动 commit 到 zenHeart/zenHeart.github.io
   [ ] 不同意（需要替代方案）

4. StepFun Token
   [ ] 使用 settings.local.json 中的 Token
   [ ] 提供新 Token: _______

5. 博客仓库 mitosis 目录
   [ ] 确认不存在（Agent 创建）
   [ ] 已存在（Agent 合并）
```

---

*填写完成后，Agent 将从 Phase 1 开始执行。*
