# Goals Archive — 目标归档

本目录由 setgoal Phase 0 自动维护。每次目标归档时，当前 `goal.md` 的完整快照保存于此。

## 文件命名

```
YYYY-MM-DD-<goal-id>.md
```

例如：`2026-06-21-chat-session-management.md`

## 文件格式

每个快照文件以 YAML frontmatter 开头，包含元数据：

```yaml
---
goal_id: chat-session-management
archived_at: 2026-06-21T12:00:00Z
final_verdict: PASS
criteria_total: 15
criteria_pass: 15
criteria_fail: 0
turns_used: 42
---
```

frontmatter 之后是归档时刻的完整 `goal.md` 内容。

## 用途

- 追溯目标演进历史
- 对比不同版本的目标定义变化
- 回滚到之前的目标版本（如需）

## 规则

- 本目录文件为只读历史记录，禁止手动编辑或删除
- 归档快照由 `scripts/archive.sh snapshot` 生成

---

## 归档摘要

本文件记录已完成 goal 的摘要条目（结构化），不保存长日志。

### 2026-06-20 — 文档与 Goal Loop 收口

- 建立 `README.md`、`docs/`、`docs/goals/` 三层文档结构。
- 建立根目录 `goal.md` 作为唯一活跃目标。
- 建立 `CLAUDE.md` 与 `.claude/rules/setgoal.md` 作为本地 Claude Code 官方规则入口。
- 明确本地 `/goal` 与 CI `--bare` 是两条路径。
- 明确 CI 必须显式运行 `worker/verify-build.sh`。
