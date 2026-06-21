---
name: verifier-must-measure-not-check
description: "Verifier must measure actual visual dimensions, FPS, CSS health — not just check element existence. Presence != correctness."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 725bec4d-6db0-475b-b6b9-b3c430755295
---

# Verifier 必须测量，不能只检查存在性

## 问题

Verifier 常见的错误是只检查"元素是否存在"（`querySelector` 返回非 null），而不检查"元素是否正确"（尺寸、性能、行为）。这导致：
- 4x4px 的游戏棋盘通过检查（元素存在，但坍缩了）
- 10-15 FPS 的游戏通过检查（游戏运行，但卡顿到不可玩）

## 规则

Verifier 检查必须从"存在性检查"升级为"测量检查"：

| 检查类型 | ❌ 错误（存在性） | ✅ 正确（测量） |
|---------|-----------------|-----------------|
| 视觉尺寸 | `.board-container` 存在 | `board-container` 宽高 >= 300x600px |
| 性能 | 游戏能运行 | FPS >= 55，帧时间 < 20ms |
| CSS 健康 | 样式已加载 | `calc()` 不含 JS 常量引用 |
| 功能 | 元素存在 | 功能黑名单：无 ghost/particles/glow |
| DOM 健康 | 无 console error | DOM 节点数合理，无内存泄漏 |

## 测量 vs 检查的思维转变

```
检查思维: "这个元素存在吗？" → 通过
测量思维: "这个元素的宽度是多少像素？" → 318px ✓ / 4px ✗

检查思维: "游戏能开始吗？" → 通过
测量思维: "游戏运行时的平均 FPS 是多少？" → 58fps ✓ / 12fps ✗
```

## Verifier 必须覆盖的测量项

### Phase 2.6: 视觉尺寸
- 关键容器的 `getBoundingClientRect()` 宽高
- 最小尺寸阈值（如棋盘 300x600px）
- 响应式断点下的尺寸验证

### Phase 2.7: CSS 健康
- 检测 `calc()` 中使用非 CSS 变量的标识符
- 检测无效的 CSS 值（如 `NaN`、`undefined` 出现在计算中）
- 检测过度使用 `box-shadow`、`filter` 等重绘属性

### Phase 2.8: 功能黑名单
- 检查构建产物中不存在不应该有的类名/元素
- 检查已删除的应用不在 Gallery 中

### Phase 2.9: 性能基线
- 游戏场景下 FPS >= 55
- 关键交互响应时间 < 100ms
- 无持续增长的 DOM 节点数

## 教训来源

- `a3bd0e6` — verifier 加入 P0 检查（视觉尺寸、功能黑名单、FPS、CSS 健康）
- `7527eb9` — verifier 加入 Playwright 游戏交互测试
- `13ebd27` — CSS calc 导致 4x4px 坍缩（verifier 只检查元素存在）
- `8a89dc6` — 粒子系统导致卡顿（verifier 不测量 FPS）
- `4a131d9` — 生产 Gallery 显示已删除应用（verifier 只检查 localhost）

## 相关记忆

- [[css-calc-no-js-constants]] — CSS 健康检查的具体检测项
- [[ai-over-engineering-antipattern]] — 功能黑名单的设计动机
- [[change-impact-analysis]] — 变更影响分析的验证要求
