# Agent Loop 技术规格

## 概述

Agent Loop 是 Mitosis 的核心引擎，负责在 GitHub Actions 中执行应用构建任务。

## 运行环境

- **运行时:** GitHub Actions (ubuntu-latest)
- **Agent:** Claude Code CLI (`@anthropic-ai/claude-code`)
- **LLM 后端:** StepFun API (`https://api.stepfun.com/step_plan`)
- **模型:** `step-3.7-flash`
- **工作目录:** 用户仓库根目录

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
│  ├── GitHub Pages 自动部署到 zenHeart/mitosis            │
│  │   └── mitosis.zenheart.siteapps/{name}/v{n}/    │
│  └── 关闭 Issue + 评论完成                               │
└──────────────────────────────────────────────────────────┘
```

## Agent 指令模板

```markdown
你是一个 Mitosis 应用构建 Agent。

## 任务
在 apps/{APP_NAME}/{VERSION}/ 下创建一个完整的 Vue 3 + TypeScript + Vite 应用。

## 需求
{ISSUE_BODY}

## 技术约束
1. Vue 3 组合式 API + TypeScript strict 模式
2. 不使用 `any` 类型
3. 所有组件必须定义完整 Props/Emits 接口
4. CSS 使用 scoped style
5. 构建产物必须是纯静态文件（零外部依赖）

## 目录结构要求
apps/{APP_NAME}/{VERSION}/
├── index.html          # Vite 入口
├── vite.config.ts      # Vite 配置 (base: /mitosis/apps/{APP_NAME}/{VERSION}/)
├── tsconfig.json       # TypeScript strict
├── package.json        # 依赖声明
└── src/
    ├── main.ts         # 入口
    ├── App.vue         # 根组件
    └── assets/
        └── main.css    # 全局样式

## 执行步骤
1. 创建以上目录结构
2. 编写完整的 index.html, vite.config.ts, tsconfig.json, package.json
3. 编写 src/main.ts 和 src/App.vue（完整功能实现）
4. 运行 npm install
5. 运行 npm run build
6. 验证构建产物在 dist/ 目录
7. 确认所有文件正确后，停止并报告完成
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
| 最大 Agent 轮数 | 50 |
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
