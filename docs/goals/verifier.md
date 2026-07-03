# Verifier

## 本地 verifier

本地 `/goal` 可使用独立 verifier 子任务或手动命令。输出必须能被 `/goal` 评估器从 transcript 中看到。

推荐格式：

```text
VERDICT: PASS|FAIL
CHECKS:
- residual-search: pass|fail
- build: pass|fail
- verifier-script: pass|fail|skipped
ISSUES:
- none
```

## 平台 MVP verifier

平台自身目标必须同时区分回归守卫和目标门：

```bash
npm run typecheck
npm run build
RUN_BUILD=1 bash scripts/verify/main-pipeline.sh
BASE_URL=http://127.0.0.1:5173 node scripts/verify/e2e-golden.mjs
```

- `main-pipeline.sh` 是必须保持绿色的回归守卫。
- `e2e-golden.mjs` 是 README MVP 目标门；本地 PASS 不代表线上 PASS。
- 涉及线上发布时必须补跑 `BASE_URL=https://mitosis.zenheart.site node scripts/verify/e2e-golden.mjs`。

## 生成应用 CI verifier

CI 从生成应用目录运行：

```bash
bash ../../../worker/verify-build.sh
```

`worker/verify-build.sh` 退出码：

- `0`：通过，可以 commit/deploy。
- `1`：失败，必须继续修或 fail job。

## 失败回环

失败摘要必须短、可执行：

```text
Previous verifier failed:
- build failed: <first actionable error>
- quality failed: <failed check>
Fix these before claiming completion.
```

不要把完整长日志追加进 prompt；保留高信号错误即可。
