# Goal: 会话管理系统 MVP（最小可行）

## 目标

实现 Issue-backed 聊天会话的最小可行版本。三个安全层是底线：
1. **CI 侧执行门控** — 仅 owner 的 `/create` comment 触发构建，非 owner 的写入可存在但 CI 静默忽略
2. **渲染拦截** — 所有消息渲染前经过 DOMPurify，防 XSS
3. **隐私脱敏** — 密码/token/secret 等敏感信息存入前替换为 `***`

其余功能（历史恢复、Mock 模式）按最简实现。

## 串行验证流程

```
Stage 1: 类型 + API 基础
  ─────────────────────────────────────────────────────
  - C1: IssueComment + ChatSession 类型定义
  - C2: listUserIssues / getIssueComments / createIssueComment
  - C3: fetchWithTimeout 超时保护
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 2: 存储层 + Mock 模式
  ─────────────────────────────────────────────────────
  - C4: session store（Issues → sessions 映射）
  - C5: Mock 模式（localStorage 模拟，可独立运行）
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 3: /create 触发 + CI 安全门控
  ─────────────────────────────────────────────────────
  - C6: 创建 Issue 不触发 agent loop（仅初始化会话）
  - C7: /create comment 触发 agent loop
  - C8: CI 侧 owner 验证（comment.user === repo owner，唯一安全边界）
  - C9: CI 仅监听 issue_comment，不监听 issues opened/closed 等事件
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 4: 渲染拦截（安全 P0）
  ─────────────────────────────────────────────────────
  - C10: 所有消息渲染前经过 DOMPurify sanitize
  - C11: ALLOWED_TAGS/ALLOWED_ATTR 白名单
  - C12: a 标签强制 target="_blank" + rel="noopener noreferrer"
  - C13: on* 事件属性被移除
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 5: 隐私脱敏（安全 P0）
  ─────────────────────────────────────────────────────
  - C14: 存储前检测敏感字段（password/passwd/pwd/secret/token/api_key）
  - C15: 匹配值替换为 `***`，正则: (password|passwd|pwd|secret|token|api_key)\s*[:=]\s*.+
  - C16: 日志中敏感字段显示 `***`
  ─────────────────────────────────────────────────────
                          │
                          ▼  PASS
Stage 6: 端到端集成
  ─────────────────────────────────────────────────────
  - C17: Mock 模式完整流程：创建 session → 发消息 → 渲染 → 脱敏验证
  - C18: /create 在 Mock 模式下可触发（owner 通过，非 owner 静默忽略）
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

### 禁止修改
- `.claude/settings.local.json`
- 真实 token、key、secret
- 与当前目标无关的功能

## 验收标准

### Stage 1: 类型 + API

#### C1: 类型定义
- [ ] `src/types/app.ts` 定义 `IssueComment`（id, body, user, createdAt）
- [ ] `src/types/app.ts` 定义 `ChatSession`（issueNumber, title, status, labels, messageCount）
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

#### C5: Mock 模式
- [ ] `useMockGitHub` composable 存在
- [ ] localStorage 存储 sessions + messages
- [ ] `VITE_USE_MOCK_GITHUB=true` 切换

### Stage 3: /create 触发 + CI 安全门控（P0 安全）

#### C6: 创建 Issue 不自动触发
- [ ] 新建 session（createIssue）不触发 agent loop
- [ ] Issue 创建仅用于会话初始化

#### C7: /create comment 触发
- [ ] 检测评论中的 `/create` 命令
- [ ] `/create <描述>` → 触发构建流程

#### C8: CI 侧 Owner 门控（唯一安全边界）
- [ ] `mitosis.yml` 监听 `issue_comment` 事件
- [ ] CI 检查 `event.comment.user.login` === `GITHUB_REPOSITORY_OWNER`
- [ ] 非 owner 的 `/create` comment → CI 静默跳过，不触发构建
- [ ] 任何人可以在公开 Issue 评论，但只有 owner 的 `/create` 被 CI 执行

#### C9: CI 仅响应 issue_comment，不响应 issues 事件
- [ ] CI workflow 监听 `issue_comment` 事件（用户评论）
- [ ] CI 不监听 `issues` 事件（opened/closed/reopened 等）
- [ ] Issue opened 事件不触发任何构建流程

### Stage 4: 渲染拦截（P0 安全）

#### C10: DOMPurify 渲染管道
- [ ] `dompurify` 依赖存在
- [ ] 所有消息渲染前调用 `sanitize()`
- [ ] 包括：用户消息、assistant 消息、Issue body、Comment body

#### C11: 白名单配置
- [ ] ALLOWED_TAGS: p, br, code, pre, table, tr, td, th, ul, ol, li, strong, em, a, span, del, h1-h6, blockquote
- [ ] ALLOWED_ATTR: href, target, rel, class, id
- [ ] a 标签强制 `rel="noopener noreferrer"` + `target="_blank"`

#### C12: 事件属性移除
- [ ] `on*` 事件属性被剥离（onclick, onerror, onload 等）

#### C13: 渲染拦截覆盖所有入口
- [ ] 聊天消息渲染经过管道
- [ ] 历史消息加载渲染经过管道
- [ ] Mock 模式消息渲染经过管道

### Stage 5: 隐私脱敏（P0 安全）

#### C14: 存储前脱敏
- [ ] 检测敏感字段：password, passwd, pwd, secret, token, api_key
- [ ] 正则匹配值替换为 `***`
- [ ] 脱敏在 `createIssueComment` 调用前执行
- [ ] 脱敏在 Mock 模式存储前执行

#### C15: 日志脱敏
- [ ] 日志输出中敏感字段显示 `***`
- [ ] 错误信息不包含原始值

#### C16: 脱敏覆盖
- [ ] 用户消息内容脱敏
- [ ] Issue title 脱敏
- [ ] 仅本地 debug 模式可查看原始值

### Stage 6: 端到端集成

#### C17: Mock 模式完整流程
- [ ] 创建 session → 发送消息 → 消息渲染 → 脱敏验证
- [ ] 消息在 localStorage 中正确存储和读取

#### C18: /create Mock 触发
- [ ] `/create` 在 Mock 模式下触发本地构建流程
- [ ] 非 owner 的 `/create` 在 Mock 模式下不触发 agent loop（静默忽略）

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
