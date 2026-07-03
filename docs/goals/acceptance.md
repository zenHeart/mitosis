# Acceptance

## 完成前必须检查

```markdown
## 验收报告

### 范围
- Goal: ...
- 修改文件: ...
- 未改动范围: ...

### 验证
- [ ] 残留搜索: 命令 + 结果
- [ ] 构建/测试: 命令 + 结果
- [ ] verifier: PASS/FAIL + 摘要

### 风险
- P0: none / ...
- P1: none / ...
- 待人工确认: none / ...
```

## 不可接受

- “应该通过”但没有命令输出。
- 只说 Agent 自检，没有 verifier。
- verifier 失败后仍写完成。
- 把 P1/P0 风险藏在“后续优化”里。
- 本地 PASS 但没有解释线上 `https://mitosis.zenheart.site` 是否同样 PASS。
- 把真实 token/key/secret、个人信息或敏感截图复制进文档、Issue、PR 或日志。

## 文档类 goal

至少运行：

- 残留搜索：旧完成记录、旧目标文件、旧 OAuth 说法、旧子路径部署说法均不得出现。
- 触发语义搜索：未实现的 `/build` 或未接线的 `owner-approved` 不得写成已可用能力。
- 语义搜索：平台主站 `base: '/'` 与生成应用 `base: './'` 每处出现都必须标明适用对象。
- 安全搜索：不得出现真实 key、token、client secret 值。
- 构建：`npm run build` 成功。

## 平台 MVP goal

至少运行：

```bash
npm run typecheck
npm run build
RUN_BUILD=1 bash scripts/verify/main-pipeline.sh
BASE_URL=http://127.0.0.1:5173 node scripts/verify/e2e-golden.mjs
```

如果目标涉及部署、线上体验、OAuth、Gallery 或 CI 状态，还必须运行或明确阻塞：

```bash
BASE_URL=https://mitosis.zenheart.site node scripts/verify/e2e-golden.mjs
```

## 生成应用 goal

从生成应用目录运行：

```bash
npm install
npx vue-tsc -b --noEmit
npm run build
bash ../../../worker/verify-build.sh
```
