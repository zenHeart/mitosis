# Phase D: 归档

## 归档时机

- 当前 stage 的所有 criteria 全部 PASS
- 目标完全完成（所有 stage PASS）
- Phase 0 检测到 `last_verdict === "PASS"`

## 归档操作

### 1. 调用归档脚本

```bash
bash .claude/skills/setgoal/scripts/archive.sh snapshot <goal-id>
bash .claude/skills/setgoal/scripts/archive.sh summary <goal-id>
bash .claude/skills/setgoal/scripts/archive.sh reset-state <goal-id>
```

### 2. 更新技术文档

| 文档类型 | 存放位置 | 更新内容 |
|---------|---------|---------|
| ADR（架构决策） | `docs/decisions.md` | 添加 ADR 条目（如适用） |
| 技术设计 | `docs/architecture.md` | 更新架构章节（如适用） |
| 复盘经验 | `docs/retrospectives/YYYY-MM-DD-<topic>.md` | 事件根因分析（如有故障） |
| 产品需求 | `docs/product/` | 功能完成状态 |

### 3. 更新目标队列

- 将当前目标从 `docs/goals/backlog.md` 的 Now/Next 移到 Done
- 在 Done 中追加完成日期和关键交付摘要

### 4. 生成目标快照

归档脚本自动将 goal.md 快照保存到 `docs/goal-history/<date>-<goal-id>.md`，包含：
- YAML frontmatter（goal_id, verdict, criteria 统计, turns）
- 完整的 goal.md 内容副本

## 归档输出格式

```
Phase D 归档完成：
- 快照: docs/goal-history/2026-06-21-chat-session-management.md
- 归档: docs/goals/archive.md → GOAL-001
- 队列: docs/goals/backlog.md → Done 追加
- 状态: .goal-state.json 已重置
```

## 注意

- 归档是强制性的：目标完成后必须归档，不能跳过
- 归档脚本失败不阻断流程：记录警告后继续
- 归档快照不可删除：`docs/goal-history/` 是只读历史记录
- 状态变更记录在 `.goal-state.json` 的 `goal_history` 数组中
