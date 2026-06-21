# Chat Session Management Design

> **状态**: 设计中
> **日期**: 2026-06-21
> **相关 ADR**: ADR-012, ADR-013, ADR-014, ADR-015

## 为什么用 Issue 作为 Session 容器

经过对 GitHub 原生功能对比分析：

| 方案 | CI 触发 | 消息 | 标签 |  verdict |
|------|---------|------|------|--------|
| Issues + Comments | 原生 | 原生 | 原生 | **首选** |
| Discussions | 不支持 | 原生 | 不支持 | 无 CI 集成 |
| Projects v2 | 不支持 | 不支持 | 自定义 | 过度设计 |
| Gists | 不支持 | 实时编辑 | 不支持 | 无 CI 集成 |

**Issue 是唯一同时满足以下条件的方案：**
1. CI 原生触发（agent loop 必须依赖）
2. Labels 状态机（building → verifying → review → failed）
3. Comments 线程（消息持久化）
4. 完整 REST API

## 核心抽象映射

```
前端概念        →   GitHub 概念
─────────────────────────────────
ChatSession     →   Issue
ChatMessage     →   Issue Comment (user) / System (label-driven)
Session Status  →   Issue Labels
Build Trigger   →   "/create" Issue Comment
Session List    →   GET /repos/{owner}/{repo}/issues
```

## 安全模型

### /create 触发链

```
用户输入 /create
  → 前端: 检测命令 → postComment(issueNumber, "/create")
  → GitHub: issue_comment.created webhook
  → CI: 检查以下条件:
      1. comment.author === repo.owner
      2. Issue 有 app/{name} label
      3. Issue 无 status:building label (去重)
  → 全部通过 → 触发 agent loop
```

**攻击面防护：**
- 非 owner 的 `/create` → CI 直接忽略（无需审查）
- 无 `app/{name}` label 的 Issue → 提示需要 label
- 重复 `/create` → `status:building` 去重
- 恶意 markdown 在 Issue body → DOMPurify 白名单过滤

### XSS 防护

渲染 Issue comments 时使用 DOMPurify：
```typescript
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'code', 'pre',
  'ul', 'ol', 'li', 'a', 'blockquote', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6']

const ALLOWED_ATTR = ['href', 'title', 'alt', 'class', 'target', 'rel',
  'colspan', 'rowspan', 'type', 'checked']

DOMPurify.sanitize(html, {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  FORBID_TAGS: ['style', 'link', 'meta', 'script', 'iframe', 'form', 'object', 'embed'],
})
```

## 数据流时序

### 新建 Session

```
1. 用户进入 Workspace (或点击 "+ 新建对话")
2. sessionStore.createSession("新对话")
3. POST /repos/{owner}/{repo}/issues
   { title: "新对话", body: "", labels: [] }
4. 返回 Issue number → 设为 activeSession
5. 用户发送消息 → POST /issues/{n}/comments
6. 乐观更新本地 messages[]
```

### 恢复 Session

```
1. 用户登录 → authStore.init() 完成
2. sessionStore.loadSessions()
3. GET /repos/{owner}/{repo}/issues?state=open&sort=updated&direction=desc
4. 取第一个 Issue → 设为 activeSession
5. GET /issues/{n}/comments?per_page=100
6. 按 created_at 排序 → 还原 messages[]
7. 同时 polls Issue labels 获取最新状态
```

### 发送消息

```
1. 用户输入 → handleSend()
2. triage 分流
3. 分流结果:
   - chat: 直接 AI 回复 → push to messages[] (不写 GitHub)
   - build: AI 确认 BUILD_APP → 用户输入 /create → postComment("/create")
   - platform: postComment(用户消息) → 创建 Issue（如果还没有）
4. postComment 同时:
   - 乐观更新 messages[] (role: 'user')
   - 等待 GitHub 返回确认
   - 如果失败: 标记 error 状态，允许重试
```

### /create 触发

```
1. 用户在 build session 中输入 "/create"
2. 前端检测: 精确匹配 ^/create$ (首字符 /create)
3. POST /issues/{n}/comments { body: "/create" }
4. 前端显示 "🔨 已确认构建，等待 CI 启动..."
5. CI 触发 → 检测到 owner /create comment + app/{name} label
6. CI 添加 status:building label → 前端 polls 到变化 → 显示构建进度
```

## 本地调试策略

### Mock 模式（Phase 1 开发）

```bash
VITE_USE_LOCAL_MOCK=true npm run dev
```

mock 层实现：
- `useGitHubAPI.ts` 中检测 `VITE_USE_LOCAL_MOCK`
- 所有 fetch 调用路由到 `MockGitHubAPI`
- Mock 数据存储在 localStorage
- 支持: createIssue, getIssue, listIssues, getComments, postComment, addLabel, removeLabel

### 代理模式（Phase 2 集成测试）

```bash
node tools/github-proxy.js &
npm run dev
```

- 所有 `/api/github/` 请求 → localhost:5174 → api.github.com
- 使用真实 GitHub token
- 创建真实的 Issues/Comments
- 适合: 端到端流程验证

### 生产模式

- 直接访问 api.github.com
- 需要 token 有 repo 权限
- 适合: 最终用户使用

## 实现优先级

| 阶段 | 内容 | 依赖 |
|------|------|------|
| Phase 1 | 类型扩展 + API 补全 | 无 |
| Phase 2 | Session Store | Phase 1 |
| Phase 3 | Workspace 重构 | Phase 1-2 |
| Phase 4 | GFM 渲染 | 无（独立组件） |
| Phase 5 | 本地 mock | Phase 1-3 |
| Phase 6 | CI workflow | Phase 1-5 |
