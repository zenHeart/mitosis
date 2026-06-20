# Goal: Mitosis 自举 MVP 闭环

## 目标

实现并验证 Mitosis 最核心的 MVP 闭环。**全部验证优先在本地完成，生产部署仅在本地全部通过后进行。**

## 串行验证流程（严格顺序）

```
┌─────────────────────────────────────────────────────────────────┐
│  用户只需: /goal @goal.md                                        │
│                                                                  │
│  Agent Loop 自动按以下顺序迭代，每一步通过后才能进入下一步      │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌─────────────────────────────────────────────────────────┐
  │  Stage 0: 平台自举修复                                    │
  │  ─────────────────────────────────────────────────────  │
  │  确保 mitosis 平台本身可以正常运行：                      │
  │  - npm run build 通过                                     │
  │  - localhost:5173 可访问                                  │
  │  - Gallery 加载应用列表（本地 fallback 模式）              │
  │  - 应用页面可访问（Vite middleware serve dist）            │
  └─────────────────────────────────────────────────────────┘
                          │
                          ▼  Stage 0 PASS
  ┌─────────────────────────────────────────────────────────┐
  │  Stage 1: 俄罗斯方块修复                                  │
  │  ─────────────────────────────────────────────────────  │
  │  通过本地构建机制修复 tetris-game 使其可玩：               │
  │  - 进入 Workspace（本地 token 模拟登录）                  │
  │  - 聊天触发 Issue 创建（或直接本地构建）                  │
  │  - 运行 worker/verify-build.sh                            │
  │  - Playwright 验证可玩性（9 项 T1-T9）                    │
  └─────────────────────────────────────────────────────────┘
                          │
                          ▼  Stage 1 PASS
  ┌─────────────────────────────────────────────────────────┐
  │  Stage 2: 贪吃蛇创建（通过聊天窗口真实构建）              │
  │  ─────────────────────────────────────────────────────  │
  │  ⚠️ 此阶段不允许本地直接实现贪吃蛇！                      │
  │  必须通过以下真实流程：                                    │
  │  1. 在 Workspace 聊天输入"做一个贪吃蛇游戏"              │
  │  2. Agent 分流 → 创建 Issue                               │
  │  3. CI 自动构建（mitosis.yml）                            │
  │  4. 部署到 gh-pages                                      │
  │  5. 验证贪吃蛇可玩                                        │
  └─────────────────────────────────────────────────────────┘
                          │
                          ▼  Stage 2 PASS
  ┌─────────────────────────────────────────────────────────┐
  │  Stage 3: 生产部署验证                                    │
  │  ─────────────────────────────────────────────────────  │
  │  仅在本地全部通过后：                                      │
  │  - 部署到 mitosis.zenheart.site                          │
  │  - 验证匿名用户可访问                                     │
  │  - 验证 GitHub OAuth 流程                                 │
  └─────────────────────────────────────────────────────────┘
```

## 使用方式：`/goal` 自迭代循环

```bash
# 运行此命令后，Claude Code 会自动持续迭代直到所有验收标准通过
/goal @goal.md
```

**Loop 机制：**
1. **Executor Agent** 读 `goal.md` → 按 Stage 顺序执行 → 修改代码 → 调用 `mvp-verifier` subagent
2. **Verifier Agent** 用真实工具验证（Playwright 浏览器 + Bash 构建 + GitHub API）
3. **Stop Hook** 检查 verifier 结果 → PASS 允许停止，FAIL 则 block + 反馈
4. **循环** 直到全部 PASS 或达到 1000 turn 上限

**详细协议：** `.claude/rules/goal-loop.md`
**Verifier 定义：** `.claude/agents/verifier.md`
**构建验证脚本：** `agent/verify-mvp.sh`（Phase 2）
**本地验证脚本：** `agent/verify-local.sh`（Phase 1 本地补充）
**进度追踪：** `.claude/.goal-state.json`

---

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
- `.claude/agents/`
- `.claude/hooks/`

禁止修改：
- `.claude/settings.local.json`
- 真实 token、key、secret
- 与 MVP 自举闭环无关的功能

---

## 阻塞点处理指南

以下阻塞点在 agent 迭代中会自动处理，无需用户手动干预：

### GitHub OAuth（阻塞 C2, C3）
**处理方式：** 使用本地 token 模拟登录，不依赖真实 OAuth 流程。
```bash
# 本地测试时，在 .env.local 中设置：
VITE_GITHUB_TOKEN=ghp_your_github_pat_here
```
Agent 会读取环境变量 `GITHUB_MCP_PAT` 或 `.env.local` 中的 token 模拟登录。

### StepFun API（阻塞 C4）
**处理方式：** Workspace 分流逻辑已内置关键词规则，无需 StepFun API 也能工作。
- "做一个xxx" → build 分流
- "优化xxx" → platform 分流
- "怎么使用" → chat 分流

### GitHub API 连接失败（阻塞 Gallery）
**处理方式：** Gallery.vue 已内置 `LOCAL_APPS` fallback，API 失败时自动显示本地应用列表。

### Playwright MCP 不可用
**处理方式：** 标记为 SKIPPED，使用 `verify-local.sh`（curl 验证）替代。不阻断整体 verdict。

### CI/GitHub Secrets
**处理方式：** 本地验证不依赖 CI。CI 验证仅检查 workflow 语法正确性。

---

## 验收标准（Verifier 可检查版）

### C1: 匿名 Gallery 可用（本地验证）
- [ ] `localhost:5173` HTTP 200，页面标题 "Mitosis"
- [ ] Gallery 显示应用列表（本地 fallback 或 API 数据）
- [ ] 至少包含 tetris-game 应用卡片
- [ ] 点击应用卡片 → 导航到 `/apps/{name}/v{n}/`
- [ ] 应用页面 HTTP 200，有可见内容，无 console.error

### C2: 登录流程（本地模拟）
- [ ] 通过环境变量注入 token 模拟已登录状态
- [ ] 登录后界面显示用户信息（而非登录按钮）
- [ ] Owner 进入 Workspace

### C3: Owner 识别（本地模拟）
- [ ] 模拟 owner 登录后进入 Setup → Workspace
- [ ] 非 owner 看到 fork/copy 指引

### C4: Workspace 分流（本地）
- [ ] 输入"帮我做一个俄罗斯方块" → 分流为 build
- [ ] 输入"优化 Mitosis 的聊天界面" → 分流为 platform
- [ ] 输入"怎么使用？" → 分流为 chat，直接回复，不创建 Issue
- [ ] 分流逻辑不依赖 StepFun API（关键词规则 fallback）

### C5: Issue 自动构建（CI 验证）
- [ ] `mitosis.yml` 有 `app/{name}` label 检查
- [ ] `mitosis.yml` 有 owner approval gate
- [ ] CI 使用 `claude -p --bare` 模式
- [ ] CI 运行 `verify-build.sh`
- [ ] CI 有 3 次 retry loop

### C6: 生成应用质量
- [ ] `npm run build` exit 0
- [ ] `worker/verify-build.sh` PASS
- [ ] 无真实 token/secret 在代码中
- [ ] Vite base 配置正确（平台 `/`，应用 `./`）

### C7: 部署正确
- [ ] `deploy.yml` 正确复制 apps dist 到 gh-pages
- [ ] `/apps/{name}/v{n}/` 路径可访问（本地 Vite middleware 验证）
- [ ] SPA fallback（404.html）正确处理 OAuth redirect

---

## 验证命令

```bash
# 快速本地验证（每次修改后运行）
bash agent/verify-local.sh --verbose

# 完整构建验证（Phase 2）
bash agent/verify-mvp.sh --verbose

# 单独验证生成应用
cd apps/tetris-game/v1 && bash ../../../worker/verify-build.sh

# 安全扫描
rg "(ghp_|gho_|github_pat_|sk-|AKIA|AIza|eyJ)" \
  --type-add 'code:*.{ts,js,vue,json,yml,yaml,sh,env}' \
  -g '!*.md' \
  src/ apps/ worker/ .github/ || echo "SECURITY_SCAN: PASS"

# CI workflow 语法检查
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/mitosis.yml"); puts "yaml ok"'

# Claude Code 规则位置检查
find .claude -maxdepth 3 -type f ! -name settings.local.json ! -name .goal-state.json ! -name .goal-verdict -print | sort

# State 文件格式检查
python3 -m json.tool .claude/.goal-state.json
```

---

## 风险

- P0：真实密钥、token、个人信息进入仓库。
- P0：外部用户 Issue 或评论直接触发写权限 Agent Loop。
- P1：需求不清却直接写入 Issue，导致 Agent 构建错误目标。
- P1：验证通过前 commit/deploy。
- P1：生成应用可构建但匿名用户打不开真实版本路径。
- P1：平台自身迭代和应用构建没有分流，导致改错目标。
- P1：贪吃蛇直接在本地实现（而非通过聊天窗口触发真实构建流程）。

---

## 完成后更新

- 将完成摘要写入 `agent/archive.md`。
- 将下一个 MVP 任务写入 `agent/backlog.md` 的 Now。
- 如果 verifier 失败，保留高信号失败摘要，不复制长日志。

---

## 附录：Verifier 输出示例

```json
{
  "timestamp": "2026-06-20T12:00:00Z",
  "verdict": "PARTIAL",
  "test_env": "local",
  "criteria_results": {
    "c1-anon-gallery": {"status": "PASS", "detail": "Gallery 加载正常，应用列表通过本地 fallback 显示"},
    "c2-login-flow": {"status": "SKIPPED", "detail": "本地 token 模拟登录，跳过 OAuth 验证"},
    "c3-owner-recognition": {"status": "PASS", "detail": "本地 token 模拟 owner，正确进入 Workspace"},
    "c4-workspace-triage": {"status": "PASS", "detail": "分流逻辑存在，关键词规则完整"},
    "c5-issue-build": {"status": "SKIPPED", "detail": "CI 验证跳过，仅检查 workflow 语法"},
    "c6-app-quality": {"status": "PASS", "detail": "npm run build 通过，verify-build.sh PASS"},
    "c7-deployment": {"status": "PASS", "detail": "Vite middleware 正确 serve apps dist"}
  },
  "failed_items": [],
  "passed_items": ["平台构建通过", "Gallery fallback 正常", "分流逻辑存在", "应用构建通过"],
  "next_actions": ["验证 tetris-game 可玩性（Playwright 交互测试）"],
  "overall_progress": "5/7 criteria passed, 2 skipped (local-only)"
}
```
