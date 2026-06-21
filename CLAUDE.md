# CLAUDE.md

This is the Claude Code project instruction file for Mitosis.

Mitosis is a self-bootstrapping AI app-building platform. The MVP core is page-driven iteration through `mitosis.zenheart.site`: anonymous users can use published apps; authenticated repository owners use the Mitosis page to iterate Mitosis itself and to create or iterate apps.

## Product Path Memory

Keep the user-facing model consistent everywhere:

1. Anonymous users can open Gallery and use deployed apps.
2. After GitHub OAuth, users are routed by repository ownership:
   - If they have a usable `mitosis` repository, they enter setup and then Workspace.
   - If not, they stay in public browsing and get fork/copy instructions for their own repository.
3. Repository owners use Workspace chat to self-iterate Mitosis and create or iterate apps.
4. After deployment, new visitors repeat step 1, and owners repeat steps 2-3.

Do not describe the product as "login first, then build" without the anonymous-use and repository-copy path.

## Repository Binding Strategy

Repository ownership is configurable, not hardcoded:

- `VITE_GITHUB_REPO_OWNER` and `VITE_GITHUB_REPO_NAME` define the running instance's default GitHub repository.
- `src/config/repo.ts` is the single source for frontend repository constants and helper functions.
- Fork/copy users should point those env values at their own repository.
- Components must not hardcode `zenHeart/mitosis` except as the default fallback in config.
- Logged-in owner workflows should operate on the authenticated user's own `${user}/mitosis` repository after setup.
- Anonymous Gallery should read from the configured public repository.

## Read First

1. `AGENT.md` for the agent entrypoint.
2. `goal.md` for the only active goal, scope, forbidden changes, acceptance criteria, and verification commands.
3. `docs/goals/README.md` for the runtime checklist.
4. `docs/README.md` for technical architecture; `docs/product/` for product requirements and feature designs.

## Directory Structure

```
mitosis/
├── docs/product/                    # 产品需求文档（Product Requirements）
│   ├── overview.md         # 产品目标、MVP 范围
│   ├── deployment.md       # 部署策略
│   └── chat-session-design.md  # 功能设计
├── docs/                   # 技术架构文档（Technical Architecture）
│   ├── architecture.md     # 代码结构、数据流
│   ├── setup.md            # 配置指南（OAuth、Secrets）
│   ├── agent-loop.md       # CI Agent Loop 实现
│   ├── quality.md          # 质量标准
│   ├── security.md         # 安全规则
│   ├── decisions.md        # ADR 决策记录
│   ├── history.md          # 里程碑记录
│   ├── agent/              # Agent 执行文档（README、验收、归档、队列）
│   └── retrospectives/     # 深度复盘（事件根因分析）
├── .claude/                # Claude Code 项目配置
│   ├── settings.json       # 项目级设置
│   ├── rules/              # 项目规则
│   ├── skills/             # 技能定义（setgoal、security-audit 等）
│   └── agents/             # Claude Code 原生自定义 agent
├── src/                    # 平台源码
├── scripts/               # 验证脚本
├── tools/                 # 工具脚本
├── apps/                   # Agent 生成的应用
├── worker/                 # Cloudflare Worker + CI prompt
└── .github/workflows/      # CI/CD 配置
```

**铁律：**
- `docs/product/` = 产品需求、功能设计、业务决策、用户流程、UI/UX 设计
- `docs/` = 技术架构、代码结构、配置方法、质量标准、安全规则
- 不确定放哪 → 问用户，不要自己猜
- 不要往 `docs/` 根目录塞产品需求或功能设计文档

## Lessons Learned System

项目维护两层经验沉淀机制，避免重复踩坑：

| 层级 | 位置 | 用途 | 加载方式 |
|------|------|------|---------|
| 自动记忆 | `~/.claude/projects/<proj>/memory/` + `MEMORY.md` 索引 | 可复用规则、历史教训、配置模式 | 每次会话自动加载进 context |
| 深度复盘 | `docs/retrospectives/` | 具体事件的完整根因分析、时间线、修复过程 | 人工查阅，版本化随代码库 |

**规则：** 每次修复 Bug 后，必须将教训沉淀到自动记忆（`.claude/projects/.../memory/`）。当事件涉及多个提交的连锁反应时，额外撰写深度复盘放入 `docs/retrospectives/YYYY-MM-DD-<topic>.md`。

## Commands

```bash
npm run dev
npm run build
npm run typecheck
```

Generated apps are verified from `apps/{name}/v{n}` with:

```bash
bash ../../../worker/verify-build.sh
```

## Non-Negotiables

- Do only the current `goal.md` scope.
- Never read, copy, or commit `.claude/settings.local.json`, `.env*`, real tokens, keys, or secrets.
- Do not claim completion without fresh command output and a verifier PASS in the transcript.
- Platform SPA uses Vite `base: '/'`; generated apps use Vite `base: './'`.
- CI uses `claude -p --bare`; it does not auto-load local `.claude` rules, hooks, MCP, plugins, skills, auto memory, or `CLAUDE.md`.
- **Security**: 每轮 setgoal 必须执行 security-audit skill（Phase C），发现 FAIL 必须修复。
- **GitHub OAuth**: state 参数防 CSRF，token 不存入 GitHub Issues。
- **GitHub Issues**: 视为公开数据，不存储密码/token/secret。
- **DOMPurify**: 所有用户内容渲染前必须经过 sanitize()。

## Standard Local Goal

```text
/goal 调用 setgoal 技能执行协议：每轮按 Phase A→E 推进，直到条件满足
```

**技能协议：** `.claude/skills/setgoal/SKILL.md`
**技能路径：** `.claude/skills/setgoal/`
**安全审计技能：** `.claude/skills/security-audit/SKILL.md`
**安全规则：** `.claude/rules/security.md`
