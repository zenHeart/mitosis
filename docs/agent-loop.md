# Agent Loop 技术规格

## 概述

Agent Loop 是 Mitosis 的核心引擎，负责在 GitHub Actions 中执行应用构建任务。

## 运行环境

- **运行时:** GitHub Actions (ubuntu-latest)
- **Agent:** Claude Code CLI (`@anthropic-ai/claude-code`)
- **LLM 后端:** StepFun API (`https://api.stepfun.com/step_plan`)
- **模型:** `step-3.7-flash`
- **工作目录:** 用户仓库根目录
- **最大轮数:** 80
- **超时:** GitHub Actions 默认 6 小时（ubuntu-latest）

## 执行流程

```
┌──────────────────────────────────────────────────────────┐
│                    GitHub Actions Trigger                  │
│              (Issue opened / labeled / commented)          │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Step 1: 环境准备                                         │
│  ├── checkout (fetch-depth: 0)                           │
│  ├── setup-node@v4 (node-version: 20)                    │
│  └── npm install -g @anthropic-ai/claude-code            │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Step 2: 解析任务                                         │
│  ├── 从 Issue label 提取 app 名称                         │
│  ├── 从 Issue title 提取版本号                            │
│  └── 计算下一个版本号 (v0, v1, v2...)                     │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Step 3: Agent Loop (Claude Code CLI)                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Agent 循环（最多 50 轮）                           │  │
│  │                                                    │  │
│  │  每轮:                                             │  │
│  │  1. 读取当前状态（需求、已写文件）                   │  │
│  │  2. 决定下一步操作                                 │  │
│  │  3. 执行: Read / Write / Edit / Bash               │  │
│  │  4. 验证构建: npm run build                        │  │
│  │  5. 通过 → 提交; 失败 → 重试                       │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Step 4: 提交与部署                                       │
│  ├── git commit (apps/{name}/v{n}/)                      │
│  ├── git push                                            │
│  ├── 克隆 gh-pages branch，复制 dist/ 到                 │
│  │   apps/{name}/v{n}/ 目录                              │
│  │   └── mitosis.zenheart.site/apps/{name}/v{n}/         │
│  └── 关闭 Issue + 评论完成                               │
└──────────────────────────────────────────────────────────┘
```

## Agent 指令模板

实际模板见 `worker/prompt.txt`。核心要求:

```markdown
你是一个应用构建 Agent。你的任务是构建一个 Vue 3 + TypeScript + Vite 应用。

## 约束
1. 输出必须是纯静态 HTML/CSS/JS（通过 Vite 构建）
2. TypeScript strict 模式
3. 不使用外部 CDN（全部打包进 dist）
4. Vue 3 组合式 API + TypeScript
5. 代码必须完整可运行

## 执行步骤
1. 读取 Issue #__ISSUE_NUMBER__ 了解需求
2. 在 apps/{APP_NAME}/{VERSION}/ 下创建完整项目:
   - index.html
   - vite.config.ts
   - tsconfig.json
   - package.json
   - src/main.ts
   - src/App.vue
   - src/assets/main.css
3. cd apps/{APP_NAME}/{VERSION}/ 后再执行任何 npm 命令
4. npm install
5. npm run build — 如果失败则修正后重试，直到成功
6. 确认 dist/ 目录已生成
```

## 工具权限

Agent 允许使用的工具:

| 工具 | 用途 | 限制 |
|------|------|------|
| `Read` | 读取文件和目录 | 仅限仓库内 |
| `Write` | 创建新文件 | 仅限 `apps/` 目录 |
| `Edit` | 编辑已有文件 | 仅限 `apps/` 目录 |
| `Bash` | 执行 shell 命令 | `npm install`, `npm run build`, `git add/commit` |

Agent **不允许** 使用的工具:
- 访问网络（除 npm install 外）
- 修改仓库根目录文件
- 执行危险命令（rm -rf /, curl 等）

## 超时与重试

| 参数 | 值 |
|------|-----|
| Actions 超时 | 30 分钟 |
| 最大 Agent 轮数 | 80 |
| 构建失败重试 | 3 次（自动修正代码后重试） |
| 单次 API 调用超时 | 120s |

## 错误处理

```
构建失败 → Agent 分析错误信息 → 修正代码 → 重试
    │
    ├─ 3 次重试成功 → 继续部署
    │
    └─ 3 次失败 → Issue 评论错误信息 → 人工介入
```

---

*Agent Loop 是 Mitosis 的核心引擎，确保其稳定性和正确性是 L0 优先级。*
