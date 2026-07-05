# Mitosis

> 一生二，二生三，三生万物 — AI 构建 AI，无限繁衍

[![部署](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue?logo=github)](https://mitosis.zenheart.site)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Mitosis** 是一个自举应用构建平台。用户通过 `mitosis.zenheart.site` 页面用自然语言描述需求，Agent 通过 GitHub Issues、GitHub Actions、Claude Code 和 StepFun 完成规划、编码、验证和审查部署。MVP 的用户路径分三段：匿名用户真实使用应用；授权登录后，当前运行实例绑定仓库的 owner 进入环境设置，其他用户复制到自己的仓库；owner 通过聊天自举迭代 Mitosis 和应用，并在发布后重复这一循环。

```
第 1 阶段: 匿名用户打开并使用已部署应用
第 2 阶段: 登录鉴权，实例 owner 设置环境，其他用户复制到自己的仓库
第 3 阶段: owner 通过聊天自举迭代 Mitosis 和应用
第 N 阶段: 新用户和 owner 持续重复 1、2、3...
```

> **设计优先级：** 页面自举闭环（Mitosis 迭代 Mitosis、Mitosis 创建和迭代应用）是 L0 不可破坏的核心链路。所有其他功能（UI 增强、模板市场、多 LLM 支持等）均在闭环之上叠加，绝不干扰最小闭环的运行。

---

## 快速导航

| 我想... | 入口 | 说明 |
|--------|------|------|
| 理解产品全貌 | [docs/product/overview.md](docs/product/overview.md) | 产品目标、MVP 范围、自举闭环 |
| 理解架构 | [docs/architecture.md](docs/architecture.md) | 代码结构、数据流、三阶段流程 |
| 本地开发 | [docs/setup.md](docs/setup.md) | OAuth、Worker、StepFun、Mock 模式 |
| 理解 CI Loop | [docs/agent-loop.md](docs/agent-loop.md) | Plan→Execute 两阶段、自举循环、安全门控 |
| 执行目标 | [goal.md](goal.md) | 当前唯一活跃目标和验收标准 |
| Claude 规则 | [CLAUDE.md](CLAUDE.md) | Claude Code 官方项目入口 |
| Agent 协议 | [AGENT.md](AGENT.md) | Agent 总入口和执行规范 |
| 体验审查 | [.claude/skills/setgoal/review-engine/README.md](.claude/skills/setgoal/review-engine/README.md) | UX Review Engine（增量/全量） |
| 安全规则 | [docs/security.md](docs/security.md) | 密钥、敏感信息、XSS 防护 |
| 质量门控 | [docs/quality.md](docs/quality.md) | P1/P2/P3/F 和验收标准 |

---

## 核心原理

Mitosis 不托管用户代码和密钥，而是把 GitHub 原生能力组织成一个可验证的自举循环：

1. 页面运行在 GitHub Pages，匿名用户可直接使用已部署应用。
2. 登录使用 GitHub OAuth Authorization Code Flow；Cloudflare Worker 只负责服务端 token 兑换，详细配置见 [docs/setup.md](docs/setup.md)。
3. 登录用户没有自己的 `mitosis` 仓库时只进入浏览和复制/fork 指引；拥有仓库并完成设置后才进入真实 Agent Loop。
4. Workspace 先澄清需求，再把应用创建/迭代写入 GitHub Issue；平台自身迭代进入人工审核路径。
5. GitHub Actions 使用 `claude -p`（无头模式，加载仓库预装 skills）调用 Claude Code + StepFun：先由规划模型拆解 Issue 任务清单，再执行实现；平台迭代支持多轮自举循环（详见 [docs/agent-loop.md](docs/agent-loop.md)）。
6. `worker/verify-build.sh` 通过后才创建 draft PR；人工审查合入 `master` 后由 Pages 发布。

```text
匿名使用 → 登录鉴权 → owner 设置 / 其他用户复制仓库
→ 聊天澄清 → GitHub Issue → owner gate
→ Claude Code Agent Loop → verifier
→ draft PR → human review → merge master
→ GitHub Pages → 匿名使用并继续下一轮迭代
```

## 当前仓库结构

```
mitosis/
├── README.md                  # 项目目标、核心架构和文档入口
├── CLAUDE.md                  # Claude Code 官方项目入口
├── AGENT.md                   # Agent 总入口
├── goal.md                    # 当前唯一活跃目标
├── .claude/
│   ├── settings.json          # Claude Code 项目级共享设置
│   ├── rules/                 # 项目规则（setgoal、security、mermaid 等）
│   ├── skills/
│   │   └── setgoal/           # /goal 执行协议 + verifier 脚本 + Review Engine
│   │       ├── SKILL.md       # 七阶段循环协议
│   │       ├── verifiers/     # 验证脚本（6 个）
│   │       └── review-engine/ # UX Review Engine
│   └── agents/                # 审计专员 Agent 定义（4 个）
├── .github/workflows/         # GitHub Actions（mitosis.yml + deploy.yml）
├── docs/                      # 长期核心文档
│   ├── README.md              # 文档地图
│   ├── product/               # 产品需求文档
│   │   ├── overview.md
│   │   ├── deployment.md
│   │   └── chat-session-design.md
│   ├── goals/                 # Agent 执行、验收、目标队列
│   │   ├── README.md
│   │   ├── acceptance.md
│   │   ├── archive/
│   │   └── goal-history/
│   └── retrospectives/        # 深度复盘
├── worker/                    # OAuth Worker + CI prompt + verifier
├── apps/                      # Agent 生成的应用（版本化）
│   └── {app-name}/
│       └── v{n}/              # Vue + TypeScript + Vite 应用版本
├── src/                       # Mitosis 平台源码（Vue + TS + Vite）
│   ├── main.ts
│   ├── App.vue
│   ├── components/            # Login, Setup, Workspace, Gallery
│   ├── composables/           # auth, GitHub API, polling, StepFun
│   ├── stores/                # Pinia auth state
│   └── types/                 # Auth/App 类型
├── index.html                 # Vite 入口
├── vite.config.ts             # Vite 配置
├── tsconfig.json              # TypeScript strict 配置
├── package.json
├── .gitignore
└── LICENSE
```

> **技术栈锁定：** 平台和生成应用统一使用 Vue 3 + TypeScript strict + Vite。平台主站使用 Vite `base: '/'`；生成应用使用 Vite `base: './'`，用于 `/apps/{name}/v{n}/` 版本目录。

## 本地开发

```bash
git clone https://github.com/zenheart/mitosis.git
cd mitosis
npm install
npm run dev     # 本地预览
npm run build   # 生产构建
```

### Mock 模式（无需 GitHub 仓库）

1. 复制 `.env.example` 为 `.env.local`：
   ```bash
   cp .env.example .env.local
   ```
2. 在 `.env.local` 中设置 `VITE_USE_MOCK_GITHUB=true`
3. 直接运行：
   ```bash
   npm run dev
   ```

> `.env.local` 已加入 `.gitignore`，不会被提交。

设置 `VITE_USE_MOCK_GITHUB=true` 可在无 GitHub API 访问的情况下本地运行完整流程：

- GitHub Issues API 调用路由到浏览器 `localStorage`，无需真实仓库
- 发送消息通过 `mockCreateIssueComment` 自动持久化
- 使用 `/create 描述` 命令可直接触发构建流程，跳过 AI 步骤
- 数据存储在 `mitosis_mock_sessions` 和 `mitosis_mock_sessions_messages`，可通过 `clearMockData()` 重置

> 注意：Mock 模式下 StepFun AI 对话仍需要有效的 `VITE_STEP_TOKEN`。如需完全离线测试，使用 `/create` 命令跳过 AI 步骤。

---

## 路线图

| 阶段 | 状态 | 内容 |
|------|------|------|
| **1 — MVP** | 进行中 | 纯 Web 应用最小闭环：OAuth、配置引导、IssueOps、GitHub Actions Agent Loop、verifier、draft PR、Pages 部署、自举入口 |
| **2 — 自迭代扩展** | ⬜ | 通过在初始化环节添加服务端/运行时/部署目标等配置，Mitosis 自主构建扩展自身能力的版本（服务端 API、移动端、桌面端等） |
| **3 — 生态** | ⬜ | 多 LLM、自定义 Agent、团队协作、插件系统、模板市场 |

---

## 验证命令

### 功能验收

```bash
# 类型 + API
bash .claude/skills/setgoal/verifiers/types-and-api.sh

# 会话存储 + Mock
bash .claude/skills/setgoal/verifiers/session-restore.sh

# /create 触发 + CI 安全门控
bash .claude/skills/setgoal/verifiers/create-trigger.sh

# 渲染拦截（DOMPurify XSS）
bash .claude/skills/setgoal/verifiers/gfm-render.sh

# 隐私脱敏
bash .claude/skills/setgoal/verifiers/security-mask.sh

# 黄金路径（三场景 + 生命周期命令）
bash .claude/skills/setgoal/verifiers/golden-paths.sh

# 构建
npm run build
npm run typecheck

# 安全扫描
rg "(ghp_|gho_|github_pat_|sk-|AKIA|AIza|eyJ)" \
  --type-add 'code:*.{ts,js,vue,json,yml,yaml,sh,env}' \
  -g '!*.md' \
  src/ apps/ worker/ .github/ || echo "SECURITY_SCAN: PASS"
```

### UX 审查

```bash
# 增量模式（默认）
bash .claude/skills/setgoal/review-engine/verifiers/ux-review.sh incremental

# 全量模式
bash .claude/skills/setgoal/review-engine/verifiers/ux-review.sh full

# 指定文件增量
bash .claude/skills/setgoal/review-engine/verifiers/ux-review.sh incremental -- ChatInput.vue
```

---

## 贡献

1. Fork → 创建 `mitosis` → 提出修改 → 提交 PR

## License

MIT
