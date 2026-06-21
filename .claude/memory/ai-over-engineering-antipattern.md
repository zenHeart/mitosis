---
name: ai-over-engineering-antipattern
description: "AI tends to add unrequested features and over-engineer; verify every feature against explicit user requirements and remove what wasn't asked for"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 725bec4d-6db0-475b-b6b9-b3c430755295
---

# AI 过度工程反模式 — 只做用户要求的，不多不少

## 问题

AI 辅助开发时倾向于"锦上添花"——添加用户没有要求的特性。这些特性可能：
1. 引入未预期的 Bug（如 ghost piece、粒子系统导致卡顿）
2. 使代码库膨胀（200 个无用的 DOM 节点）
3. 与用户意图冲突（用户说"不该有虚线方块"）

## 规则

1. **只实现用户明确要求的特性**，不添加"建议的"、"改进的"、"增强的"功能
2. **每个新特性提交前自问**："如果用户说'去掉这个'，我能立刻删掉吗？"
3. **性能敏感的特性（动画、粒子、DOM 数量）需要用户确认后再加**
4. **Verifier 应维护功能黑名单**：明确列出"不允许存在的特性"

## 用户反馈即需求

```
用户: "两个问题: 1. 不该有下落的虚线方块提示去掉"
     → ghost piece 是 AI 自行添加的，用户从未要求
     → 应立即移除，不需要讨论

用户: "动效效果太卡了"
     → 粒子系统是 AI 自行添加的
     → 应立即移除，不需要优化（用户不想要）
```

## Verifier 功能黑名单

Verifier 应检查构建产物中**不存在**以下元素：
- `[class*="ghost"]` — ghost piece 虚线预览
- `.particle` / `.particles-container` — 粒子系统
- `[class*="glow"]` — glow 效果
- 已删除的应用（如 `snake-game`）

## 教训来源

- `8a89dc6` — 移除 ghost piece 虚线预览 + 完全移除粒子系统（125 行删除）
- `a3bd0e6` — verifier 加入功能黑名单检查
- `7527eb9` — verifier 加入 Playwright 游戏交互测试
- 用户反馈："不该有下落的虚线方块"、"动效效果太卡了"

## 相关记忆

- [[css-calc-no-js-constants]] — 另一个 AI 过度工程的例子（CSS calc 误用）
- [[change-impact-analysis]] — 变更前分析影响范围
