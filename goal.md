# Goal: README MVP 对齐与线上体验收口

> 状态：active
> 最近审计：2026-07-03（Asia/Shanghai）
> 最高权威：`README.md` 定义的 MVP 三阶段路径，其次是 `docs/product/overview.md`。

本目标不是重新定义产品，而是把当前实现、线上部署和 README 的 MVP 承诺重新对齐：

1. 匿名用户能在 `https://mitosis.zenheart.site` 浏览并真实使用已部署应用。
2. 登录后按仓库归属分流：owner 进入 setup/workspace，非 owner 获得复制/fork 指引并仍可浏览公开应用。
3. owner 在 Workspace 用聊天创建或迭代应用，也能发起 Mitosis 平台自身迭代。
4. GitHub Actions Agent Loop 通过 owner gate、verifier、draft PR、human review、merge 和 Pages 部署形成闭环。
5. 回到 Gallery 后新版本可见，PC 和移动端体验良好。

安全优先级高于功能。任何真实 token、password、secret、个人联系方式、敏感截图泄露都是 P0；不得复制到文档、Issue、日志或 PR。

---

## 1. 当前事实（本轮 fresh 证据）

### 本地代码现状

- `master` 当前领先 `origin/master` 9 个提交；这些提交包含 StepFun 错误恢复、platform fallback、图片输入、Gallery/mobile/accessibility 和 golden-path 相关改动。
- `npm run typecheck`：PASS。
- `npm run build`：PASS。
- `RUN_BUILD=0 bash scripts/verify/main-pipeline.sh`：`MAIN_PIPELINE: PASS`。
- 本地 dev server：`http://127.0.0.1:5173/` 可启动。
- `BASE_URL=http://127.0.0.1:5173 node scripts/verify/e2e-golden.mjs`：`GOLDEN: PASS`。

### 线上站点现状

- `https://mitosis.zenheart.site/` HTTP 200。
- 线上首页当前引用的构建资源为 2026-06-28 发布的旧 asset；与本地最新构建 asset 不一致。
- `BASE_URL=https://mitosis.zenheart.site node scripts/verify/e2e-golden.mjs`：FAIL，失败项为 G4。线上仍显示原始英文 quota 文案 `You exceeded your current quota...`，并且没有恢复出口。
- 线上示例路径均 HTTP 200：
  - `/apps/tetris-game/v1/`
  - `/apps/tetris-game/v2/`
  - `/apps/tetris-game/v3/`
  - `/apps/snake-game/v0/`
- Playwright 桌面 1280x720 与移动端 390x844 打开上述示例页面：基础渲染正常，未观察到 console/page error，未观察到横向溢出。
- Gallery 在首次 1.6s 采样时可能仍显示“加载中...”；延长到 8s 后可加载 `snake-game v0` 与 `tetris-game v3` 两张卡。需要把“加载慢/失败”的 UX 作为体验缺口处理。

### 已确认的主链路缺口

- `.github/workflows/mitosis.yml` 只监听 `issue_comment` 里的 `/create`。
- `Workspace.createBuild()` / `createPlatformBuild*()` 当前只创建 Issue，没有随后评论 `/create`。
- 因此“聊天 -> 创建 Issue”不等于“CI Agent Loop 开始构建”。这是 README MVP 闭环的 P0 缺口。

### 未完成或未核验

- 真实 GitHub OAuth owner 登录、Setup、Workspace 建 app/platform Issue、CI 运行 StepFun agent、draft PR、merge、Pages 发布、Gallery 新版本可见，尚未端到端验证。
- 非 owner 登录后的 fork/copy 指引尚未用真实账号验证。
- `owner-approved` label 审批路径在文档中出现，但当前 workflow 未真正把该 label 作为触发条件。
- GitHub OAuth token 当前仍有进入 `localStorage` 的代码路径；这违反“token 不持久化到 localStorage”的安全目标。
- 本地开发环境可能因为注入 GitHub token 自动登录，人工观察匿名路径时必须使用干净 browser context 或显式 mock。

---

## 2. MVP 完成定义（全部满足才算完成）

- [ ] D1 线上站点与本地最新修复对齐：线上 `e2e-golden` 至少达到当前本地同等结果，G4 不再泄露原始英文 quota，且有恢复出口。
- [ ] D2 聊天建 app/platform 后能真实触发 CI：Issue 创建、`/create` 触发、owner gate、status label、verifier、draft PR 全链路可观察。
- [ ] D3 GitHub/StepFun token 不进入 `localStorage`，不渲染到 DOM，不出现在长期文档、Issue 或日志。
- [ ] D4 owner 真实路径可跑通：OAuth -> Setup -> Workspace -> app build Issue -> platform Issue -> CI -> draft PR -> merge -> deploy -> Gallery 可见。
- [ ] D5 非 owner 真实路径可理解、可继续：不能进入不可用死胡同，必须给出 fork/copy/Pages/Worker/Secrets 指引并保留公开应用浏览。
- [ ] D6 PC 与移动端基础体验达标：无横向溢出、触控目标 >= 44px、可键盘操作、可见 focus、错误有恢复动作、长文本不破版。
- [ ] D7 当前公开示例应用全部可用：`tetris-game` v1/v2/v3 与 `snake-game` v0 在桌面和移动端能打开、开始、响应核心输入。
- [ ] D8 文档与代码触发语义一致：统一使用 `/create` 或明确实现的触发机制；不得继续写未实现的 `/build` 或未接线的 `owner-approved`。
- [ ] D9 远程自迭代可用：CI 中的 platform agent 只读 Issue + `goal.md`，选择第一个未完成项，最小实现，通过 verifier，产出 draft PR。

---

## 3. 执行 Backlog（按顺序，一轮只做一项）

### Stage 0 — 停止假绿，修通 CI 触发

- [x] C0.1 修复”创建 Issue 但 CI 不启动”的 P0 缺口。
  - 可选实现 A：Workspace 创建 app/platform Issue 后，由 owner token 立即评论 `/create`。
  - 可选实现 B：workflow 增加安全的 `issues.opened`/label 触发，并保留 owner gate。
  - 完成标准：从 Workspace 发”做一个 todo 应用”和”优化 Mitosis 支持发送图片”后，真实或 mock verifier 都能证明 CI 入口会被触发；重复触发仍受 `status:building` 去重保护。

- [x] C0.2 给 C0.1 增加 CI-runnable verifier。
  - 完成标准：脚本能静态或 mock 验证”Issue 创建后有 `/create` 触发或 workflow 监听对应事件”，并纳入 `scripts/verify/main-pipeline.sh` 或 `e2e-golden.mjs`。

- [x] C0.3 部署当前本地修复到线上，消除 deployment drift。
  - 完成标准：`origin/master`/部署分支包含本地修复；线上 asset 时间或内容已更新；`BASE_URL=https://mitosis.zenheart.site node scripts/verify/e2e-golden.mjs` 不再在 G4 失败。

- [x] C0.4 增加部署漂移检查。
  - 完成标准：有可复现命令或脚本记录本地 HEAD、`origin/master`、`gh-pages`/线上 asset 的差异；后续 agent 能判断”本地 PASS 但线上 FAIL”是否由未部署导致。

### Stage 1 — 安全与凭据边界

- [x] C1.1 移除 GitHub OAuth token/user 写入 `localStorage` 的路径。
  - 当前风险点：`src/stores/auth.ts` 仍写入/读取 `mitosis_token` 与 `mitosis_user` 的 localStorage fallback。
  - 完成标准：GitHub token 只在 session 级或更安全机制中保存；刷新/关闭标签页后的行为有清晰 UX；`rg "localStorage.*mitosis_(token|user)" src/` 不再命中敏感写入。

- [x] C1.2 强化安全 verifier。
  - 完成标准：`scripts/verify/main-pipeline.sh` 同时检查 GitHub token 与 StepFun token 不写 localStorage、不渲染 DOM；不误伤 theme/mock session 等非敏感本地数据。

- [x] C1.3 修复错误恢复中的 token 更新路径。
  - 当前风险点：Workspace 的”更新 Token”只改 hash，不一定能回到 Setup 或打开可操作输入。
  - 完成标准：auth/quota 错误后，用户能在当前流程中更新 StepFun token 或明确回到可用的 Setup；无死链接。

### Stage 2 — 真实 owner / non-owner 闭环

- [ ] C2.1 真实验证 GitHub OAuth callback。
  - 完成标准：干净浏览器访问线上站点，GitHub OAuth 能返回页面并被 `authStore.init()` 消费；失败时页面给出可读原因。

- [ ] C2.2 真实验证 owner Setup。
  - 完成标准：owner 登录后仓库归属判断正确；StepFun token 验证、GitHub Secrets 指引、完成 setup 后进入 Workspace；token 不显示明文。

- [ ] C2.3 真实验证 app build 闭环。
  - 完成标准：发“做一个 todo 应用”后创建 app Issue、触发 CI、进入 status:building/status:verifying/status:review 或 status:failed；UI 能轮询并展示状态。

- [ ] C2.4 真实验证 platform build 闭环。
  - 完成标准：发“优化 Mitosis 支持发送渲染图片”后不依赖 LLM 成功也能创建 platform Issue 并触发 CI；进入 draft PR 审查路径。

- [ ] C2.5 真实验证非 owner 路径。
  - 完成标准：非 owner 不进入不可用 Workspace；能继续浏览公开应用；fork/copy 指引与当前 repo 配置、Pages、Worker、Secrets 要求一致。

### Stage 3 — PC / 移动端体验收口

- [ ] C3.1 Gallery loading/error 体验。
  - 当前现象：GitHub Contents API 慢时首屏长时间只显示“加载中...”。
  - 完成标准：1.5s 内有 skeleton 或稳定占位；8s 超时给出可操作错误/重试；本地 fallback 不掩盖线上 API 错误。

- [ ] C3.2 交互语义与键盘访问。
  - 当前风险点：Gallery app card 和部分 session item 使用 `div @click` / `role=button`；需要补齐 button/a 语义或完整键盘事件。
  - 完成标准：主要可点击元素可 Tab 聚焦、Enter/Space 触发、focus visible 清晰；链接导航保留 Cmd/Ctrl/中键语义。

- [ ] C3.3 移除高风险 UI anti-pattern。
  - 完成标准：平台关键交互不再使用 `transition: all`；`outline: none` 均有 `:focus-visible` 替代；动画尊重 `prefers-reduced-motion`。

- [ ] C3.4 移动端浏览器能力不被禁用。
  - 当前风险点：`apps/tetris-game/v3/index.html` 含 `maximum-scale=1.0, user-scalable=no`。
  - 完成标准：所有平台/应用 HTML 不禁用用户缩放；移动端仍无横向溢出。

- [ ] C3.5 ChatInput 图片体验完整。
  - 完成标准：选择/粘贴图片后预览、删除、大小错误、发送后清空、进入 Issue body 或明确降级都可见；普通文本粘贴不被误阻断。

### Stage 4 — 示例应用版本质量

- [ ] C4.1 为当前公开示例建立统一冒烟脚本。
  - 完成标准：脚本覆盖 `tetris-game` v1/v2/v3 与 `snake-game` v0 的桌面/移动端加载、开始按钮、核心输入、console/page error、横向溢出。

- [ ] C4.2 Tetris 各版本移动端可玩性。
  - 完成标准：v1/v2/v3 移动端都有清晰开始方式和触控操作；不能只依赖键盘说明。

- [ ] C4.3 Snake v0 移动端可玩性。
  - 完成标准：移动端方向控制、开始/暂停、得分变化可通过 Playwright 或人工步骤验证。

### Stage 5 — 文档与远程自迭代

- [x] C5.1 统一 IssueOps 触发语义。
  - 完成标准：`README.md`、`docs/agent-loop.md`、`docs/security.md`、`docs/product/deployment.md`、`docs/product/chat-session-design.md`、`worker/prompt-platform.txt` 对 `/create`、owner gate、`owner-approved` 的描述与代码一致。

- [x] C5.2 更新 CI platform prompt 读取本 goal 的协议。
  - 完成标准：`worker/prompt-platform.txt` 不再写死“读 goal.md 第 3 节”；而是明确读取本文件 Stage backlog 的第一个未完成项。

- [ ] C5.3 远程 platform 自迭代演练。
  - 完成标准：owner 创建 platform Issue 并评论 `/create`；CI 中 `claude -p --bare` 读取 `goal.md`，完成一个未勾选项，运行 verifier，创建 draft PR。

---

## 4. 单轮执行协议（后续 agent 必须遵守）

1. 先读本文件，不从旧 goal、记忆或历史提交推断当前状态。
2. 选择第 3 节第一个未勾选 `[ ]` 的 criteria 作为本轮唯一目标。
3. 读相关代码和文档现实；如果发现本文件事实已过期，先用 fresh 命令验证，再最小更新本文件。
4. 改动前先做安全检查：不得打印环境变量或复制任何真实 token/key/secret；不得读取 `.env*`、`.claude/settings.local.json`。
5. 只改实现当前 criteria 必需的文件，不顺手重构。
6. 每轮至少运行：

```bash
npm run typecheck
npm run build
RUN_BUILD=1 bash scripts/verify/main-pipeline.sh
```

7. 涉及主链路、Gallery、Workspace、移动端或示例应用时，还必须运行：

```bash
npm run dev -- --host 127.0.0.1 --port 5173
BASE_URL=http://127.0.0.1:5173 node scripts/verify/e2e-golden.mjs
```

8. 涉及线上一致性或 deployment 时，还必须运行：

```bash
BASE_URL=https://mitosis.zenheart.site node scripts/verify/e2e-golden.mjs
```

9. 只有 fresh 验证通过后，才能把对应 `[ ]` 改成 `[x]`。如果验证受真实 OAuth、真实 GitHub token、CI runner 或人工 merge 阻塞，保留 `[ ]`，写清阻塞证据和下一步。
10. 完成报告必须区分事实、推断和建议。不得用“应该通过”替代命令输出。

---

## 5. 固定验证命令

```bash
# 基础
npm run typecheck
npm run build
RUN_BUILD=1 bash scripts/verify/main-pipeline.sh

# 本地 MVP 黄金路径
npm run dev -- --host 127.0.0.1 --port 5173
BASE_URL=http://127.0.0.1:5173 node scripts/verify/e2e-golden.mjs

# 线上黄金路径
BASE_URL=https://mitosis.zenheart.site node scripts/verify/e2e-golden.mjs

# 公开示例 URL smoke
for p in / /apps/tetris-game/v1/ /apps/tetris-game/v2/ /apps/tetris-game/v3/ /apps/snake-game/v0/; do
  curl -s -o /dev/null -w "$p %{http_code} %{content_type}\n" "https://mitosis.zenheart.site$p"
done

# 敏感信息扫描（不得输出真实命中内容到长期文档）
rg -i "(ghp_|gho_|github_pat_|sk-|AKIA|AIza|eyJ)" \
  --type-add 'code:*.{ts,js,vue,json,yml,yaml,sh}' \
  -g '!*.md' src/ apps/ worker/ .github/ scripts/ || echo "SECURITY_SCAN: PASS"
```

注意：如果本地 shell 已配置 GitHub/StepFun 凭据，禁止运行会把真实值打印出来的命令（例如裸 `printenv`）。只记录“凭据存在/不存在”的脱敏结论。

---

## 6. 范围

允许修改：

- `src/`
- `scripts/verify/`
- `.github/workflows/`
- `worker/`
- `docs/`
- `goal.md`
- `README.md`（仅当 README 与已实现触发语义或导航明显不一致时）
- `apps/*`（仅限当前 criteria 要求的公开示例体验修复）

禁止修改：

- `.env*`
- `.claude/settings.local.json`
- 任何真实 token/key/secret
- 与当前 criteria 无关的历史应用版本
- CI owner gate 的安全边界，除非当前 criteria 正是修复 owner gate；修复时必须先写 verifier

---

## 7. 当前最高风险

- P0：CI 触发缺口导致聊天创建 Issue 后不启动 Agent Loop。
- P0：GitHub token localStorage fallback 违反敏感凭据规则。
- P1：线上部署落后本地，导致用户仍看到旧 quota 死胡同。
- P1：真实 owner OAuth/setup/CI/draft PR 尚未端到端验证。
- P1：文档中 `/build`、`owner-approved` 与当前 workflow 实现不一致，会误导后续 agent。
- P2：Gallery 加载慢时反馈不足。
- P2：平台和示例应用仍有 `transition: all`、禁用缩放、弱语义交互等移动端/可访问性问题。
