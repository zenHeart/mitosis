---
name: setgoal
description: |
  目标驱动执行协议。每轮内部按七阶段执行：设定前归档 → 评估+代码核查 → CRUD路由 → 执行 → 验证 → 归档 → 演进。
  由原生 /goal 循环驱动，本技能定义单轮内的执行规范。
  包含 verifier 脚本、状态追踪、归档脚本、目标 CRUD 操作。
  当用户说"新目标"、"继续"、"调整目标"、"归档"时自动触发。
---

# Goal Loop — 执行协议

## 七阶段循环

每轮执行以下阶段：

```
Phase 0: 设定前归档          ← ★ 检查上次目标是否完成，完成则归档
Phase A: 评估 + 代码核查      ← ★ 读 goal.md + state + 扫描 src/ 确认实际实现
Phase X: CRUD 路由           ← ★ 判断是新建/恢复/增量调整/替换
Phase B: 执行                ← 最小化修改 → 构建 → 类型检查
Phase C: 验证                ← security-audit → verifier → 更新 state
Phase D: 归档                ← 完成的 stage → docs/goals/archive.md + goal-history/
Phase E: 演进                ← 评估是否需要调整目标
  │
  ├→ verdict=PASS → 归档 → 停止，输出验收报告
  └→ verdict=FAIL/PARTIAL → 回到 Phase B
```

**详细协议见 `references/`：**
- `references/phase-preflight.md` — Phase 0: 设定前归档
- `references/phase-evaluate.md` — Phase A: 评估 + 代码现实核查（A1-A5）
- `references/phase-classify.md` — Phase X: CRUD 路由（CREATE/RESUME/ADD/ADJUST/DESCOPE/REPLACE）
- `references/phase-execute.md` — Phase B: 执行规范
- `references/phase-verify.md` — Phase C: 验证方法
- `references/phase-archive.md` — Phase D: 归档（结构化归档 + archive.sh）
- `references/phase-evolve.md` — Phase E: 目标演进（完成度评估 + 模式推荐）
- `references/state-format.md` — `.goal-state.json` 格式（含新增字段）
- `references/common-patterns.md` — 六种常见模式（含部分恢复 + 增量演进）

**归档脚本：** `scripts/archive.sh`（snapshot / summary / reset-state）
**归档模板：** `templates/archive-entry.md`

## 核心原则

1. **一次一个 criteria** — 禁止同时修改多个验收项
2. **安全审计前置** — 每轮 Phase C 必须先执行 security-audit skill，通过后才能继续
3. **客观验证优先** — verifier 输出优先于主观判断
4. **最小化修改** — 只改实现当前 criteria 需要的代码
5. **持续归档** — 完成即归档，不堆积
6. **目标可演进** — 根据实际情况灵活调整
7. **状态即文档** — `.goal-state.json` 和 `goal.md` 是唯一可信源
8. **代码现实优先** — Phase A 先核查代码，不信任 state  alone

## Verdict 判定规则

| 条件 | Verdict |
|------|---------|
| 所有 criteria PASS/SKIPPED，无 FAIL | PASS |
| 1-2 个非阻断性 FAIL | PARTIAL |
| 阻断性 FAIL（平台构建失败、安全扫描发现 token） | FAIL |
| Phase 1 全部 SKIPPED 但 Phase 2/3 通过 | PARTIAL |

**阻断性 FAIL：** 平台 `npm run build` 失败、安全扫描发现真实 token/key/secret、关键文件缺失

**Verifier 三大阶段：**
- Phase 1: Playwright MCP 浏览器测试（匿名 Gallery → 登录 → Workspace 分流）
- Phase 2: Bash 构建验证（npm run build + verify-build.sh + 安全扫描）
- Phase 3: GitHub API 状态检查（Issue label + PR 状态）

**输出：** 严格 JSON，包含 `verdict` + `criteria_results` + `failed_items` + `next_actions`

## 与 CI Loop 的关系

| 维度 | 本地 /goal | CI --bare |
|------|-----------|------|
| 机制 | Executor + Verifier subagent + Stop hook | Shell for-loop + verify-build.sh |
| 验证 | Playwright + Bash + GitHub MCP | verify-build.sh (构建+功能) |
| 重试 | 1000 turn 上限，verifier 驱动 | 3 次 attempt，shell 驱动 |
| 适用 | 平台流程验证（端到端） | 生成应用质量（构建产物） |
| 人工介入 | Stop hook block + 反馈 | draft PR + human review |

## 安全审计

每轮 Phase C 必须调用 `security-audit` skill：

```bash
Skill(skill: "security-audit")
```

执行 5 步快速扫描：
1. **敏感数据泄露** — rg 扫描 token/secret/非 VITE_ env var
2. **DOMPurify 配置** — 验证 ALLOWED_TAGS/ALLOWED_ATTR/on* 排除
3. **CI Owner 门控** — 检查 workflow 中的 owner 验证
4. **脱敏逻辑** — 检查 password/token/secret → *** 替换
5. **fetchWithTimeout** — 检查所有 fetch 调用是否带 timeout

**判定规则：**
- FAIL → 立即停止，回退修改，修复后再继续
- WARN → 继续执行，但需要人工确认
- PASS → 继续 verifier 验证

## Verifier 脚本

见 `verifiers/` 目录：
- `types-and-api.sh` — 类型 + API 扩展验证
- `session-restore.sh` — 会话恢复 + Mock 模式验证
- `create-trigger.sh` — /create 触发 + CI 安全门控
- `gfm-render.sh` — GFM 渲染 + DOMPurify XSS 防护
- `security-mask.sh` — 隐私脱敏验证

**安全审计技能：** `security-audit` — 每轮 Phase C 必须调用，5 步快速扫描
**添加新 verifier：** 在 `verifiers/` 下创建 `.sh` 脚本，遵循 `verifiers/README.md` 规范。

## 归档脚本

见 `scripts/archive.sh`：
- `snapshot <goal-id>` — 生成目标快照到 `docs/goal-history/`
- `summary <goal-id>` — 生成归档摘要追加到 `docs/goals/archive.md`
- `reset-state <goal-id>` — 重置 `.goal-state.json`

## 与原生 /goal 的关系

| 组件 | 职责 |
|------|------|
| 原生 `/goal <条件>` | 循环控制：每轮自动执行，评估条件是否满足 |
| `setgoal` 技能 | 执行协议：定义每轮内部的 Phase 0→A→X→B→C→D→E 流程 |
| `security-audit` 技能 | 安全扫描：每轮 Phase C 调用，5 步快速扫描 |
| `.goal-state.json` | 跨轮状态持久化 |
| `docs/goals/archive.md` | 已完成目标归档摘要 |
| `docs/goal-history/` | 目标快照版本库 |

## 禁止事项

0. 禁止在未读 goal.md 的情况下声称在推进目标
0.5 禁止跳过 security-audit skill 直接进入 verifier
1. 禁止同时修改多个 criteria
2. 禁止在 verifier 未运行的情况下声称完成
3. 禁止删除 `.goal-state.json` 中的失败记录
4. 禁止跳过归档直接进入下一目标
5. 禁止在 scope 之外添加功能（除非 Phase X 明确分类为 Add/Replace）
6. 禁止在 Phase A 跳过代码核查，只依赖 goal.md 和 state
