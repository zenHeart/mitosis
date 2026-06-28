# AGENT.md

你在 Mitosis 仓库中工作。Mitosis 的核心目标是通过 `mitosis.zenheart.site` 页面自举迭代 Mitosis 本身，并创建和迭代应用。

## 开工顺序

1. 读 [goal.md](goal.md)：当前唯一活跃目标、范围、验收标准。
2. 读 [CLAUDE.md](CLAUDE.md) 和 [.claude/skills/setgoal/SKILL.md](.claude/skills/setgoal/SKILL.md)：本地 Claude Code 项目规则。
3. 读 [docs/goals/README.md](docs/goals/README.md)：Agent 工作流入口。
4. 按 [docs/quality.md](docs/quality.md) 和 [docs/goals/acceptance.md](docs/goals/acceptance.md) 验收。

## 不可违反

- 只做 `goal.md` 范围内的工作，不顺手重构。
- 不读取、复制、提交 `.claude/settings.local.json` 或任何真实 token/key。
- 不给虚假通过。没有 fresh verifier 结果，就不能说完成。
- 平台主站 Vite `base: '/'`；Agent 生成应用 Vite `base: './'`。
- CI 路径使用 `--bare`，不能依赖本地 hooks、MCP、subagent、`.claude/rules/*` 或 `CLAUDE.md` 自动加载。
- 安全审计前置：每轮 Phase C 必须先调用 `security-audit` skill，通过后才能继续。

## 双轨验证体系

Mitosis 采用**双轨验证**确保质量和体验：

| 验证层 | 目的 | 触发时机 | 执行方式 |
|--------|------|---------|---------|
| **功能验收** | 验证功能正确性 | 每轮 Phase C | mvp-verifier / verifier 脚本 |
| **UX 审查** | 打磨交互体验 | 功能验收通过后 | Review Engine（增量/全量） |

### 功能验收（Verifier）

功能验收通过二元门禁（PASS/FAIL）：

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
```

### UX Review Engine

功能验收通过后，使用 Review Engine 持续打磨体验：

**本地触发：**
```
/ux-polish           # 增量模式（默认）
/ux-polish full      # 全量模式
/ux-polish --files ChatInput.vue  # 指定文件增量
```

**CI 触发：** PR 评论 `/ux-check` 或 `/ux-check full`

**审计架构：**
- 本地：Lead Auditor 协调 3 个审计专员并行工作（subagent）
- 远程：纯 JS 脚本直接调用 Playwright（CI 兼容 `claude -p --bare`）
- 评分标准：`rubric.json` 唯一真实来源

**详细文档：** [.claude/skills/setgoal/review-engine/README.md](.claude/skills/setgoal/review-engine/README.md)

## 标准命令

```text
/goal Read goal.md and follow CLAUDE.md plus .claude/skills/setgoal/SKILL.md, complete all acceptance criteria, include verifier PASS and command outputs in the transcript, stop after 20 turns if blocked.
```

## 文档入口

- 项目总览：[README.md](README.md)
- 产品需求：[docs/product/overview.md](docs/product/overview.md)
- 架构细节：[docs/architecture.md](docs/architecture.md)
- Agent 执行：[docs/goals/README.md](docs/goals/README.md)
- CI Loop：[docs/agent-loop.md](docs/agent-loop.md)
- 安全规则：[docs/security.md](docs/security.md)
- 质量门控：[docs/quality.md](docs/quality.md)
- 当前目标：[goal.md](goal.md)
- UX 审查：[.claude/skills/setgoal/review-engine/README.md](.claude/skills/setgoal/review-engine/README.md)

## 核心原则

1. **一次一个 criteria** — 禁止同时修改多个验收项
2. **安全审计前置** — 每轮 Phase C 必须先调用 security-audit skill，通过后才能继续
3. **客观验证优先** — verifier 输出优先于主观判断
4. **最小化修改** — 只改实现当前 criteria 需要的代码
5. **持续归档** — 完成即归档，不堆积
6. **目标可演进** — 根据实际情况灵活调整
7. **状态即文档** — `.goal-state.json` 和 `goal.md` 是唯一可信源
8. **代码现实优先** — Phase A 先核查代码，不信任 state  alone
9. **UX 持续打磨** — 功能验收通过后，使用 Review Engine 持续迭代体验
