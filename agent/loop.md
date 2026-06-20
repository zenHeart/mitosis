# Agent Loop Protocol

## 原则

- 目标来自 `goal.md`。
- 范围来自 `goal.md`。
- 验收来自 `goal.md`、`agent/acceptance.md`、`docs/quality.md`。
- 当前 goal 未完成前，不新增自发任务。

## 执行步骤

1. 读 `goal.md`，列出验收 checklist。
2. 读必要文档，不通读无关历史。
3. 做最小修改。
4. 运行验证命令。
5. 根据 verifier 结果决定：
   - PASS：更新 backlog/archive，输出结果。
   - FAIL：修复失败项，重新验证。
   - BLOCKED：说明阻塞证据和下一步，不伪装通过。

## 本地 `/goal`

本地 Claude Code 可以使用 `CLAUDE.md`、`.claude/rules/*.md`、hooks、MCP、subagent。

Stop Hook 阻止结束时应使用：

```json
{
  "decision": "block",
  "reason": "Verifier failed. Continue fixing the listed issues."
}
```

或者：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "Verifier failed. Continue fixing the listed issues."
  }
}
```

不要用 `continue:false` 作为失败回环机制；它会停止处理，且 `stopReason` 不会反馈给模型继续修。

## CI Loop

CI 使用 `claude -p --bare`，不会自动加载 `CLAUDE.md`、`.claude/rules/*.md`、hooks、MCP、skills 或 auto memory。CI 必须在 workflow 中显式：

1. 运行 Claude Code。
2. 进入生成应用目录。
3. 运行 `bash ../../../worker/verify-build.sh`。
4. verifier 失败则把摘要追加到下一轮 prompt。
5. 最多 3 次，仍失败则 fail job。
