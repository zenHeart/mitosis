# Goal: 主链路修复 + MVP 体验打磨（远程可自迭代）

> 上一目标「会话管理系统 MVP（Issue-backed 三场景 + 生命周期命令）」已交付，归档见 git history。
> 本目标聚焦：**修复主链路所有阻断问题，把 MVP 体验打磨到完成**，并保证后续可由
> **线上 GitHub Action Agent（Claude Code + StepFun 模型）持续远程迭代，脱离本地环境**。

---

## 0. 北极星与完成定义（DoD）

**北极星：** Owner 在 `mitosis.zenheart.site` 用一句话描述需求 → 系统永不死胡同地把它变成「一次构建 / 一条平台变更 / 一次有用回复」→ CI 构建 → 部署 → Gallery 可见 → 继续迭代。整个过程**对 LLM 配额/故障有韧性**，**不泄露任何用户密钥**，**体验顺滑**。

**完成定义（全部满足才算 MVP 完成）：**

1. 聊天链路在 StepFun 配额耗尽 / token 失效 / 网络故障时**不死胡同**：给出可操作恢复出口，核心「建 Issue 触发构建」始终可用（不依赖 LLM）。
2. `platform` 意图不再被 LLM 卡死：有「直连建 Issue」兜底路径。
3. 用户密钥（StepFun token）**不以明文存 localStorage、不渲染进 DOM**；前端最小暴露。
4. 错误信息可读、可操作（更新 token / 重试 / 直接建 Issue），无原始英文堆栈直糊。
5. 聊天支持发送图片/渲染图（用户字面诉求），或在不支持时明确提示并优雅降级。
6. Owner 闭环端到端跑通：聊天 → triage → build/platform → CI → verifier → PR → 部署 → Gallery 可见；进度刷新不丢、会话消息不串。
7. Gallery / 移动端 / 可访问性达到基础体验线（无截断、触控目标 ≥44px、无对比度失败）。
8. **远程自迭代可用**：线上 GitHub Action Agent 能读本目标 backlog，单轮挑一个未完成项实现并通过 verifier，**不依赖本地 `.claude` runtime**。

---

## 1. 迭代执行模型（本地 → 远程，脱离本地）

| 阶段 | 执行者 | 驱动 | Verifier |
|------|--------|------|----------|
| 现在 | 本地 Claude Code（cc-switch → StepFun anthropic 兼容端点） | 本地 setgoal 循环读 `goal.md` | 本地跑 `scripts/verify/*.sh` + `npm run typecheck/build` |
| 最终态 | **线上 GitHub Action Agent** = `claude -p --bare --model step-3.7-flash`，`ANTHROPIC_BASE_URL=https://api.stepfun.com/step_plan`，`ANTHROPIC_API_KEY=secrets.STEP_TOKEN` | Owner 发 `platform` Issue（引用 backlog 项）→ `.github/workflows/mitosis.yml` 跑 `worker/prompt-platform.txt` | CI 在 repo 内跑 `scripts/verify/*.sh` + typecheck/build，**不加载本地 hooks/skills/MCP/CLAUDE.md** |

**铁律（远程可迭代的前提）：**
- 所有 verifier 必须是**纯脚本**（bash/node），committed 进 repo，`claude -p --bare` 环境可直接执行，**不依赖** `.claude/` 自动加载、hooks、MCP、本地 skill。
- **单轮迭代协议内联在本文件第 4 节**（CI `--bare` 不会读 setgoal SKILL.md），远程 agent 只需读 `goal.md` + Issue 即可工作。
- `worker/prompt-platform.txt` 必须指向本文件作为 backlog 与验收来源；`mitosis.yml` 平台 verify 步骤必须运行 `scripts/verify/*.sh`。

---

## 2. 主链路问题清单（Backlog，按优先级）

### P0 — 阻断核心体验
- **B1 StepFun 配额/故障打死聊天**：`useStepFun.ts` 前端直连，配额耗尽时原始英文报错 `You exceeded your current quota` 直糊聊天，无恢复路径；`step-3.7-flash` 写死，无重试/降级。
- **B2 `platform` 意图被 LLM 卡死**：`platform` 分支必须等 StepFun 返回 `BUILD_PLATFORM:` 才建 Issue；LLM 死则永远建不出 Issue（对比 `build` 分支直连 `createBuild` 不依赖 LLM）。
- **B3 Token 安全**：StepFun token 明文存 `localStorage`（违反 security.md S2），`SetupPage` 把 token 原文渲染进 DOM（`{{ stepToken }}`）。

### P1 — 体验/正确性
- **B4 错误 UX 死胡同**：无「更新 token / 重试 / 直接建 Issue」出口；Workspace 内无法更新 token（仅 Setup 一次性输入）。
- **B5 缺「发送渲染图片」能力**：`ChatInput` 纯文本，用户字面诉求未满足。
- **B6 triage 正则脆弱**：`triageMessage` 一大坨正则堆叠，误分类多；无可观测的兜底澄清。
- **B7 复制/onboarding 门槛过高**：非 owner 进 Workspace 是死的；Setup 要 fork+开 Pages+配 Worker+手动加 secret，自助链路实质断裂。
- **B8 进度/会话状态**：`buildProgress` 仅存内存，刷新即丢；`mitosis_messages_cache` 全局 key 非按会话，切会话会串消息。

### P2 — 打磨
- **B9 Gallery / 移动端 / 可访问性**：截断、触控目标、对比度（近期已在迭代，需收口到验收线）。
- **B10 消息渲染一致性**：用户消息与 assistant 消息 markdown/sanitize 处理路径不一致，存在双重处理。

---

## 3. 分阶段验收（Stages）

> 每个 criteria 一次只做一项；改完跑对应 verifier；PASS 才进下一项。

### Stage 0 — 远程可迭代基线（最先做，解锁后续自迭代）
- [x] C0.1 新建 `scripts/verify/` 目录，存放 CI-runnable 纯脚本（不依赖 `.claude` runtime）
- [x] C0.2 `scripts/verify/main-pipeline.sh`：回归守卫（必须永远 PASS），末行 `MAIN_PIPELINE: PASS`/`FAIL` —— 当前 PASS
- [x] C0.2b `scripts/verify/e2e-golden.mjs`：真实 Chromium 黄金指标跟踪器（G1–G6，当前 RED，随 Stage 转 GREEN）；支持 `REAL_TOKEN`/`BASE_URL` 做真实登录态/线上验证；截图存 `/tmp/shot-*.png`
- [x] C0.3 `worker/prompt-platform.txt` 增加「goal.md backlog 驱动」单轮迭代协议
- [x] C0.4 `.github/workflows/mitosis.yml` 平台 verify 步骤追加 `RUN_BUILD=1 bash scripts/verify/main-pipeline.sh`（loop 首个任务；改动须保持 owner 门控不变）
- [x] C0.5 `npm run typecheck` + `npm run build` 0 error/0 warning 基线通过
- [x] C0.6 `.github/workflows/golden-path.yml`：CI 上用真实 Chromium 跑 e2e-golden 对线上站点验证（sandbox 无外网，远程验证归 CI）

### Stage 1 — 聊天链路韧性（B1）
- [x] C1.1 `chatWithStepFun` 增加超时（复用 `fetchWithTimeout`，默认 15s）与可配置 model
- [x] C1.2 配额/鉴权类错误（402/429/quota/insufficient）映射为**可读中文** + 可操作建议，不暴露原始英文堆栈
- [x] C1.3 LLM 调用失败时**不阻断主链路**：`chat` 降级为「我暂时无法生成回复，但你可以直接让我建任务」；`platform`/`build` 走 B2 直连兜底
- [x] C1.4 网络/5xx 错误自动重试 1 次（指数退避），仍失败再降级

### Stage 2 — Token 安全（B3）
- [x] C2.1 StepFun token 不再以明文存 `localStorage`：改为 `sessionStorage`（与 GitHub token 一致，刷新不丢、关 Tab 清除）
- [x] C2.2 `SetupPage` 不渲染 token 原文进 DOM（用「复制到剪贴板」按钮替代明文展示）
- [x] C2.3 安全扫描通过：`scripts/verify/main-pipeline.sh` 校验无 token 明文存储/渲染模式
- [x] C2.4 （文档）记录 Worker 代理 StepFun 作为 post-MVP 强化项，不阻塞本目标

### Stage 3 — platform 直连兜底（B2）
- [x] C3.1 `platform` 意图在 LLM 不可用时，提供「直接创建平台 Issue」路径（类比 `createBuild`），不依赖 `BUILD_PLATFORM:` 标记
- [x] C3.2 UI 给出明确确认（避免误触发平台构建）：一条系统消息 + 一个「创建平台变更任务」按钮/命令
- [x] C3.3 截图复现场景「优化 mitosis 支持发送渲染图片」走到底：要么建出 platform Issue，要么明确澄清，**不死胡同**

### Stage 4 — 错误恢复 UX（B4）
- [x] C4.1 Workspace 内可更新 StepFun token（无需回 Setup）
- [x] C4.2 失败的系统消息内嵌可操作出口：`重试` / `更新 token` / `直接建 Issue`
- [x] C4.3 所有 catch 分支不再直接抛原始 `e.message`，统一经错误格式化函数

### Stage 5 — 发送渲染图片（B5）
- [x] C5.1 `ChatInput` 支持选择/粘贴图片，前端预览
- [x] C5.2 图片随需求进入构建上下文（写入 Issue body，或明确「当前版本以文字描述为准」的优雅降级）
- [x] C5.3 图片渲染经过 sanitize；不引入 XSS 向量；不超出 Issue 体积限制时优雅提示

### Stage 6 — Owner 闭环打磨（B8）
- [x] C6.1 `buildProgress` 持久化（按 issueNumber），刷新可恢复
- [x] C6.2 消息缓存按 `session/issueNumber` 隔离，切会话不串
- [x] C6.3 侧边栏状态与 Issue label 实时一致（building/verifying/review/failed/closed）
- [x] C6.4 端到端：发需求 → 建 Issue → 轮询状态 → review/部署提示，全程无 console.error

### Stage 7 — Gallery / 移动端 / 可访问性收口（B9）
- [x] C7.1 应用名（含中文长名）不截断；卡片可点开 `/apps/{name}/v{n}/`
- [x] C7.2 移动端侧边栏开合、触控目标 ≥44px、安全区适配
- [x] C7.3 无对比度/触控目标失败（以 `web-design-guidelines` 为参考线）

### Stage 8 — 端到端黄金路径 + 远程自迭代闭环
- [ ] C8.1 黄金路径脚本：匿名 Gallery → OAuth → Setup → Workspace → 三场景 triage → 建 Issue → 状态轮询，全绿
- [ ] C8.2 远程演练：发一条引用本 backlog 的 `platform` Issue，CI 上 StepFun agent 完成一个 criteria 并产出 draft PR，verifier PASS
- [ ] C8.3 本文件「需人工协助的实时验证清单」（第 7 节）全部勾选

---

## 4. 单轮迭代协议（内联，CI `--bare` 可直接遵循）

> 远程 GitHub Action Agent / 本地 agent **每轮**严格按此执行，不依赖任何本地 skill。

1. **读** `goal.md` 第 3 节，找到第一个未勾选 `[ ]` 的 criteria（按 Stage 顺序）。同时读触发 Issue 正文作为本轮权威补充规格。
2. **核查代码现实**：用 Read 确认相关文件当前内容，不信任记忆。
3. **最小实现**：只改实现该 criteria 必需的代码，不顺手重构、不扩大范围。
4. **安全自检**（强制）：运行第 6 节安全扫描命令；发现 token/secret/XSS/owner 门控破坏立即修复。
5. **验证**：`npm run typecheck` && `npm run build`（0 error/0 warning）&& `bash scripts/verify/main-pipeline.sh`（末行 PASS）。
6. **提交**：`git add -A && git commit`；在 Issue/PR 输出自检报告（改了哪些文件、verifier 结果、勾选了哪个 criteria）。
7. **收口**：把对应 `[ ]` 改成 `[x]`（提交进 `goal.md`），结束本轮。若被阻塞超过 3 次尝试，输出错误详情与已尝试方案后停止。

**禁止**：在一轮里改多个 criteria；声称完成却无 fresh verifier 输出；在认证/路由/配置/CI/git 代码里顺手改无关逻辑（先做变更影响分析）。

### 持续迭代触发提示词（自治，无人工审核，agent team 评测为门）

> 把下面整段作为 Claude Code 原生 `/goal` 的输入（StepFun 模型驱动，本地 cc-switch 或 CI 均可）。
> 它**全自治**：不等人工审核，由 subagent 评测团（`mvp-verifier` + `ux-lead-auditor`）作为质量门，
> 自动逐项推进，直到 goal.md 全部 `[x]` 且 `GOLDEN: PASS`。

```text
/goal 自治执行 goal.md，禁止等待人工审核——评测由 subagent 团队负责。每轮循环：

1. 读 goal.md 第 3 节，选第一个未勾选 [ ] 的验收项作为本轮唯一目标；读触发 Issue 作补充规格。
2. 读相关文件确认代码现实（不信任记忆）；不懂的 API/最佳实践用 WebSearch/WebFetch 查证。
3. 最小实现该项（只改必需代码，不顺手重构，不同时做多项）。
4. 安全自检：rg 扫描无明文密钥；不破坏 CI owner 门控；DOMPurify 白名单无 on*。
5. 自验：
   - `RUN_BUILD=1 bash scripts/verify/main-pipeline.sh` 必须 MAIN_PIPELINE: PASS（回归守卫，绝不能变红）
   - 起 dev server，`BASE_URL=http://localhost:5173 node scripts/verify/e2e-golden.mjs`，让本项对应的 G* 转 GREEN
6. agent team 评测（替代人工审核）：
   - dispatch subagent `mvp-verifier` 做功能端到端验证（真实浏览器/Playwright + 构建脚本，只验不修）
   - 每完成一个 Stage（或涉及 UI 的项）dispatch subagent `ux-lead-auditor` 做 UX 评分
   - 若任一 subagent 报 FAIL/低分 → 在本轮内修复并重验，直到全部 PASS，不得带病勾选
7. 把该 [ ] 改成 [x]，`git add -A && git commit`（commit message 注明验收项 + verifier/subagent 结论）。

循环条件：goal.md 仍有未勾选项，或 e2e-golden 输出 GOLDEN: FAIL，或任一 subagent 评测未过。
终止条件：goal.md 全部 [x] 且 GOLDEN: PASS 且 mvp-verifier/ux-lead-auditor 均 PASS → 输出终态报告后停止。
异常：同一项连续 3 轮过不了 → 输出根因+已尝试方案，跳过该项继续后续项（不停摆、不等人工），最后在终态报告汇总跳过项。
每轮输出：选了哪项 / 改了哪些文件 / 各 verifier 与 subagent 结论 / 勾选状态。
```

**线上自治（脱离本地，StepFun agent 在 CI 跑同一协议）：** owner 用 `gh` 发平台 Issue 并 `/create`，
CI 按 `worker/prompt-platform.txt` 的「goal.md backlog 驱动」执行单轮；评测交给 `golden-path.yml`（真实 Chromium）：

```bash
gh issue create --repo zenHeart/mitosis --label platform \
  --title "platform: 按 goal.md 自治持续优化 MVP 体验" \
  --body "按 goal.md backlog 自治迭代：每轮挑第一个未完成验收项，实现并通过 verifier+golden-path，无需人工审核，continue 到全绿。"
gh issue comment <issue#> --repo zenHeart/mitosis --body "/create"
gh workflow run golden-path.yml -f base_url=https://mitosis.zenheart.site   # 远程真实浏览器评测
gh run watch                                                                # 跟踪
```

---

## 5. 范围

### 允许修改
- `src/` — 组件、store、composable、类型
- `scripts/verify/` — 新建，CI-runnable 验证脚本
- `worker/prompt-platform.txt` — 远程 agent 指令（指向本 backlog）
- `.github/workflows/mitosis.yml` — 平台 verify 步骤追加脚本调用（不动 owner 门控逻辑）
- `docs/` — 技术文档同步
- `worker/src/` — 仅当 Stage 2 选择 Worker 代理（post-MVP，默认不动）

### 禁止修改
- `.claude/settings.local.json`、`.env*`、任何真实 token/key/secret
- CI owner 门控核心逻辑（`comment.user.login === REPO_OWNER`）—— 安全边界
- 与当前 criteria 无关的功能
- 平台主站 `base: '/'` / 生成应用 `base: './'` 约定

---

## 6. 验证命令（CI-runnable，脱离本地 `.claude`）

```bash
# 基线
npm run typecheck
npm run build

# 回归守卫（必须永远 PASS，禁止变红）
RUN_BUILD=1 bash scripts/verify/main-pipeline.sh   # 末行 MAIN_PIPELINE: PASS

# 黄金指标跟踪（真实 Chromium，本地 mock 登录态）—— 随 Stage 由 RED 转 GREEN
npm run dev &                                       # 或 npx vite preview --port 4173
BASE_URL=http://localhost:5173 node scripts/verify/e2e-golden.mjs

# 真实登录态 / 线上验证（需外网 + 真实 token；在本机或 CI runner 跑，非本沙箱）
BASE_URL=https://mitosis.zenheart.site REAL_TOKEN=<gh_token> REAL_LOGIN=zenHeart \
  node scripts/verify/e2e-golden.mjs               # 截图存 /tmp/shot-*.png

# CI 远程黄金路径（在 GitHub runner 上跑真实 Chromium 对线上验证）
gh workflow run golden-path.yml -f base_url=https://mitosis.zenheart.site

# 安全扫描（无明文密钥）
rg -i "(ghp_|gho_|github_pat_|sk-|AKIA|AIza|eyJ)" \
  --type-add 'code:*.{ts,js,vue,json,yml,yaml,sh}' -g '!*.md' \
  src/ apps/ worker/ .github/ scripts/ || echo "SECURITY_SCAN: PASS"

# token 不入明文 localStorage（B3 不变量）
! rg -n "localStorage\.setItem\(['\"]mitosis_step_token" src/ \
  || echo "FAIL: step token in localStorage"

# DOMPurify 白名单无 on* 事件
rg "ALLOWED_ATTR" src/ -A5 | grep -iE "onclick|onerror|onload" \
  && echo "FAIL: on* in whitelist" || echo "DOMPURIFY: PASS"

# CI owner 门控未被破坏
rg -q "ACTOR.*REPO_OWNER|comment.user.login.*owner" .github/workflows/mitosis.yml \
  && echo "CI_OWNER_GATE: PASS" || echo "FAIL: owner gate missing"
```

---

## 7. 需人工协助的实时验证清单（chrome / 浏览器，Owner 协助）

> 本沙箱无法连浏览器/MCP，也无法完成 GitHub OAuth。以下需 Owner 在真实浏览器执行后回填结果。

- [ ] V1 匿名访问 `https://mitosis.zenheart.site` → Gallery 加载，能打开 `apps/tetris-game/v*/` 与 `apps/snake-game/v*/`
- [ ] V2 GitHub OAuth 登录成功，按仓库归属进入 Setup / Workspace
- [ ] V3 Workspace 发「优化 Mitosis 性能」→ 不报原始英文错误；若 LLM 配额耗尽 → 出现可操作恢复出口（截图根因复现 & 已修）
- [ ] V4 发「做一个 todo 应用」→ 直接建 app Issue（不依赖 LLM）
- [ ] V5 发「优化 mitosis 支持发送渲染图片」→ 不死胡同（建 platform Issue 或明确澄清）
- [ ] V6 ChatInput 选择/粘贴一张图片 → 预览正常，进入构建上下文或优雅降级
- [ ] V7 刷新页面 → 构建进度/会话消息不丢、不串
- [ ] V8 移动端（≤640px）→ 侧边栏开合正常，触控目标够大，无横向溢出
- [ ] V9 远程：发一条 `platform` Issue 触发 CI → StepFun agent 跑通 → 产出 draft PR → verifier PASS

---

## 8. 风险

- P0：修改 `mitosis.yml` 误伤 owner 门控或 StepFun 凭据注入 → 必须保留 `ANTHROPIC_BASE_URL`/`STEP_TOKEN` 注入与 owner 验证。
- P0：Token 安全改动若改 OAuth/路由 → 先做变更影响分析（见 `.claude/rules/change-impact-analysis.md`）。
- P1：远程 StepFun agent `--max-turns 80 / --max-budget-usd 5` 预算下单轮难完成大 criteria → 拆细 criteria，保持每项可在一轮内完成。
- P1：图片进 Issue body 可能超 GitHub 体积/渲染限制 → 优雅降级为文字描述。
- P1：Stage 0 未就绪前远程 agent 无法自验 → Stage 0 必须最先完成。
