# Agent Archive

本文件记录已完成 goal 的摘要，不保存长日志。

## 2026-06-20 — 文档与 Goal Loop 收口

- 建立 `README.md`、`docs/`、`agent/` 三层文档结构。
- 建立根目录 `goal.md` 作为唯一活跃目标。
- 建立 `CLAUDE.md` 与 `.claude/rules/goal-loop.md` 作为本地 Claude Code 官方规则入口。
- 明确本地 `/goal` 与 CI `--bare` 是两条路径。
- 明确 CI 必须显式运行 `worker/verify-build.sh`。
