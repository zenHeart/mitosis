# Deployment

Mitosis 部署到 `https://mitosis.zenheart.site`，使用 GitHub Pages 的 `gh-pages` 分支。

## 部署对象

| 对象 | 来源 | 部署路径 | Vite base |
|------|------|----------|-----------|
| 平台主站 | 根项目 `src/` | `/` | `base: '/'` |
| Agent 生成应用 | `apps/{name}/v{n}/dist` | `/apps/{name}/v{n}/` | `base: './'` |

这两个 base 语义不同，不能互相替换。

## 平台主站

根项目 `vite.config.ts`：

```typescript
export default defineConfig({
  plugins: [vue()],
  base: '/',
})
```

原因：`mitosis.zenheart.site` 是 CNAME 根路径部署，平台资源应从 `/assets/` 加载。

## 生成应用

`worker/prompt.txt` 要求生成应用的 `vite.config.ts` 使用：

```typescript
export default defineConfig({
  plugins: [vue()],
  base: './',
})
```

原因：应用部署在 `/apps/{name}/v{n}/`，需要相对路径资源才能在版本目录中直接访问。

## GitHub Actions

- `mitosis.yml`：当前由 Issue 评论中的 `/create` 触发 Agent Loop，生成新应用版本或平台变更，通过 verifier 后创建 draft PR。
- `deploy.yml`：PR 合入 `master` 后构建平台主站，并把已有应用 dist 复制到部署目录。

> 当前 P0 gap：Workspace 创建 Issue 后还必须触发 `/create`，否则 CI 不会启动。执行状态与后续修复项见根目录 `goal.md`。

## 验证清单

- `https://mitosis.zenheart.site` 返回 200。
- 平台 JS/CSS 从 `/assets/` 加载。
- `https://mitosis.zenheart.site/apps/{name}/v{n}/` 返回 200。
- 生成应用 JS/CSS 使用相对路径加载。
- 打开任意生成应用能看到返回 Mitosis 页面继续迭代的入口。
- `BASE_URL=https://mitosis.zenheart.site node scripts/verify/e2e-golden.mjs` 与本地 golden 结果一致；否则先排查部署漂移。
