# 部署指南 — blog.zenheart.site/mitosis/

## 概述

本文档描述如何将 Mitosis 平台部署到 `http://blog.zenheart.site/mitosis/`。

## 当前架构

```
zenHeart/zenHeart.github.io (博客仓库)
├── index.html              ← 博客首页
├── _config.yml             ← Jekyll 配置
├── _posts/                 ← 博客文章
├── mitosis/                ← Mitosis 平台部署目录
│   ├── index.html          ← Mitosis SPA 入口
│   ├── assets/             ← 构建产物
│   └── apps/               ← Agent 构建的应用
│       └── {app-name}/
│           └── v{n}/
```

## 部署流程

### 方式 A：手动部署（初始部署）

```bash
# 1. 构建 Mitosis
cd /Users/zenheart/code/github/mitosis
npm install
npm run build

# 2. 克隆博客仓库
gh repo clone zenHeart/zenHeart.github.io /tmp/blog
cd /tmp/blog

# 3. 创建 mitosis 目录并复制构建产物
mkdir -p mitosis
cp -r /Users/zenheart/code/github/mitosis/dist/* mitosis/

# 4. 提交推送
git add mitosis/
git commit -m "deploy: mitosis platform v0.1.0"
git push origin master
```

### 方式 B：自动化部署（GitHub Actions）

在 `zenHeart/mitosis` 仓库的 `.github/workflows/mitosis.yml` 中配置跨仓库部署步骤:

```yaml
- name: Deploy to blog
  if: success()
  run: |
    git clone https://${{ secrets.MITOSIS_PAT }}@github.com/zenHeart/zenHeart.github.io.git /tmp/blog
    # 清理旧版本
    rm -rf /tmp/blog/mitosis/*
    # 复制新构建产物
    cp -r dist/* /tmp/blog/mitosis/
    cd /tmp/blog
    git config user.name "mitosis-bot"
    git config user.email "mitosis@users.noreply.github.com"
    git add mitosis/
    git commit -m "deploy: mitosis v${{ github.sha }}"
    git push origin master
  env:
    GITHUB_TOKEN: ${{ secrets.MITOSIS_PAT }}
```

## PAT 配置

### 生成 Personal Access Token

1. 访问 https://github.com/settings/tokens
2. 点击 **Generate new token (classic)**
3. 选择以下 scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Actions workflows)
4. 生成并保存 token（仅显示一次！）

### 存储到 GitHub Secrets

```bash
# 在 zenHeart/mitosis 仓库
gh secret set MITOSIS_PAT \
  --repo zenHeart/mitosis \
  --body "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

## DNS 验证

确保 `blog.zenheart.site` 正确指向 GitHub Pages:

```bash
# 检查 DNS 解析
dig blog.zenheart.site

# 预期: CNAME → zenHeart.github.io
# 或 A record → GitHub Pages IP
```

## Vite 子路径配置

`vite.config.ts` 必须设置正确的 base path:

```typescript
export default defineConfig({
  base: '/mitosis/',  // ← 关键：子路径部署
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
```

## 验证清单

部署后执行以下验证:

- [ ] `http://blog.zenheart.site/mitosis/` 返回 200
- [ ] 打开浏览器 DevTools → Network → 所有资源状态 200
- [ ] 没有 404 错误
- [ ] 页面标题显示 "Mitosis"
- [ ] Vue 应用成功挂载（检查 `<div id="app">` 内有内容）

## 常见问题

### Q: 页面显示 404

**A:** 检查以下几点:
1. `blog.zenheart.site` DNS 是否正确指向 GitHub Pages
2. 博客仓库的 GitHub Pages 设置中 Source 是否为 `master` 分支
3. `mitosis/` 目录是否包含 `index.html`
4. Vite `base` 配置是否为 `/mitosis/`

### Q: CSS/JS 加载 404

**A:** Vite 构建产物的资源路径是相对的，确保 `vite.config.ts` 中 `base` 正确:
```typescript
base: '/mitosis/'  // 必须匹配部署子路径
```

### Q: 刷新页面 404（Vue Router）

**A:** 如果使用 Vue Router history 模式，需要在 GitHub Pages 添加 404 fallback。MVP 不使用 Router，仅使用条件渲染，无此问题。

---

*部署完成后，确保 `http://blog.zenheart.site/mitosis/` 可正常访问。*
