# Security

## P0 阻断

以下内容不得进入文档、日志、commit、Issue 评论或生成应用：

- token
- password
- API key
- client secret
- 客户名、邮箱、手机号、住址、联系人原始信息
- 包含敏感信息的截图

内部文档链接或接口链接本身不是 P0；只有链接中包含 token、密码、密钥或敏感个人信息时才阻断。

## 本地文件

禁止读取、复制、提交：

- `.claude/settings.local.json`
- `.env`
- `.claude/.goal-verdict`
- 本地验证日志中的真实凭据

允许提交：

- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/rules/*.md`
- `.mcp.json`，仅作为本地 Playwright MCP 配置

## 文档写法

- Secret 名称可以出现，例如 `STEP_TOKEN`、`GITHUB_CLIENT_SECRET`。
- 真实值必须写成占位符，例如 `<stepfun-api-key>`。
- 不要把终端输出整段复制进长期文档；只写摘要和可复现命令。

## 网络核验

本项目仓库开源，但本地配置、secrets、Issue 中的个人信息仍按私有信息处理。确需联网核验时，只使用可信官方来源，并优先 GET/HEAD/OPTIONS。

## 完成声明

没有 fresh 验证证据，不得写“已完成”“通过”“可发布”。

## IssueOps 安全门控

- 仓库是开源的，外部用户可以创建 Issue 或评论。
- 外部 Issue 或外部 `/build` 评论不得直接触发 Agent Loop。
- 真实 Agent Loop 只允许两类请求：
  - Issue 作者是仓库 owner。
  - 仓库 owner 通过 `/build` 评论或 `owner-approved` label 批准。
- Issue 必须带有明确的 `app/{name}` label 才能构建应用。
- 验证通过后创建 draft PR，等待人工审查；不直接合入主干。
