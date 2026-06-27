# Goal: 会话管理系统 MVP — 三场景 + 生命周期命令 + 自举闭环

## 目标

实现 Issue-backed 聊天会话的最小可行版本，支持三个核心场景、会话生命周期命令，以及通过 mitosis.zenheart.site 完成自举闭环。

**三场景定义：**

| 场景 | 入口 | CI 路径 | Label |
|------|------|---------|-------|
| A: 迭代 Mitosis 平台 | triage 检测到 platform 关键词 | platform branch → repo root | `platform` |
| B: 创建新应用 | "做一个/创建/建一个" + 应用类型 | `apps/{name}/v0/` | `app/{name}` |
| C: 迭代已有应用 | "在 X 的基础上/继续迭代 X" | `apps/{name}/v1/` (基于 latest) | `app/{name}`, `update` |

**会话生命周期命令：**
- `/status` — 查询当前 agent 执行状态
- `/stop` — 停止当前构建任务
- `/start [描述]` — 重新触发构建

**自举闭环：** 用户通过 mitosis.zenheart.site 输入需求 → CI 构建 → 部署 → 新版本在 Gallery 可见 → 用户继续迭代。

## 串行验证流程

```
Stage 1: 类型 + API 基础
  ─────────────────────────────────────────────────────
  - C1: IssueComment + ChatSession 类型定义（含 scenario 字段）
  - C2: listUserIssues / getIssueComments / createIssueComment
  - C3: fetchWithTimeout 超时保护
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 2: 存储层 + Mock 模式
  ─────────────────────────────────────────────────────
  - C4: session store（Issues → sessions 映射，含 scenario）
  - C5: Mock 模式（localStorage 模拟，可独立运行）
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 3: /create 触发 + 三场景分流 + CI 安全门控
  ─────────────────────────────────────────────────────
  - C6: 创建 Issue 不触发 agent loop（仅初始化会话）
  - C7: /create comment 触发 agent loop
  - C8: triageMessage 返回 scenario 字段（platform / app_create / app_iterate）
  - C9: createBuild 按场景设置 label
  - C10: CI 侧 owner 验证（comment.user === repo owner，唯一安全边界）
  - C11: CI 仅监听 issue_comment，不监听 issues opened/closed 等事件
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 4: 会话生命周期命令
  ─────────────────────────────────────────────────────
  - C12: /status 返回当前 agent 状态
  - C13: /stop 停止构建（关闭 Issue + 添加 cancelled label）
  - C14: /start 重新触发构建
  - C15: 命令在 Mock 模式下可测试
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 5: 渲染拦截（安全 P0）
  ─────────────────────────────────────────────────────
  - C16: 所有消息渲染前经过 DOMPurify sanitize
  - C17: ALLOWED_TAGS/ALLOWED_ATTR 白名单
  - C18: a 标签强制 target="_blank" + rel="noopener noreferrer"
  - C19: on* 事件属性被移除
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 6: 隐私脱敏（安全 P0）
  ─────────────────────────────────────────────────────
  - C20: 存储前检测敏感字段（password/passwd/pwd/secret/token/api_key）
  - C21: 匹配值替换为 `***`
  - C22: 日志中敏感字段显示 `***`
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 7: CI 平台构建支持
  ─────────────────────────────────────────────────────
  - C23: mitosis.yml parse step 检测 platform label
  - C24: 平台构建在 repo root 执行，不进 apps/ 子目录
  - C25: 平台构建使用 worker/prompt-platform.txt prompt
  - C26: 平台构建 verifier 运行 npm run build + npm run typecheck
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 8: 端到端集成 + 自举闭环
  ─────────────────────────────────────────────────────
  - C27: Mock 模式完整流程：创建 session → 发消息 → 渲染 → 脱敏验证
  - C28: 三场景分流在 Mock 模式下正确
  - C29: 生命周期命令在 Mock 模式下正确
  - C30: /create 在 Mock 模式下可触发
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
```

## 使用方式

```bash
/goal "会话管理系统 MVP 全部验收标准通过"
```

**协议：** `.claude/skills/setgoal/SKILL.md`
**Verifier：** `.claude/skills/setgoal/verifiers/`

## 范围

### 允许修改
- `src/` — stores, components, composables, types
- `docs/` — 技术文档
- `.claude/skills/setgoal/` — verifiers
- `.github/workflows/mitosis.yml` — CI 扩展
- `worker/prompt.txt` — 自举能力声明
- `worker/prompt-platform.txt` — 新建，平台构建 prompt

### 禁止修改
- `.claude/settings.local.json`
- 真实 token、key、secret
- 与当前目标无关的功能

## 验收标准

### Stage 1: 类型 + API

#### C1: 类型定义
- [ ] `src/types/app.ts` 定义 `IssueComment`（id, body, user, createdAt）
- [ ] `src/types/app.ts` 定义 `ChatSession`（issueNumber, title, status, labels, messageCount, scenario）
- [ ] `scenario` 类型：`'platform' | 'app_create' | 'app_iterate'`
- [ ] TypeScript 编译通过

#### C2: GitHub API 扩展
- [ ] `listUserIssues` — 列出用户 Issues（label 过滤 `session/chat`）
- [ ] `getIssueComments` — 获取 Issue 评论
- [ ] `createIssueComment` — 创建 Issue 评论

#### C3: fetchWithTimeout
- [ ] `fetchWithTimeout` 存在，默认 15s
- [ ] 所有 GitHub API 调用使用 timeout

### Stage 2: 存储层 + Mock

#### C4: Session Store
- [ ] `src/stores/session.ts`（Pinia store）
- [ ] Issues → sessions 映射
- [ ] 活跃 session 状态管理
- [ ] `scenario` 字段从 Issue labels 提取并映射

#### C5: Mock 模式
- [ ] `useMockGitHub` composable 存在
- [ ] localStorage 存储 sessions + messages
- [ ] `VITE_USE_MOCK_GITHUB=true` 切换

### Stage 3: /create 触发 + 三场景分流 + CI 安全门控

#### C6: 创建 Issue 不自动触发
- [ ] 新建 session（createIssue）不触发 agent loop
- [ ] Issue 创建仅用于会话初始化

#### C7: /create comment 触发
- [ ] 检测评论中的 `/create` 命令
- [ ] `/create <描述>` → 触发构建流程

#### C8: triageMessage 返回 scenario
- [ ] 平台关键词（"优化 Mitosis"、"修改平台"）→ `scenario: 'platform'`
- [ ] 创建新应用关键词（"做一个"、"创建"）+ 无 `basedOn` → `scenario: 'app_create'`
- [ ] 迭代已有应用关键词（"在 X 基础上"、"继续迭代 X"）+ `basedOn` → `scenario: 'app_iterate'`

#### C9: createBuild 按场景设 label
- [ ] `platform` → labels: [`platform`]
- [ ] `app_create` → labels: [`app/{name}`]
- [ ] `app_iterate` → labels: [`app/{name}`, `update`]

#### C10: CI 侧 Owner 门控（唯一安全边界）
- [ ] `mitosis.yml` 监听 `issue_comment` 事件
- [ ] CI 检查 `event.comment.user.login` === `GITHUB_REPOSITORY_OWNER`
- [ ] 非 owner 的 `/create` comment → CI 静默跳过，不触发构建

#### C11: CI 仅响应 issue_comment
- [ ] CI workflow 监听 `issue_comment` 事件
- [ ] CI 不监听 `issues` 事件（opened/closed/reopened 等）

### Stage 4: 会话生命周期命令

#### C12: /status 命令
- [ ] 检测 `/status` 命令（正则：`^/status\s*$`）
- [ ] 返回当前 agent 执行状态
- [ ] 状态映射：`status:building` → "🔨 构建中..."，`status:verifying` → "🔎 验证中..."，`status:review` → "✅ 等待人工审查"，`status:failed` → "❌ 构建失败"，`owner-approved` 无 status → "⏳ 已批准，等待触发"，其他 → "💤 空闲"
- [ ] 检查 activeIssue 实时状态

#### C13: /stop 命令
- [ ] 检测 `/stop` 命令（正则：`^/stop\s*$`）
- [ ] 添加 `status:cancelled` label
- [ ] 关闭 Issue（state: closed）
- [ ] 发送系统消息确认

#### C14: /start 命令
- [ ] 检测 `/start [描述]` 命令（正则：`^/start\s*(.*)$`）
- [ ] 重新打开 Issue
- [ ] 发送 `/create` comment（触发 CI 重新构建）
- [ ] 显示确认消息

#### C15: 命令 Mock 测试
- [ ] Mock 模式下 `/status` 返回模拟状态
- [ ] Mock 模式下 `/stop` 关闭 Issue + 添加 cancelled label
- [ ] Mock 模式下 `/start` 重新触发构建

### Stage 5: 渲染拦截（安全 P0）

#### C16: DOMPurify 渲染管道
- [ ] `dompurify` 依赖存在
- [ ] 所有消息渲染前调用 `sanitize()`
- [ ] 包括：用户消息、assistant 消息、Issue body、Comment body

#### C17: 白名单配置
- [ ] ALLOWED_TAGS: p, br, code, pre, table, tr, td, th, ul, ol, li, strong, em, a, span, del, h1-h6, blockquote
- [ ] ALLOWED_ATTR: href, target, rel, class, id
- [ ] a 标签强制 `rel="noopener noreferrer"` + `target="_blank"`

#### C18: 事件属性移除
- [ ] `on*` 事件属性被剥离（onclick, onerror, onload 等）

#### C19: 渲染拦截覆盖所有入口
- [ ] 聊天消息渲染经过管道
- [ ] 历史消息加载渲染经过管道
- [ ] Mock 模式消息渲染经过管道

### Stage 6: 隐私脱敏（安全 P0）

#### C20: 存储前脱敏
- [ ] 检测敏感字段：password, passwd, pwd, secret, token, api_key
- [ ] 正则匹配值替换为 `***`
- [ ] 脱敏在 `createIssueComment` 调用前执行
- [ ] 脱敏在 Mock 模式存储前执行

#### C21: 日志脱敏
- [ ] 日志输出中敏感字段显示 `***`
- [ ] 错误信息不包含原始值

#### C22: 脱敏覆盖
- [ ] 用户消息内容脱敏
- [ ] Issue title 脱敏
- [ ] 仅本地 debug 模式可查看原始值

### Stage 7: CI 平台构建支持

#### C23: mitosis.yml parse step 检测 platform label
- [ ] parse step 检查是否有 `platform` label
- [ ] 设置 `is_platform=true` + `app_name=platform` + `version=root`

#### C24: 平台构建在 repo root 执行
- [ ] 不进 `apps/` 子目录
- [ ] agent loop 在 repo root 执行
- [ ] verifier 在 repo root 运行 `npm run build` + `npm run typecheck`

#### C25: 平台构建 prompt
- [ ] 使用 `worker/prompt-platform.txt` prompt 模板
- [ ] prompt 包含自举能力声明（可修改 src/, docs/, .github/, worker/, .claude/）

#### C26: 平台构建 commit
- [ ] `git add .`（不限制在 apps/ 目录）
- [ ] 平台 PR 标题包含 `[platform]` 前缀

### Stage 8: 端到端集成 + 自举闭环

#### C27: Mock 模式完整流程
- [ ] 创建 session → 发送消息 → 消息渲染 → 脱敏验证
- [ ] 消息在 localStorage 中正确存储和读取

#### C28: 三场景分流
- [ ] Mock 模式: "优化 Mitosis 性能" → scenario='platform'
- [ ] Mock 模式: "做一个俄罗斯方块" → scenario='app_create'
- [ ] Mock 模式: "在 tetris-game 基础上加关卡" → scenario='app_iterate'
- [ ] 创建 Issue 时 label 按场景设置

#### C29: 生命周期命令
- [ ] Mock 模式: `/status` 返回正确的状态信息
- [ ] Mock 模式: `/stop` 关闭 Issue + 添加 cancelled label
- [ ] Mock 模式: `/start` 重新触发构建

#### C30: /create Mock 触发
- [ ] `/create` 在 Mock 模式下触发本地构建流程

## 黄金路径验证（MVP Verifier）

```bash
# 三场景 + 生命周期命令端到端
bash .claude/skills/setgoal/verifiers/golden-paths.sh
```

## 自举闭环检查清单

```
自举闭环验证：
- [ ] 用户访问 https://mitosis.zenheart.site → Gallery 页面加载
- [ ] 匿名用户可打开已有应用（apps/tetris-game/v2/）
- [ ] GitHub OAuth 登录 → 判断 repo 归属
- [ ] Owner 进入 Workspace → 侧边栏显示已有会话
- [ ] Owner 输入"优化 Mitosis 性能" → triage 路由到 platform → 创建 platform Issue
- [ ] Owner 输入"做一个 TODO 应用" → triage 路由到 app_create → 创建 app Issue
- [ ] Owner 输入"在 tetris-game 基础上加关卡" → triage 路由到 app_iterate → 创建 update Issue
- [ ] /status 显示当前构建状态
- [ ] /stop 停止构建
- [ ] CI 构建 → verifier → PR → 合入 → 部署
- [ ] 新版本在 Gallery 中可见
```

## 验证命令

```bash
# 类型 + API
bash .claude/skills/setgoal/verifiers/types-and-api.sh

# 会话存储 + Mock
bash .claude/skills/setgoal/verifiers/session-restore.sh

# /create 触发 + CI 安全门控
bash .claude/skills/setgoal/verifiers/create-trigger.sh

# 渲染拦截（DOMPurify XSS）
bash .claude/skills/setgoal/verifiers/gfm-render.sh

# 隐私脱敏
bash .claude/skills/setgoal/verifiers/security-mask.sh

# 黄金路径（三场景 + 生命周期命令）
bash .claude/skills/setgoal/verifiers/golden-paths.sh

# 构建
npm run build
npm run typecheck

# 安全扫描
rg "(ghp_|gho_|github_pat_|sk-|AKIA|AIza|eyJ)" \
  --type-add 'code:*.{ts,js,vue,json,yml,yaml,sh,env}' \
  -g '!*.md' \
  src/ apps/ worker/ .github/ || echo "SECURITY_SCAN: PASS"
```

## 风险

- P0: 非 owner 通过 `/create` 触发写权限构建
- P0: 敏感信息（密码/token）明文存入 GitHub Issue
- P0: XSS 注入通过消息渲染执行
- P1: Mock 模式与真实 API 行为不一致
- P1: 历史恢复超时（大 session 评论多）
- P1: 平台构建路径与 app 构建路径冲突
