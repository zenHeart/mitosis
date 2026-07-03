# Mitosis UX 改进清单

> 来源：`docs/ux-audit-2026-07-03.md`
> 用途：供构建 agent 逐项执行，每项完成后对照验收标准验证
> 优先级：🔴 High → 🟡 Medium → 🟢 Low

---

## 🔴 High（必须完成）

### 1. 统一替换 emoji 为 SVG 图标 ✅

**对应审计项：** S1、S2
**对应 goal.md：** C3.6 全端 UI 细节优化
**完成日期：** 2026-07-03

**验收标准：**
- 以下位置的 emoji 全部替换为 Lucide Vue SVG 图标：
  - `🧬` Logo → 使用 `<Logo>` 或 SVG
  - `🔧📱📋` 会话分组标签 → SVG 图标 + 文字
  - `📦` 应用图标 → SVG 图标
  - `🎮📝🔢🧬⚙️💬` 快捷按钮 → SVG 图标
  - `☰×☀️🌙` 导航/主题按钮 → SVG 图标
- 图标风格统一（同一 stroke width、corner radius）
- LoginPage 已有的 GitHub SVG 图标保留，与新图标集风格对齐

**验证命令：**
```bash
rg -n "🧬|🔧|📱|📋|📦|🎮|📝|🔢|⚙️|💬|☰|×|☀️|🌙" src/
# 应无命中，或仅在测试文件/数据中
```

---

### 2. Gallery app-item 改为语义化 button/a ✅

**对应审计项：** A1
**对应 goal.md：** C3.2 交互语义与键盘访问
**完成日期：** 2026-07-03

**验收标准：**
- `Gallery.vue` 中 app-item 的 `div @click` 改为 `<button>` 或 `<a>` 标签
- 如用 `<button>`：保留现有样式，添加 `type="button"`，保持 cursor:pointer
- 如用 `<a>`：添加 `href` 和 `@click.prevent`，保持在新标签页打开行为
- Tab 可聚焦，Enter/Space 可触发，focus-visible 样式清晰

**验证命令：**
```bash
rg -n "div.*app-item|@click.*openApp" src/components/Gallery.vue
# 确认无 div+@click 作为主要交互
```

---

### 3. ChatInput 附件按钮扩展到 44×44px ✅

**对应审计项：** T1
**对应 goal.md：** C3.1 交互语义
**完成日期：** 2026-07-03

**验收标准：**
- 附件按钮实际点击区域 ≥ 44×44px
- 可通过增大 padding、改为 44px 宽高、或使用 `::after` 伪元素扩展点击区域
- 视觉大小保持合理，不突兀

**验证方法：**
- Playwright 测量元素尺寸：`await page.locator('.attach-btn').boundingBox()`
- 或手动 Chrome DevTools 检查

---

### 4. 移除 tetris-game/v3 viewport 禁用缩放 ✅

**对应审计项：** L1
**对应 goal.md：** C3.4 移动端浏览器能力不被禁用
**完成日期：** 2026-07-03

**验收标准：**
- `apps/tetris-game/v3/index.html` 的 viewport 移除 `maximum-scale=1.0, user-scalable=no`
- 保留 `width=device-width, initial-scale=1.0`
- 移动端打开 v3 仍无横向溢出

**验证命令：**
```bash
rg -n "maximum-scale|user-scalable" apps/tetris-game/v3/index.html
# 应无命中
```

---

## 🟡 Medium（后续迭代）

### 5. Gallery 加载状态添加骨架屏 ✅

**对应审计项：** P1
**对应 goal.md：** C3.1 Gallery loading/error 体验
**完成日期：** 2026-07-03

**验收标准：**
- loading 状态显示 2-3 个骨架卡片（skeleton cards），而非仅"加载中..."文字 ✅
- 骨架卡片尺寸与真实卡片一致，避免内容跳转 ✅
- 超时后（8s）显示可操作错误/重试按钮 ✅

**验证方法：**
- 节流网络到 Slow 3G，观察加载体验

---

### 6. 全局添加 prefers-reduced-motion 支持 ✅

**对应审计项：** A1、A2、A3
**对应 goal.md：** C3.3 移除高风险 UI anti-pattern
**完成日期：** 2026-07-03

**验收标准：**
- 在 `main.css` 或全局样式中添加：
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
- 特殊动画（如 `brandShift`、`stepPulse`）在 reduced-motion 下改为静态样式

**验证方法：**
- macOS 系统设置 → 辅助功能 → 显示 → 减弱动态效果 → 打开后刷新页面验证

---

### 7. 图片超限改用内联提示 ✅

**对应审计项：** F1
**对应 goal.md：** C3.5 ChatInput 图片体验完整
**完成日期：** 2026-07-03

**验收标准：**
- `ChatInput.vue` 中图片大小超限时，不使用 `alert()`
- 改为在输入框下方显示红色文字提示（如"图片大小超过 5MB 限制"）
- 不阻塞用户后续操作

**验证方法：**
- 选择超过 5MB 的图片，确认显示内联错误而非 alert

---

### 8. 恢复操作按钮和会话打开按钮达到 44px ✅

**对应审计项：** T3、T4
**对应 goal.md：** C3.1 交互语义
**完成日期：** 2026-07-03

**验收标准：**
- Workspace.vue 中 session-open-btn `min-height` ≥ 44px（移动端）
- 恢复操作按钮移动端 `min-height` ≥ 44px

**验证方法：**
- 移动端视口下检查按钮尺寸

---

## 🟢 Low（优化项）

### 9. 清理 auth.ts 中残留的 localStorage 清理代码 ✅

**对应审计项：** Q1

**完成日期：** 2026-07-03

**验收标准：**
- `src/stores/auth.ts` 中 `localStorage.removeItem('mitosis_token')` 和 `'mitosis_user'` 已删除
- `rg "localStorage.*mitosis_(token|user)" src/` 无命中

**验证方法：**
- `rg "localStorage.*mitosis_(token|user)" src/`

---

### 10. 统一硬编码颜色为 CSS 变量 ✅

**对应审计项：** T1、T2

**完成日期：** 2026-07-03

**验收标准：**
- `Gallery.vue` 中的 `#666`、`#555` 已改为 `var(--text-tertiary)`
- `Workspace.vue` 中的渐变已提取为 `var(--user-msg-bg)` CSS 变量

**验证方法：**
- `rg "#666|#555" src/components/Gallery.vue` 无命中
- `rg "linear-gradient\(135deg, #58a6ff, #79c0ff\)" src/` 无命中

---

### 11. 添加 skip link ✅

**对应审计项：** A5

**完成日期：** 2026-07-03

**验收标准：**
- 在 `App.vue` 中添加 skip link：`<a href="#main-content" class="skip-link">跳到主要内容</a>`
- 各 view 组件添加 `id="main-content"`
- `.skip-link` CSS：默认 `top: -100%`，focus 时 `top: 0`

**验证方法：**
- Tab 键聚焦时 skip link 出现在页面顶部

---

### 12. 侧边栏关闭时恢复滚动位置 ✅

**对应审计项：** N2

**完成日期：** 2026-07-03

**验收标准：**
- Workspace.vue 中侧边栏打开时保存 `window.scrollY`
- 关闭时恢复 `window.scrollTo(0, savedY)`

**验证方法：**
- 滚动页面后打开侧边栏，关闭后页面恢复原位

---

### 13. 替换 transition: all 为具体属性 ✅

**对应审计项：** Q2

**完成日期：** 2026-07-03

**验收标准：**
- `Workspace.vue` 中 `.app-nav-open-btn`、`.back-to-app-btn`、`.examples button`、`.step-icon` 的 `transition: all` 已替换为具体属性
- `Gallery.vue` 中 `.cta-btn`、`.sidebar-toggle`、`.theme-toggle` 的 `transition: all` 已替换为具体属性

**验证方法：**
- `rg "transition:\s*all" src/` 无命中

---

### 14. 添加缺失的 aria-label ✅

**对应审计项：** A2、A4、N1

**完成日期：** 2026-07-03

**验收标准：**
- Gallery.vue 侧边栏切换按钮已添加 `aria-label="打开会话侧边栏"`
- Gallery.vue 关闭按钮已添加 `aria-label="关闭侧边栏"`
- Gallery.vue theme toggle 已添加动态 `:aria-label`
- Workspace.vue 侧边栏关闭按钮已添加 `aria-label="关闭侧边栏"`

---

## 执行顺序建议

1. 先完成 🔴 High（1-4），它们是视觉专业度和可访问性的关键障碍
2. 再完成 🟡 Medium（5-8），提升首屏体验和无障碍基础
3. 🟢 Low（9-14）可在有余力时逐项处理

每完成一项后运行：
```bash
npm run typecheck && npm run build
```

涉及 UI 变动的项目完成后运行：
```bash
npm run dev -- --host 127.0.0.1 --port 5173 &
BASE_URL=http://127.0.0.1:5173 node scripts/verify/e2e-golden.mjs
```

---

## 最终验证（2026-07-03 Playwright v5 + e2e-golden）

### 截图重验证结果

| # | 问题 | 视口 | 状态 |
|---|------|------|------|
| V1 | theme-toggle 白色背景 | 移动端 375x812 | ✅ 已修复 |
| V2 | Logo Dna 图标过大 | 移动端 375x812 | ✅ 已修复 |
| V3 | Footer 贴底 | 移动端 375x812 | ✅ 已修复 |
| V4 | 垂直间距过大 | 移动端 375x812 | ✅ 已修复 |
| V5 | 布局不平衡 | 桌面端 1440x900 | ✅ 已修复 |
| V6 | 卡片内部对齐 | 全端 | ✅ 已修复 |

### 验证命令输出

```bash
# 构建验证
npm run build          # PASS (847ms)
npm run typecheck      # PASS

# 主流水线
scripts/verify/main-pipeline.sh  # PASS (8/8 checks)

# e2e 黄金指标
BASE_URL=http://127.0.0.1:5173 node scripts/verify/e2e-golden.mjs  # PASS (9/9)
```

**所有 UX 改进项已完成并通过验证。**
