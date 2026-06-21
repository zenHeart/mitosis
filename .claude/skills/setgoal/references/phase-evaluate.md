# Phase A: 评估 + 代码现实核查

## 目的

Phase 0 归档完成后，Phase A 负责评估当前目标的真实状态。关键改进：**不信任 goal.md 和 state  alone — 先核查代码现实。**

## 步骤

### A1: 读取目标定义

1. **读取 `goal.md`** — 确认当前目标、stage、criteria
2. **读取 `.claude/.goal-state.json`** — 检查已有进度和上次 verdict

### A2: 读取项目规则

3. **读取 `.claude/rules/change-impact-analysis.md`** — 确认变更影响分析规则
4. **读取 `docs/goals/acceptance.md`** — 确认验收标准
5. **读取 `docs/quality.md`** — 确认质量标准

### A3: 代码现实核查 ★ 核心改进

对 goal.md 中的每个 criteria，扫描 `src/` 确认实际实现状态。

#### 核查策略

按优先级检查：

**优先级 1: 代码中存在性检查**
- 类型定义 → `rg "interface <TypeName>"` 或 `rg "type <TypeName>"`
- API 函数 → `rg "export.*function <funcName>"` 或 `rg "export.*const <funcName>"`
- 文件存在 → `test -f <path>`
- composable → `rg "export.*use<Name>"`

**优先级 2: 依赖检查**
- npm 包是否在 package.json 中 → `rg '"<package>"' package.json`
- 导入语句是否存在 → `rg "from ['\"]<module>['\"]"`

**优先级 3: 集成检查**
- 关键符号是否被其他代码引用 → `rg "<symbol>" src/`
- 是否有至少一个消费者使用它

#### 核查输出

对每个 criteria：

```
<c-id>: <状态> | <证据>
  pass  | src/types/app.ts:42 定义 interface ChatSession
  pass  | src/api/github.ts:15 定义 listUserIssues
  fail  | src/stores/session.ts 不存在
  pending | 代码中无 fetchWithTimeout 定义
```

#### 判定规则

| 代码证据 | state 状态 | 最终状态 |
|---------|-----------|---------|
| 代码存在 + state=pending | → **pass**（已实现但未标记） |
| 代码存在 + state=fail | → **pass**（已修复但未更新） |
| 代码不存在 + state=pass | → **fail**（标记错误，需回退或重新实现） |
| 代码不存在 + state=pending | → **pending**（确实未实现） |
| 代码部分存在（只有接口无实现） | → **fail**（不完整） |

### A4: 文档一致性核查

检查 ADR（架构决策）状态与代码实现状态是否一致。

1. 读取 `docs/decisions.md`，找到与当前目标相关的 ADR
2. 检查每个 ADR 的状态：
   - `接受` → 代码中应该有对应实现
   - `已过时` → 代码中可能已被替代实现
   - `被取代` → 代码中应该使用了新方案
3. 将 ADR 状态与 A3 的代码核查结果比对

#### 不一致处理

- ADR=接受 但 代码=无 → 标记为高优先级 pending
- ADR=已过时 但 代码=有旧实现 → 标记为需要清理
- ADR=被取代 但 代码=仍有旧实现 → 标记为需要迁移

### A5: 状态同步

1. 基于 A3/A4 结果，更新 `.goal-state.json` 中每个 criteria 的 status
2. 记录同步原因
3. 生成同步报告

```
状态同步报告：
  c1-types: pending → pass (src/types/app.ts:42 已定义)
  c2-api: pending → pass (src/api/github.ts 已实现)
  c3-timeout: pending → pending (代码中无 fetchWithTimeout)
  ...
  共更新 2 个 criteria 状态
```

#### 同步规则

- 绝不删除已有的 `last_result` 和 `attempts` 记录
- 状态变更追加到 `feedback_history`
- `verified_by` 字段标记为 `"code-audit"`（由代码核查自动标记）

## 评估输出格式

```
Phase A 评估结果：
- 当前目标: <goal.md 标题>
- 当前阶段: <stage name> (第 X/Y 阶段)
- 代码核查: 发现 N 个已实现的 criteria（状态已同步）
- 文档核查: M 个 ADR 与代码一致，K 个不一致
- 下一个 criteria: <criteria ID + 描述>
- 该 criteria 已尝试: <N> 次
- 上一次失败原因: <简要描述>
- 下一步: <进入 Phase X | 进入 Phase B>
```

## 注意

- **一次只处理一个 criteria 的执行**（Phase B），但 Phase A 必须核查所有 criteria 的状态
- 如果所有 criteria 都 PASS → 进入 Phase D 归档
- 如果 state 文件不存在 → 从 goal.md 的第一个 stage 开始
- 如果连续失败 >3 次 → 在输出中标注，Phase X 会据此推荐降级
