# Backlog

本文件只做摘要队列。执行时以根目录 [`goal.md`](../../goal.md) 的 Stage backlog 为唯一权威。

## Now

- 修复聊天创建 Issue 但 CI 不启动的 P0 缺口：当前 workflow 只监听 `/create` issue comment，Workspace 只创建 Issue。
- 部署本地已通过 golden-path 的修复，消除线上旧 asset 导致的 quota 死胡同。
- 移除 GitHub token/user 的 localStorage fallback，并把安全 verifier 扩展到 GitHub 与 StepFun token。
- 用真实浏览器/CI 验证 owner OAuth、Setup、Workspace、IssueOps、draft PR、merge deploy 和 Gallery 可见。

## Next

- Gallery loading/error、键盘访问、focus visible、`transition: all`、移动端缩放等体验收口。
- 为当前公开示例应用建立统一桌面/移动端 smoke：`tetris-game` v1/v2/v3、`snake-game` v0。
- 统一文档中的 IssueOps 触发语义：当前实现使用 `/create`，未实现的 `/build` 或 `owner-approved` 不能写成已可用能力。
- 远程 platform agent 演练：CI 只读 Issue + `goal.md`，完成一个 criteria 并产出 draft PR。

## Done

- README/docs 路由收口，README 作为项目首页和导航层。
- Vue 3 + TypeScript + Vite 平台脚手架。
- GitHub OAuth + Cloudflare Worker token exchange 基础实现。
- Workspace 创建 GitHub Issue 的基础能力。
- GitHub Actions Agent Loop 骨架。
- Gallery 匿名浏览和 `/apps/{name}/v{n}/` 示例应用访问。
- 本地 `typecheck`、`build`、`main-pipeline`、`e2e-golden` 当前可通过。
