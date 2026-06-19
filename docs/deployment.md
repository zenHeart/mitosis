# 部署指南 — mitosis.zenheart.site

## 概述

本文档描述如何将 Mitosis 平台部署到 `https://mitosis.zenheart.site`。

## 部署架构

```
zenHeart/mitosis (单一仓库)
├── index.html              ← Mitosis SPA 入口（GitHub Pages 根目录）
├── assets/                 ← 构建产物（CSS, JS）
├── apps/                   ← Agent 构建的应用
│   └── {app-name}/
│       └── v{n}/
├── .github/
│   └── workflows/
│       └── mitosis.yml     ← CI/CD 工作流
└── src/                    ← Mitosis 平台源代码

GitHub Pages 配置:
- Source: master/main 分支根目录
- 域名: mitosis.zenheart.site (CNAME → zenHeart.github.io)
- 子路径: /mitosis/ (通过 Vite base 配置)
```

## DNS 配置

`mitosis.zenheart.site` 已通过 CNAME 指向 `zenHeart.github.io`：

```bash
# 验证 DNS 解析
dig mitosis.zenheart.site

# 预期: CNAME → zenHeart.github.io
# 或 A record → GitHub Pages IP
```

## Vite 子路径配置

`vite.config.ts` 必须设置正确的 base path，使所有资源路径自动映射到 `/mitosis/` 子路径：

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/mitosis/',  // ← 关键：子路径部署
  plugins: [vue()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
```

## 部署流程

### 方式 A：手动部署（初始部署）

```bash
# 1. 构建 Mitosis
cd /Users/zenheart/code/github/mitosis
npm install
npm run build

# 2. 将构建产物复制到仓库根目录
cp -r dist/* .

# 3. 提交推送（GitHub Pages 自动部署）
git add index.html assets/ src/ package.json vite.config.ts tsconfig.json
git commit -m "deploy: mitosis platform v0.1.0"
git push origin master
```

GitHub Pages 会自动从 `master` 分支根目录部署。

### 方式 B：自动化部署（GitHub Actions）

在 `.github/workflows/mitosis.yml` 中配置自动部署：

```yaml
- name: Build and Deploy
  if: success()
  run: |
    npm install
    npm run build
    # 将构建产物复制到仓库根目录供 GitHub Pages 使用
    cp -r dist/* .
    git add index.html assets/
    git config user.name "mitosis-bot"
    git config user.email "mitosis@users.noreply.github.com"
    git commit -m "deploy: mitosis v${{ github.sha }}" || echo "No changes to commit"
    git push origin master
```

> **注意:** 此步骤使用内置的 `GITHUB_TOKEN`（由 GitHub Actions 自动提供），无需额外配置 PAT。

## GitHub Pages 设置

1. 进入 `zenHeart/mitosis` 仓库 **Settings → Pages**
2. **Source** 选择 **Deploy from a branch**
3. **Branch** 选择 `master`（或 `main`），目录选择 **/ (root)**
4. 保存后 GitHub 会自动部署，访问 `https://mitosis.zenheart.site`

## 验证清单

部署后执行以下验证：

- [ ] `https://mitosis.zenheart.site` 返回 200
- [ ] 打开浏览器 DevTools → Network → 所有资源状态 200
- [ ] 没有 404 错误
- [ ] 页面标题显示 "Mitosis"
- [ ] Vue 应用成功挂载（检查 `<div id="app">` 内有内容）
- [ ] 资源路径以 `/mitosis/assets/` 开头（确认 base 配置生效）

## 常见问题

### Q: 页面显示 404

**A:** 检查以下几点:
1. `mitosis.zenheart.site` DNS 是否正确指向 GitHub Pages（`zenHeart.github.io`）
2. `zenHeart/mitosis` 仓库的 GitHub Pages 设置中 Source 是否为 `master` 分支
3. 仓库根目录是否包含 `index.html`
4. Vite `base` 配置是否为 `/mitosis/`

### Q: CSS/JS 加载 404

**A:** Vite 构建产物的资源路径由 `base` 控制，确保 `vite.config.ts` 中 `base` 正确:
```typescript
base: '/mitosis/'  // 必须匹配部署子路径
```

### Q: 刷新页面 404（Vue Router）

**A:** 如果使用 Vue Router history 模式，需要在 GitHub Pages 添加 404 fallback。MVP 不使用 Router，仅使用条件渲染，无此问题。

### Q: 不需要跨仓库部署了？

**A:** 正确。Mitosis 使用自己的 GitHub Pages（`zenHeart/mitosis` 仓库），不再需要 PAT 或跨仓库推送。`mitosis.zenheart.site` 的 CNAME 已指向 `zenHeart.github.io`，GitHub Pages 自动路由到 `zenHeart/mitosis` 仓库的部署。

---

*部署完成后，确保 `https://mitosis.zenheart.site` 可正常访问。*
