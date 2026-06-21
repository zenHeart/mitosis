---
name: css-calc-no-js-constants
description: CSS calc() cannot reference JavaScript constants directly; use CSS custom properties (--var) instead
metadata: 
  node_type: memory
  type: reference
  originSessionId: 725bec4d-6db0-475b-b6b9-b3c430755295
---

# CSS calc() 不能使用 JS 常量，必须用 CSS 自定义属性

## 问题

在 CSS 中写 `calc(COLS * 30px)` 时，`COLS` 和 `ROWS` 是 JavaScript 常量。浏览器不认识这些 CSS 标识符，会将整个 `calc()` 判定为无效，容器尺寸坍缩到内容最小尺寸（通常只有 4x4px）。

## 规则

1. **CSS `calc()` 中的变量必须是 CSS 自定义属性**（`--var`），不能是 JS 常量
2. **在元素或 `:root` 上声明 CSS 变量**，然后在 calc 中引用
3. **响应式断点中修改变量值**，而不是重写整个 calc 表达式

## 正确写法

```css
/* ✅ 正确：CSS 自定义属性 */
.board-container {
  --cell-size: 30px;
  --gap: 2px;
  --cols: 10;
  --rows: 20;
  width: calc(var(--cols) * var(--cell-size) + (var(--cols) - 1) * var(--gap));
  height: calc(var(--rows) * var(--cell-size) + (var(--rows) - 1) * var(--gap));
}

/* 响应式：只修改变量 */
@media (max-width: 768px) {
  .board-container {
    --cell-size: 20px;
    /* width/height 自动适配 */
  }
}
```

```vue
<!-- ❌ 错误：JS 常量在 CSS 中不可用 -->
<style>
.board-container {
  width: calc(COLS * 30px);  /* COLS 是 JS 常量，浏览器不认识 */
}
</style>
```

## 验证

CSS 健康检查应能检测：
- `calc(` 后面紧跟非 `var(` 的标识符 → 可能是 JS 常量引用
- 容器实际渲染尺寸与预期尺寸差异 > 50% → 可能是 calc 失效

## 教训来源

- `13ebd27` — 俄罗斯方块主窗口不渲染 — CSS calc 使用 JS 常量导致尺寸坍缩
- verifier Phase 2.7: CSS 健康检查

## 相关记忆

- [[vite-build-time-env-vars]] — 构建时 vs 运行时的变量边界
