# `.goal-state.json` 格式定义

## 完整格式

```json
{
  "current_goal": "chat-session-management",
  "goal_description": "Issue-backed chat sessions with GFM rendering, /create trigger, mock mode, security masking",
  "started_at": "2026-06-21T00:00:00Z",
  "last_goal_sync": "2026-06-21T01:00:00Z",
  "turns_used": 0,
  "max_turns": 1000,
  "current_stage": "types-api",
  "stages": ["types-api", "session-storage", "create-trigger", "gfm-render", "security-mask"],
  "criteria": {
    "c1-types": {
      "description": "IssueComment + ChatSession 类型定义",
      "status": "pass",
      "stage": "types-api",
      "attempts": 1,
      "last_result": "src/types/app.ts:42 已定义",
      "verified_by": "code-audit",
      "implemented_at": "2026-06-20T...",
      "adr_refs": ["ADR-012"]
    }
  },
  "last_verdict": "PASS",
  "last_verifier_output": "{...}",
  "feedback_history": [],
  "consecutive_failures": 0,
  "goal_history": [
    {
      "date": "2026-06-21T...",
      "action": "sync",
      "description": "代码核查发现 c1-types, c2-api 已实现，更新为 pass"
    }
  ],
  "blocked_criteria": [],
  "classification": "resume"
}
```

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `current_goal` | string | 当前目标 ID |
| `goal_description` | string | 目标简短描述 |
| `started_at` | ISO 8601 | 开始时间 |
| `last_goal_sync` | ISO 8601 \| null | 上次与代码同步的时间（Phase A3） |
| `turns_used` | int | 已用 turns |
| `max_turns` | int | 最大 turns 上限 |
| `current_stage` | string | 当前 stage |
| `stages` | array | 所有 stage 顺序 |
| `criteria` | object | 验收项状态 |
| `last_verdict` | string | 上次验证结果 |
| `consecutive_failures` | int | 连续失败次数（>3 需重新评估） |
| `blocked_criteria` | array | 被阻塞的 criteria |
| `goal_history` | array | 变更记录（同步、归档、调整等） |
| `classification` | string | 目标分类：new \| resume \| create \| update \| replace |

## Criteria 状态

- `pending` — 未开始
- `in_progress` — 执行中
- `pass` — 通过
- `fail` — 失败
- `skipped` — 跳过（不适用/已降级）

## Criteria 扩展字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `verified_by` | string | 验证来源：`code-audit` \| `types-and-api.sh` \| `session-restore.sh` 等 |
| `implemented_at` | string \| null | 代码实现时间（git log 提取） |
| `adr_refs` | array | 关联的 ADR 编号，如 `["ADR-012", "ADR-013"]` |

## Goal History 条目格式

```json
{
  "date": "2026-06-21T12:00:00Z",
  "action": "sync|archive|add|adjust|descope|replace",
  "description": "人类可读的变更描述"
}
```

| action | 含义 | 触发阶段 |
|--------|------|---------|
| `sync` | 代码核查同步 | Phase A5 |
| `archive` | 目标归档 | Phase 0 / Phase D |
| `add` | 新增 criteria | Phase X |
| `adjust` | 调整 criteria | Phase X |
| `descope` | 降级 criteria | Phase X |
| `replace` | 替换目标 | Phase X |
