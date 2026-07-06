# 子迭代评审流程 — 实现记录

> **日期**: 2026-07-06  
> **状态**: 已实施  
> **目标**: 为 Mitosis 平台自身和应用构建实现统一的子迭代评审流程

---

## 一、现状分析

### 1.1 当前应用构建流程

```
用户描述需求 → Workspace 创建 Issue (label: app/{name})
  → CI: Agent Loop 生成 apps/{name}/v{n}
  → worker/verify-build.sh (结构 + 功能验证)
  → Draft PR 创建 → status:review
  → 人工审查 → merge master
  → deploy.yml → GitHub Pages
  → https://mitosis.zenheart.site/apps/{name}/v{n}/
```

**问题**：
- ❌ 没有合并前的预览地址 — 用户必须合入 master 后才能看到线上效果
- ❌ Issue 只有 PR URL，没有"来这里验证"的预览地址

### 1.2 当前平台构建流程

```
用户描述平台修改 → Workspace 创建 Issue (label: platform)
  → CI: Agent Loop 修改 src/、docs/ 等
  → npm run typecheck && npm run build
  → main-pipeline.sh (安全扫描 + 结构检查)
  → Draft PR 创建 → status:review
  → 人工审查 → merge master
  → deploy.yml → GitHub Pages
  → https://mitosis.zenheart.site/ (平台更新)
```

**问题**：
- ❌ 同上，没有合并前的预览
- ❌ 用户无法在不合入 master 的情况下验证平台修改的实际效果

### 1.3 当前验证能力盘点

| 验证层 | 应用构建 | 平台构建 | 缺口 |
|--------|---------|---------|------|
| 文件结构 | ✅ verify-build.sh | ✅ main-pipeline.sh | 无 |
| TypeScript | ✅ | ✅ | 无 |
| 构建产物 | ✅ | ✅ | 无 |
| 安全扫描 | ✅ | ✅ | 无 |
| 运行时预览 | ✅ vite preview + curl | ❌ | 平台缺运行时验证 |
| 合并前预览地址 | ❌ | ❌ | **完全缺失** |
| Chrome MCP 深度验证 | ❌ | ❌ | 需用户交互式执行 |

---

## 二、目标评审流程设计

### 2.1 统一流程

```
┌──────────────────────────────────────────────────────────────────────┐
│                      子迭代评审流程（统一）                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  阶段 1: 需求输入                                                     │
│  ┌────────┐                                                          │
│  │ 用户   │ → 描述需求（应用或平台）                                    │
│  └────┬───┘                                                          │
│       ↓                                                              │
│  ┌────────┐  Workspace 分流                                           │
│  │ Issue  │ → app/{name} label 或 platform label                      │
│  └────┬───┘                                                          │
│       ↓                                                              │
│  阶段 2: 自动构建                                                     │
│  ┌────────┐                                                          │
│  │ CI     │ → Agent Loop 执行构建                                      │
│  │        │ → 创建 review 分支                                        │
│  │        │ → 部署预览到 gh-pages/preview/{issue-number}/             │
│  │        │ → Issue 评论更新（PR + 预览 + 验证指南）                   │
│  └────┬───┘                                                          │
│       ↓                                                              │
│  ┌─────────────────────────────────────┐                             │
│  │ Issue 评论:                          │                             │
│  │ 🧪 构建完成                          │                             │
│  │ PR: https://github.com/.../pull/123 │                             │
│  │ 预览: https://.../preview/123/      │                             │
│  │ 本地验证: git checkout + npm run dev │                             │
│  │   + Chrome MCP 控制 localhost:5173   │                             │
│  └─────────────────────────────────────┘                             │
│       ↓                                                              │
│  阶段 3: 人工验证（用户执行）                                           │
│  ┌────────┐                                                          │
│  │ 用户   │ → 拉取 review 分支                                        │
│  │        │ → npm run dev (localhost:5173)                            │
│  │        │ → Chrome MCP 直接连接浏览器验证                            │
│  │        │ → 验证通过 → merge PR                                     │
│  └────┬───┘                                                          │
│       ↓                                                              │
│  阶段 4: 部署                                                         │
│  ┌────────┐                                                          │
│  │ deploy │ → merge master → deploy.yml                              │
│  │.yml    │ → GitHub Pages                                           │
│  └────────┘ → 生产环境可用                                             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **统一流程** | 应用构建和平台构建使用相同的评审流程 |
| **预览先行** | 合并前必须有可访问的预览地址 |
| **MCP 直接验证** | 验证直接用 Chrome MCP 工具连接浏览器，无需封装脚本 |
| **本地可复现** | 用户可在本地 localhost:5173 通过 MCP 复现验证 |
| **Issue 即看板** | 所有状态、地址、结果都在 Issue 中可见 |

---

## 三、技术实现方案

### 3.1 CI: 预览部署（已实施）

在 `mitosis.yml` 的 "Commit and create review PR" 步骤后、Comment handoff 前插入预览部署步骤。

**关键设计**：
- 平台构建：inline `npm run build` 确保 `dist/` 存在，然后将 `base` 从 `/` 改为 `./`（子路径部署需要相对路径）
- 应用构建：在 app 目录下 `npm run build`，然后复制 `dist/` 到预览路径
- 部署目标：`gh-pages` 分支的 `preview/{issue-number}/` 目录
- 预览 URL 输出到 `GITHUB_OUTPUT`，供后续步骤使用

```yaml
- name: Deploy preview
  if: always()
  id: deploy_preview
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    ISSUE_NUMBER: ${{ steps.auth.outputs.issue_number }}
    IS_PLATFORM: ${{ steps.parse.outputs.is_platform }}
    APP_NAME: ${{ steps.parse.outputs.app_name }}
    NEXT_VERSION: ${{ steps.parse.outputs.version }}
  run: |
    # 仅在授权且非 unknown app 时部署
    if [ "${{ steps.auth.outputs.authorized }}" != "true" ] || [ "${{ steps.parse.outputs.app_name }}" = "unknown" ]; then
      echo "Skipping preview deploy"
      echo "preview_url=" >> "$GITHUB_OUTPUT"
      exit 0
    fi

    cd "$GITHUB_WORKSPACE"
    PREVIEW_DIR="/tmp/mitosis-pview"
    rm -rf "$PREVIEW_DIR"
    mkdir -p "$PREVIEW_DIR/preview/$ISSUE_NUMBER"

    if [ "$IS_PLATFORM" = "true" ]; then
      # 确保 dist/ 存在
      if [ ! -d "dist" ]; then
        npm run build 2>&1 | tail -3
      fi
      cp -r dist/* "$PREVIEW_DIR/preview/$ISSUE_NUMBER/"
      # 子路径部署：base 改为相对路径
      sed -i 's|<base href="/">|<base href="./">|' "$PREVIEW_DIR/preview/$ISSUE_NUMBER/index.html"
    else
      # 应用构建并复制
      APP_DIR="apps/$APP_NAME/$NEXT_VERSION"
      if [ -d "$APP_DIR" ] && [ -f "$APP_DIR/package.json" ]; then
        cd "$APP_DIR"
        npm ci --silent 2>/dev/null || npm install --silent 2>/dev/null || true
        npm run build 2>&1 | tail -3
        cd "$GITHUB_WORKSPACE"
        if [ -d "$APP_DIR/dist" ]; then
          mkdir -p "$PREVIEW_DIR/preview/$ISSUE_NUMBER/apps/$APP_NAME/$NEXT_VERSION"
          cp -r "$APP_DIR/dist"/* "$PREVIEW_DIR/preview/$ISSUE_NUMBER/apps/$APP_NAME/$NEXT_VERSION/"
        fi
      fi
    fi

    # 部署到 gh-pages
    git clone --depth 1 --branch gh-pages \
      "https://x-access-token:${GH_TOKEN}@github.com/${{ github.repository }}.git" \
      "$PREVIEW_DIR/gh-pages" 2>/dev/null || true

    if [ -d "$PREVIEW_DIR/gh-pages" ]; then
      cd "$PREVIEW_DIR/gh-pages"
      rm -rf "preview/$ISSUE_NUMBER"
      cp -r "$PREVIEW_DIR/preview/$ISSUE_NUMBER" .
      git config user.name "mitosis-bot"
      git config user.email "mitosis@users.noreply.github.com"
      git add -A
      git commit -m "feat: preview for issue #$ISSUE_NUMBER" || true
      git push origin HEAD:gh-pages 2>&1 | tail -2
      echo "preview_url=https://mitosis.zenheart.site/preview/$ISSUE_NUMBER/" >> "$GITHUB_OUTPUT"
    else
      echo "preview_url=" >> "$GITHUB_OUTPUT"
    fi
```

**预览 URL 格式**：
- 应用：`https://mitosis.zenheart.site/preview/{issue-number}/apps/{name}/v{n}/`
- 平台：`https://mitosis.zenheart.site/preview/{issue-number}/`

### 3.2 Issue 评论更新（已实施）

修改 "Comment review handoff" 步骤，包含预览地址和本地验证指南。

```yaml
- name: Comment review handoff
  env:
    PR_URL: ${{ steps.review_pr.outputs.pr_url }}
    PREVIEW_URL: ${{ steps.deploy_preview.outputs.preview_url }}
    IS_PLATFORM: ${{ steps.parse.outputs.is_platform }}
    APP_NAME: ${{ steps.parse.outputs.app_name }}
    NEXT_VERSION: ${{ steps.parse.outputs.version }}
    ISSUE_NUMBER: ${{ steps.auth.outputs.issue_number }}
    FALLBACK_NOTE: ${{ steps.review_pr.outputs.fallback_note }}
  run: |
    # 预览 URL 可选（部署失败时为空）
    PREVIEW_SECTION=""
    if [ -n "$PREVIEW_URL" ]; then
      if [ "$IS_PLATFORM" = "true" ]; then
        PREVIEW_SECTION="预览: $PREVIEW_URL\n"
      else
        PREVIEW_SECTION="预览: ${PREVIEW_URL}apps/${APP_NAME}/${NEXT_VERSION}/\n"
      fi
    fi

    if [ "$IS_PLATFORM" = "true" ]; then
      if [ -n "$FALLBACK_NOTE" ]; then
        BODY=$(printf '%s\n\nPR: %s\n\n%s合入 master 后，平台变更将自动部署。\n\n## 本地验证\n\`\`\`bash\ngit checkout %s\nnpm run dev\n# 浏览器打开 http://localhost:5173/\`\`\`' \
          "$FALLBACK_NOTE" "$PR_URL" "$PREVIEW_SECTION" "${{ steps.review_pr.outputs.branch }}")
      else
        BODY=$(printf '🧪 平台变更已通过自动验证，进入人工审查。\n\nPR: %s\n\n%s合入 master 后，平台变更将自动部署。\n\n## 本地验证\n\`\`\`bash\ngit checkout %s\nnpm run dev\n# 浏览器打开 http://localhost:5173/\`\`\`' \
          "$PR_URL" "$PREVIEW_SECTION" "${{ steps.review_pr.outputs.branch }}")
      fi
    else
      if [ -n "$FALLBACK_NOTE" ]; then
        BODY=$(printf '%s\n\nPR: %s\n\n%s合入 master 后，部署 workflow 会发布到 https://mitosis.zenheart.site/apps/%s/%s/\n\n## 本地验证\n\`\`\`bash\ngit checkout %s\nnpm run dev\n# 浏览器打开 http://localhost:5173/apps/%s/%s/\`\`\`' \
          "$FALLBACK_NOTE" "$PR_URL" "$PREVIEW_SECTION" "$APP_NAME" "$NEXT_VERSION" \
          "${{ steps.review_pr.outputs.branch }}" "$APP_NAME" "$NEXT_VERSION")
      else
        BODY=$(printf '🧪 %s %s 已通过自动验证，进入人工审查。\n\nPR: %s\n\n%s合入 master 后，部署 workflow 会发布到 https://mitosis.zenheart.site/apps/%s/%s/\n\n## 本地验证\n\`\`\`bash\ngit checkout %s\nnpm run dev\n# 浏览器打开 http://localhost:5173/apps/%s/%s/\`\`\`' \
          "$APP_NAME" "$NEXT_VERSION" "$PR_URL" "$PREVIEW_SECTION" "$APP_NAME" "$NEXT_VERSION" \
          "${{ steps.review_pr.outputs.branch }}" "$APP_NAME" "$NEXT_VERSION")
      fi
    fi

    gh issue comment "$ISSUE_NUMBER" --repo "${{ github.repository }}" --body "$BODY"
```

### 3.3 本地 Chrome MCP 验证（交互式，无需脚本）

验证直接用 Chrome MCP 工具（`mcp__chrome-devtools__*`）控制浏览器完成：

```bash
# 1. 拉取分支
git checkout <review-branch>
npm run dev

# 2. 使用 Chrome MCP 连接浏览器验证
# 在 Claude Code 中直接使用 MCP 工具：
# - mcp__chrome-devtools__navigate_page → 打开 localhost:5173
# - mcp__chrome-devtools__take_snapshot → 检查页面结构
# - mcp__chrome-devtools__click → 交互测试
# - mcp__chrome-devtools__evaluate_script → 执行 JS 检查
```

**验证清单（用户自行使用 MCP 工具完成）**：
- [ ] 页面正常加载，无 JS 错误
- [ ] 核心交互元素可点击/输入
- [ ] 应用功能符合 Issue 要求
- [ ] 平台改动不破坏现有功能

---

## 四、变更影响分析

### 4.1 影响范围

| 文件/组件 | 修改 | 影响 |
|----------|------|------|
| `.github/workflows/mitosis.yml` | 新增步骤 | 预览部署 + Issue 评论增强 |
| `vite.config.ts` | 无修改 | 预览服务器配置已存在 |
| `deploy.yml` | 无修改 | 预览部署独立于生产部署 |
| `scripts/verify/chrome-mcp-review.sh` | 不创建 | 验证直接用 MCP 工具 |

### 4.2 边界条件

| 场景 | 处理 |
|------|------|
| 预览部署失败 | CI 继续（`if: always()`），Issue 不含预览 URL |
| 平台 `dist/` 不存在 | inline `npm run build` 兜底 |
| 应用 `package.json` 不存在 | 跳过该应用，不阻塞 |
| 预览 URL 被覆盖 | 每次部署使用 issue-number 作为路径，不冲突 |
| 多 Issue 同时预览 | 每个 Issue 独立路径 `preview/{issue-number}/` |
| 本地 Chrome 未运行 | MCP 工具会报错，提示用户启动 Chrome |

### 4.3 测试覆盖

- [ ] 新建应用 Issue，触发完整流程，验证预览 URL 可访问
- [ ] 新建平台 Issue，触发完整流程，验证预览 URL 可访问
- [ ] 验证 Issue 评论包含 PR URL + 预览 URL + 本地验证指南
- [ ] 验证本地 `npm run dev` + Chrome MCP 可正常验证

### 4.4 回退方案

```bash
# 回退 mitosis.yml 预览部署相关修改
git revert <commit>

# 或临时禁用预览部署（修改 if 条件）
```

---

## 五、实施记录

### 已完成的修改

| 文件 | 修改内容 |
|------|---------|
| `.github/workflows/mitosis.yml` | 新增 "Deploy preview" 步骤 + 更新 "Comment review handoff" |
| `docs/sub-iteration-review.md` | 创建实现记录（本文档） |

### 未实施的（P2）

| 功能 | 原因 |
|------|------|
| CI Chrome MCP 自动验证 | CI 环境无 Chrome 浏览器，验证应在用户本地通过 MCP 工具完成 |
| `scripts/verify/chrome-mcp-review.sh` | 用户要求验证直接用 MCP 工具，不需要脚本封装 |

---

## 六、与现有架构的关系

### 6.1 不改变的核心流程

```
Issue → /create → CI Agent Loop → Draft PR → Human Review → Merge → Deploy
```

### 6.2 新增的增强

```
                          ┌─────────────────┐
                          │   预览部署       │
                          │  gh-pages/      │
                          │  preview/{n}/   │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │ Issue 评论更新   │
                          │ PR + 预览 + 指南 │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │ 用户 Chrome MCP │
                          │ localhost:5173  │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │ merge PR → Deploy│
                          └─────────────────┘
```

### 6.3 数据流

```mermaid
sequenceDiagram
    participant User
    participant Issue
    participant CI
    participant Agent
    participant Verifier
    participant Preview
    participant ChromeMCP

    User->>Issue: 创建 Issue (app/{name} 或 platform)
    Issue->>CI: /create 触发
    CI->>Agent: Agent Loop 构建
    Agent->>CI: 构建完成
    CI->>Verifier: 运行 verifier
    Verifier->>CI: PASS
    CI->>CI: Commit + 创建 Draft PR
    CI->>Preview: 部署到 gh-pages/preview/{issue-number}/
    Preview->>CI: 预览 URL 可用
    CI->>Issue: 评论 (PR + 预览 URL + 本地验证指南)
    Issue->>User: 收到通知
    User->>Preview: 在线查看预览（可选）
    User->>User: git checkout + npm run dev
    User->>ChromeMCP: 连接 localhost:5173 深度验证
    ChromeMCP->>User: 验证结果
    User->>Issue: 验证通过，merge PR
    Issue->>CI: merge → deploy.yml → GitHub Pages
```

---

## 七、总结

当前 Mitosis 的子迭代评审流程存在**三个核心缺口**：

1. **没有合并前预览** — 用户无法在合并前看到实际效果
2. **Issue 没有完整的评审信息** — 只有 PR URL，缺少预览地址和验证指南

**实施方案**：

1. **CI 预览部署** — 将 review 分支部署到 `gh-pages/preview/{issue-number}/` ✅
2. **Issue 评论增强** — 包含 PR URL + 预览 URL + 本地 Chrome MCP 验证指南 ✅
3. **本地 Chrome MCP 验证** — 用户交互式使用 MCP 工具连接 localhost:5173 ✅

**统一性**：该方案同时适用于应用构建和平台构建，两者使用相同的预览部署和 Issue 评论格式。

**验证方式**：直接用 Chrome MCP 工具（`mcp__chrome-devtools__*`）控制浏览器交互式验证，无需脚本封装。
