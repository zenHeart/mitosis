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
- 建立 `CLAUDE.md` 与 `.claude/skills/setgoal/SKILL.md` 作为本地 Claude Code 官方规则入口。
- 明确本地 `/goal` 与 CI `--bare` 是两条路径。
- 明确 CI 必须显式运行 `worker/verify-build.sh`。

## 2026-06-21 chat-session-management-mvp

- **状态**: ✅ 完成（18/18 PASS）
- **Turn**: 6
- **成果**: Issue-backed 会话管理系统 MVP，含 CI 安全门控、DOMPurify 渲染、隐私脱敏
- **新增文件**: types/app.ts, stores/session.ts, composables/useGitHubAPI/Mock/Sanitize/Security.ts
- **下一阶段**: 本地集成调试（Mock 模式 wiring）

## 2026-06-21 local-integration-wiring

- **状态**: ✅ 完成（5/5 PASS）
- **成果**: Mock 路由层、session store wiring、/create 命令集成、env 文档
- **新增**: .env.example, .env.local

## 2026-06-21 session-lifecycle-ui

- **状态**: ✅ 完成
- **成果**: 侧边栏会话列表 + loadSession + 自动分组（appLabel）
- **设计**: 极简设计，最小认知负荷，~40行改动

### session-lifecycle-ui
- **状态**: ✅ PASS（5/5）
- **改动**: Workspace.vue 侧边栏加会话列表 + loadSession 函数 + 样式
- **行数**: ~50 行（模板 15 + 脚本 6 + 样式 30）
- **设计**: 极简，无新标签/类型/API，利用已有 appLabel 自动分组
