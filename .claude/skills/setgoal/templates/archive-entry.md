# 归档条目模板

> 本文件由 setgoal Phase 0 自动生成并维护。禁止手动编辑。

## 归档条目格式

```markdown
### GOAL-{NNN}: {目标标题}
- **Goal ID**: {goal_id}
- **归档时间**: {ISO 8601 时间}
- **快照**: [docs/goal-history/{date}-{goal_id}.md](../goal-history/{date}-{goal_id}.md)
- **完成度**: {pass_count}/{total_count} criteria {verdict}
- **Turns**: {turns_used}
- **关键交付**:
  - {criteria 范围摘要，如 "C1-C15 全部完成"}
- **ADR 关联**: {ADR-XXX, ADR-YYY}
- **后续**: 下一代目标见 docs/goals/backlog.md → {Now/Next}
```

## 示例

```markdown
### GOAL-001: 会话管理系统（Issue-backed Chat Sessions）
- **Goal ID**: chat-session-management
- **归档时间**: 2026-06-21T12:00:00Z
- **快照**: [docs/goal-history/2026-06-21-chat-session-management.md](../goal-history/2026-06-21-chat-session-management.md)
- **完成度**: 15/15 criteria PASS
- **Turns**: 42
- **关键交付**:
  - C1-C3: 类型定义 + GitHub API 扩展 + 超时保护
  - C4-C6: 会话存储层 + 历史恢复 + Mock 模式
  - C7-C9: /create 触发 + 安全门控
  - C10-C12: GFM 渲染 + DOMPurify XSS 防护
  - C13-C15: 敏感信息脱敏 + 端到端集成
- **ADR 关联**: ADR-012, ADR-013, ADR-014, ADR-015
- **后续**: 下一代目标见 docs/goals/backlog.md → Now
```

## 规则

- 每个归档条目之间用 `---` 分隔
- 归档条目按时间倒序排列（最新在最上方）
- Goal ID 自增，从 GOAL-001 开始
- 快照文件路径必须与实际文件名一致
