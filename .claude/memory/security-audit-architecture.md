---
name: security-audit-architecture
description: "Security audit architecture: rules + skill + verifiers three-layer defense model"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 04959b8e-b4aa-43d0-8790-1f13691d15c1
---

# Security Audit Architecture

## 三层防御模型

| 层级 | 位置 | 职责 | 触发时机 |
|------|------|------|----------|
| Layer 1 | `.claude/rules/security.md` | 安全铁律，自动加载 | 每次会话 |
| Layer 2 | `.claude/skills/security-audit/SKILL.md` | 快速模式扫描 | 每轮 setgoal Phase C |
| Layer 3 | `verifiers/*.sh` | 深度验证 | 对应 criteria 验证时 |

## security-audit Skill 内容

5 步快速扫描：
1. 敏感数据泄露（token/secret/env var）
2. DOMPurify 配置验证
3. CI Owner 门控验证
4. 脱敏逻辑验证
5. fetchWithTimeout 覆盖率

**判定：** PASS → 继续 verifier / FAIL → 停止修复 / WARN → 继续需人工确认

## 集成点

- `setgoal/SKILL.md` Phase C 必须调用 security-audit
- `CLAUDE.md` Non-Negotiables 添加安全要求
- `goal.md` 已定义 C8-C16 安全相关 criteria

## 相关记忆

- [[chat-session-architecture]] — Issue-backed 安全模型
- [[oauth-redirect-loop-github-pages]] — OAuth 安全（含 authStore.init() 铁律）
- [[gallery-api-timeout-protection]] — 超时保护
- [[verifier-must-measure-not-check]] — 验证方法论
