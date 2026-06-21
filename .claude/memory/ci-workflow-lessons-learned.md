---
name: ci-workflow-lessons-learned
description: "CI 构建流程完整经验：Agent Loop 超时、git 操作、env vars、prompt 质量、gh-pages 部署 — 所有 CI 教训集中于此"
metadata:
  node_type: memory
  type: project
  originSessionId: 92fdb38b-33bf-441b-b511-862d36c8514f
---

# CI 构建流程完整经验

## Lesson 1: Agent Loop 超时（max turns 不够）

**错误现象**：`Error: Reached max turns (50)`
**根本原因**：构建完整的 Vue 应用需要很多轮操作（读取 Issue、创建多个文件、安装依赖、修复构建错误等），50 轮经常不够。
**解决**：`--max-turns` 从 50 增加到 80；prompt 中明确告诉 agent 构建失败时要修复后重试。

## Lesson 2: git 操作必须在主仓库执行

**错误现象**：`CONFLICT (add/add): Merge conflict` + rebase 失败
**根本原因**：CI 中 `cd apps/xxx && git init` 创建子仓库，导致与主仓库文件冲突。

**规则：**
- CI 操作必须在**主仓库根目录**执行，禁止 `git init` 子目录
- push 前必须 `git fetch origin && git rebase origin/master`
- 只 stage 需要的目录：`git add apps/$APP_NAME/$VERSION/`，不要 `git add -A`
- push 前先 `git checkout -- .` 丢弃意外改动

## Lesson 3: CI 本地仓库可能落后于远程

**错误现象**：`! [rejected] master -> master (fetch first)`
**解决**：push 前先 `git fetch origin` + `git rebase origin/master`

## Lesson 4: Prompt 质量决定 Agent 行为

**错误现象**：Agent 有时在根目录创建文件，有时不 cd 就执行 npm 命令
**解决**：Prompt 中将 `cd apps/xxx/version/` 作为**第一步**，强调"必须切换到此目录后再创建文件"；明确列出要创建的文件。

## Lesson 5: gh-pages 分支操作用 worktree

**错误现象**：切换当前目录分支影响工作状态
**解决**：使用 `git worktree add` 在独立目录创建 gh-pages worktree；或 CI 中使用临时目录（`/tmp/gh-pages`）。

## Lesson 6: CI 环境变量不自动传递

**错误现象**：`VITE_GITHUB_CLIENT_ID` 在 CI 构建中为空字符串 → 构建产物中登录按钮被禁用

**规则：**
- CI 构建时显式传递环境变量，不要假设 `.env` 自动可用
- Vite config 中增加 `process.env` fallback：
  ```typescript
  const GITHUB_CLIENT_ID = _env.VITE_GITHUB_CLIENT_ID
    || process.env.VITE_GITHUB_CLIENT_ID
    || ''
  ```
- workflow 中显式注入：
  ```yaml
  env:
    VITE_GITHUB_CLIENT_ID: ${{ secrets.VITE_GITHUB_CLIENT_ID }}
  ```

## Lesson 7: 构建产物部署路径

v1 的构建产物（dist/）必须部署到 gh-pages 的 `apps/{name}/v{n}/` 路径下，否则用户无法直接访问。

## 正确 CI 流程

```
1. Parse step: 确定 app_name 和 version
2. Run Agent Loop: agent 在 apps/xxx/vN/ 下创建文件并构建
3. Commit and push: 主仓库中只 add apps/xxx/vN/，commit 并 push
4. Deploy to GitHub Pages: clone gh-pages 到 /tmp/gh-pages，复制 dist/，commit push
5. Close issue: 构建成功后关闭 Issue
```

## 关键修改记录

| 时间 | 修改 | 原因 |
|------|------|------|
| 初始 | `--max-turns 50` | 默认值 |
| 第一次失败后 | `--max-turns 80` | Agent loop 超时 |
| 第二次失败后 | 主仓库直接 `git add apps/xxx/vN/` | 子仓库 rebase 冲突 |
| Prompt 修改 | Step 2 改为 cd first | Agent 不 cd 就创建文件 |

## 相关记忆

- [[vite-proxy-direct-to-upstream]] — Vite proxy 直接代理到上游
- [[ci-env-vars-not-passed-by-default]] — 已合并入本文档 Lesson 6
- [[ci-build-main-repo-only]] — 已合并入本文档 Lesson 2
