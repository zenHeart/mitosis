# Phase X: Goal CRUD Router

## 目的

在 Phase A（代码核查）之后，根据目标模式和用户输入，判断当前操作是**新增、恢复、调整还是替换**，自动选择正确的处理路径。

## 分类维度

### 维度 1: 目标模式（来自 Phase 0）

| 模式 | 含义 | Phase X 行为 |
|------|------|-------------|
| `CREATE` | 无 goal.md，全新目标 | 创建新 goal.md + 初始化 state |
| `RESUME` | goal.md 存在，恢复执行 | 检查是否有变更 → 无变更则跳 Phase B |
| `CLASSIFY` | goal.md 存在，内容有变动 | 分析变更类型（新增/调整/降级/替换） |

### 维度 2: 变更类型（仅 CLASSIFY 模式）

当用户修改了 goal.md 或提供了新需求时：

| 变更类型 | 触发条件 | 处理方式 |
|---------|---------|---------|
| **Add（新增）** | 新增 criteria 条目（C16+）或新增 stage | 增量追加到 goal.md + state |
| **Adjust（调整）** | 修改现有 criteria 的验收条件或 stage 划分 | 更新 goal.md，重置对应 state 为 pending |
| **Descope（降级）** | 移除了 criteria 或 stage | 移入 `docs/goals/backlog.md`，不删除 |
| **Escope（升级）** | 扩大了范围（新增文件/功能） | 同 Add，但需记录范围变化 |
| **Replace（替换）** | 目标完全变更 | 归档旧目标 → 新建 |

### 维度 3: 代码现状（来自 Phase A3）

| 代码状态 | 含义 | Phase X 行为 |
|---------|------|-------------|
| 部分实现 | 部分 criteria 代码已存在 | 同步 state，标记已实现的为 pass |
| 未实现 | 所有 criteria 代码不存在 | 正常执行 |
| 已完成 | 所有 criteria 代码已存在 | 触发归档，而非继续执行 |

## 决策树

```
                        ┌─────────────────┐
                        │  Phase 0 完成     │
                        └────────┬────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  目标模式？               │
                    └────────────┬────────────┘
                         │        │        │
                      CREATE   RESUME   CLASSIFY
                         │        │        │
                         ▼        ▼        ▼
                    ┌────────┐ ┌──────┐ ┌──────────┐
                    │ 新建    │ │检查   │ │分析变更   │
                    │ goal.md │ │有无   │ │类型       │
                    │ + state │ │变更   │ │          │
                    └───┬────┘ └──┬───┘ └────┬─────┘
                        │         │           │
                        │    无变更│     ┌─────┼─────┐
                        │         │     │     │     │
                        │         │   Add  Adjust Descope Replace
                        │         │     │     │     │     │
                        │         │     ▼     ▼     ▼     ▼
                        │         │   追加   调整   移入   归档
                        │         │          state   backlog 新建
                        │         │          reset
                        ▼         ▼
                    ┌────────────────────────────┐
                    │  所有路径汇合 → Phase B 执行  │
                    └────────────────────────────┘
```

## 各路径操作

### CREATE 路径

1. 使用 `templates/goal.md` 创建新 goal.md
2. 初始化 `.goal-state.json`（全 pending）
3. **跳过** Phase A 代码核查（没有代码可核查）
4. 进入 Phase B

### RESUME 无变更路径

1. Phase A3 代码核查 → 同步已实现的 criteria 到 state
2. 没有用户修改 → 直接进入 Phase B 继续执行

### RESUME 有变更 → CLASSIFY

1. Phase A3 代码核查完成
2. Diff 分析：对比 goal.md 当前内容和上次 state 记录
3. 对每个变更分类：
   - **新增 criteria**: 在 goal.md 中已有 → 在 state 中追加（status: pending）
   - **修改 criteria**: 在 goal.md 中已有但描述变了 → 重置对应 state 为 pending
   - **移除 criteria**: 在 goal.md 中不存在了 → state 中标记为 `skipped`，记录原因
   - **新增 stage**: 在 goal.md 中新增 → 在 state 的 stages 数组中追加
4. 在 goal.md 顶部追加变更记录
5. 进入 Phase B

### Add 子操作

```json
{
  "action": "add",
  "target_stage": "stage-id",
  "new_criteria": [
    {"id": "c16", "description": "新需求描述"}
  ]
}
```

执行：
1. goal.md: 在对应 stage 的验收标准区域追加新 criteria
2. state: 在 criteria 对象中追加新条目（status: pending, attempts: 0）
3. 如果新增了 stage，在 stages 数组中追加

### Adjust 子操作

```json
{
  "action": "adjust",
  "affected_criteria": ["c10"],
  "changes": {
    "c10": "GFM 库从 marked 改为 markdown-it"
  }
}
```

执行：
1. goal.md: 更新受影响 criteria 的描述
2. state: 将受影响的 criteria 重置为 pending（验收条件变了，之前的 pass 不再有效）
3. 记录变更原因到 goal.md 的"变更记录"

### Descope 子操作

```json
{
  "action": "descope",
  "removed_criteria": ["c8"],
  "reason": "owner 门控已由 CI 处理，前端无需重复"
}
```

执行：
1. goal.md: 移除 criteria 条目
2. state: 标记为 `skipped`（保留记录，不删除）
3. `docs/goals/backlog.md`: 追加到合适的队列（Now/Next）
4. 记录降级原因

### Replace 子操作

```json
{
  "action": "replace",
  "old_goal_id": "chat-session-management",
  "new_goal_description": "新的目标描述"
}
```

执行：
1. 归档当前目标（调用 Phase 0 归档流程）
2. 可选：将旧 goal.md 移动到 `docs/goal-history/`
3. 创建新 goal.md
4. 初始化新 `.goal-state.json`
5. 进入 Phase B

## 输出格式

```json
{
  "classification": "resume_add",
  "goal_id": "chat-session-management",
  "change_summary": [
    "新增 C16 暗色模式到 Stage 5",
    "C10 GFM 库从 marked 改为 markdown-it"
  ],
  "actions": [
    {"type": "add", "target": "c16", "stage": "security-mask"},
    {"type": "adjust", "target": "c10", "reason": "GFM 库替换"}
  ],
  "preserved": ["c1", "c2", "c3", ...],
  "skipped": [],
  "next_phase": "B"
}
```

## 规则

- 同一轮只处理一种变更类型（Add 或 Adjust 或 Descope），不混合
- Replace 必须经过归档流程，不能直接覆盖
- 所有变更必须记录到 goal.md 的"变更记录"区域
- 调整（Adjust）会导致对应 criteria 的 pass 状态失效，必须重置为 pending
- 降级（Descope）不删除，只移到 backlog，保留可追溯性
