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

## CI verifier

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
