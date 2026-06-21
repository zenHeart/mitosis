# Phase 0: Pre-flight Archiving

## 目的

每次 `/goal` 被调用时，**最先执行**此阶段。确保新目标不会覆盖未归档的已完成目标，并判断当前是新建、恢复还是调整。

## 步骤

### 0.1 读取当前状态

```
1. 检查 goal.md 是否存在
2. 检查 .goal-state.json 是否存在
3. 如果存在，读取 last_verdict 和 current_goal
```

### 0.2 判断是否需要归档

```
┌──────────────────────────────────────────┐
│ goal.md 存在？                             │
│  否 → 跳到 0.4（新建目标）                  │
└────────────────┬─────────────────────────┘
                 │ 是
    ┌────────────▼─────────────────────────┐
    │ .goal-state.json 存在且有 verdict？    │
    │  否 → 跳到 0.4（恢复不完整目标）        │
    └────────────┬─────────────────────────┘
                 │ 是
    ┌────────────▼─────────────────────────┐
    │ last_verdict === "PASS"？              │
    │  是 → 执行归档（0.3）                   │
    │  否 → 继续当前目标（跳到 Phase A）      │
    └────────────────────────────────────────┘
```

### 0.3 归档操作

当 `last_verdict === "PASS"` 时：

1. **生成目标快照** — 调用 `scripts/archive.sh snapshot`，将当前 goal.md 快照保存到 `docs/goal-history/<date>-<goal-id>.md`
2. **更新归档摘要** — 调用 `scripts/archive.sh summary`，将结构化摘要追加到 `docs/goals/archive.md`
3. **更新目标队列** — 将当前目标从 `docs/goals/backlog.md` 的 Now/Next 移到 Done
4. **重置状态** — 创建新的 `.goal-state.json`（全 pending，清除 goal_history）
5. **报告归档结果**

```
Phase 0 归档完成：
  - 快照: docs/goal-history/2026-06-21-chat-session-management.md
  - 归档: docs/goals/archive.md → GOAL-001
  - 队列: docs/goals/backlog.md → Done 追加
```

### 0.4 判断目标模式

归档完成后（或跳过归档后），判断当前目标模式：

| 条件 | 模式 | 进入 |
|------|------|------|
| goal.md 不存在 | `CREATE` | 新建目标 |
| goal.md 存在 + state 无 progress | `RESUME` | 恢复目标 |
| goal.md 存在 + state 有 progress + 用户修改了内容 | `CLASSIFY` | 进入 Phase X 判断变更类型 |
| goal.md 存在 + state 有 progress + 无修改 | `RESUME` | 直接进入 Phase B |

### 0.5 输出评估报告

```
Phase 0 评估结果：
- 目标模式: <CREATE | RESUME | CLASSIFY>
- 当前目标: <goal.md 标题>
- 上次 verdict: <PASS | FAIL | PARTIAL | null>
- 归档: <已完成 | 跳过（原因）>
- 下一步: <进入 Phase A | 进入 Phase X | 新建目标>
```

### 规则

- 归档是强制性的：`last_verdict === "PASS"` 必须归档，不能跳过
- 归档操作失败不阻断流程：如果 archive.sh 执行失败，记录警告后继续
- 归档快照不可删除：`docs/goal-history/` 中的文件是只读历史记录
- 同一时间只有一个活跃目标：归档后旧 goal.md 的快照被保留，但 `.goal-state.json` 被重置
