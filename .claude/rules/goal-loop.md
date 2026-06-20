# Goal Loop Rules

本规则用于本地 Claude Code `/goal` 会话。CI 不读取本文件；CI 路径见 `docs/agent-loop.md`。

## 启动顺序

1. 先读 `goal.md`。
2. 再读 `AGENT.md`、`agent/README.md`、`agent/acceptance.md`、`agent/verifier.md`。
3. 只执行 `goal.md` 中允许的范围。
4. 不读取 `.claude/settings.local.json`，不复制任何真实 token/key/secret。

## 执行循环

1. 将 `goal.md` 的验收标准转成 checklist。
2. 小步修改，每次只改与当前 goal 直接相关的文件。
3. 修改后运行 `goal.md` 中列出的验证命令。
4. 完成前必须运行 verifier：
   - 文档/平台任务：至少运行残留搜索和 `npm run build`。
   - 生成应用任务：从 `apps/{name}/v{n}` 运行 `bash ../../../worker/verify-build.sh`。
5. verifier FAIL 时继续修复，不得声称完成。
6. verifier PASS 后，在回复中引用验证命令和结果。

## 完成条件

只有同时满足以下条件才可结束：

- `goal.md` 所有验收标准均满足。
- transcript 中包含 fresh 验证命令输出。
- verifier 输出 `VERDICT: PASS` 或等价的 PASS 摘要。
- 没有 P0/P1 未解释风险。
- `agent/backlog.md` 和 `agent/archive.md` 已按需更新。

## 禁止事项

- 禁止“看起来可以”“应该通过”等无证据结论。
- 禁止为只使用一次的逻辑做额外抽象。
- 禁止顺手重构无关代码。
- 禁止提交 `.claude/.goal-verdict`、本地日志、真实凭据。
- Stop Hook 失败反馈必须使用 `decision: "block"` 或 `additionalContext`，不要用 `continue:false` 作为让模型继续修复的机制。
