---
name: self-bootstrap-ux-only-not-full-instance
description: "Agent-built apps only need a \"continue creating\" UX entry + minimal metadata, NOT a full independent Mitosis instance"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 921d04e3-375f-4245-9727-1f581e3be57d
---

# 自举原则：UX 入口即可，无需完整实例

## 核心原则

Agent 构建的应用**不需要**成为独立运行的 Mitosis 实例（`.claude/settings.json` + `.github/workflows/mitosis.yml` 全套）。

Mitosis 的自我进化闭环**已经在主站 Workspace 聊天中实现**：
```
Workspace 聊天 → Issue → Agent Loop → apps/{name}/v{n}/ → 用户回到 Workspace 继续迭代
```

每个 app 只需要携带：
1. **"🧬 基于此继续创造"按钮** — 点击跳回 `mitosis.zenheart.site?ref={app-name}`
2. **最小元数据**（可选）— `.claude/build-info.json` 记录出处（app_name, version, built_by, prompt_summary）
3. **Workspace 检测 `?ref=` 参数** — 自动在聊天上下文注入"在 {app-name} 基础上继续开发"

## 为什么不需要完整实例

| 误解 | 现实 |
|------|------|
| 每个 app 应该是独立 Mitosis | CI/CD 永远在 zenHeart/mitosis 主仓库运行 |
| app 需要自己的聊天会话 | 用户在主站 Workspace 中统一管理所有迭代 |
| app 需要自举的 .github/workflows | 所有构建都走主仓库的 mitosis.yml |

## 相关

[[vite-build-time-env-vars]]
[[oauth-redirect-loop-github-pages]]
