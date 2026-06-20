# Agent Rubric Summary

权威质量标准见 [../docs/quality.md](../docs/quality.md)。本文件只保留 Agent 执行摘要。

## 发布门槛

- P1 才能部署。
- P3/F 不能部署。
- 构建成功不等于 P1。

## 必须记住

- 平台主站：Vite `base: '/'`。
- 生成应用：Vite `base: './'`。
- 游戏类必须可玩，不是只显示界面。
- 工具类必须能输入、处理、输出。
- verifier 失败时继续修。
