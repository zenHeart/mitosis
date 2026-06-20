# Goal: Mitosis 自举 MVP 闭环

## 目标

实现并验证 Mitosis 最核心的 MVP 闭环：

1. 登录后的聊天窗口可以自举迭代 Mitosis 本身。
2. 登录后的聊天窗口可以创建新应用，并基于已创建应用继续迭代。
3. 匿名用户可以真实打开并使用 Mitosis 中已部署的应用。
4. GitHub IssueOps + GitHub Actions + Claude Code loop 有安全门控、自校验、状态反馈和人工审查。

## 范围

允许修改：

- `src/`
- `worker/`
- `.github/workflows/`
- `apps/`
- `docs/`
- `agent/`
- `goal.md`
- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/rules/`

禁止修改：

- `.claude/settings.local.json`
- 真实 token、key、secret
- 与 MVP 自举闭环无关的功能

## 验收标准

- [ ] Workspace 对不清楚的用户需求先澄清，澄清完整后才创建 Issue。
- [ ] Workspace 能区分应用创建/应用迭代/Mitosis 平台自身迭代。
- [ ] 应用创建和应用迭代 Issue 带有明确 `app/{name}` label。
- [ ] Mitosis 平台自身迭代不会误触发应用构建；必须进入人工审核或 owner-approved 平台 loop。
- [ ] 匿名 Gallery 使用 GitHub public API 加载应用，并打开真实最新版本路径 `/apps/{name}/v{n}/`。
- [ ] GitHub Actions 只允许仓库 owner 创建或批准的 IssueOps 请求触发真实 Agent Loop。
- [ ] 外部 Issue 或外部 `/build` 评论只能得到 owner approval 提示，不能运行 Claude Code。
- [ ] Agent Loop 每次生成后运行 `worker/verify-build.sh`；失败最多重试 3 次。
- [ ] Issue 状态通过 `status:building`、`status:verifying`、`status:review`、`status:failed` 反馈。
- [ ] verifier 通过后创建 draft PR 等待人工审查；合入 `master` 后才部署。
- [ ] 本地 Claude Code 使用官方 `CLAUDE.md`、`.claude/settings.json`、`.claude/rules/*.md` 结构，不在 `.claude/` 下新增非官方文件。
- [ ] CI `--bare` 路径不依赖本地 Claude Code 规则、hooks、MCP、skills 或 auto memory，必须显式运行 `worker/verify-build.sh`。
- [ ] 没有真实密钥、token、个人信息进入仓库。

## 验证命令

```bash
npm run build
cd apps/tetris-game/v1 && bash ../../../worker/verify-build.sh
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/mitosis.yml"); puts "yaml ok"'
rg "owner-approved|status:verifying|status:review|verify-build.sh" .github/workflows/mitosis.yml docs agent README.md
python3 -m json.tool .claude/settings.json
find .claude -maxdepth 3 -type f ! -name settings.local.json -print | sort
```

## 风险

- P0：真实密钥、token、个人信息进入仓库。
- P0：外部用户 Issue 或评论直接触发写权限 Agent Loop。
- P1：需求不清却直接写入 Issue，导致 Agent 构建错误目标。
- P1：验证通过前 commit/deploy。
- P1：生成应用可构建但匿名用户打不开真实版本路径。
- P1：平台自身迭代和应用构建没有分流，导致改错目标。

## 完成后更新

- 将完成摘要写入 `agent/archive.md`。
- 将下一个 MVP 任务写入 `agent/backlog.md` 的 Now。
- 如果 verifier 失败，保留高信号失败摘要，不复制长日志。
