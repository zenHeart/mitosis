---
name: chat-session-architecture
description: "Issue-backed chat sessions: one GitHub Issue = one session, comments = messages, /create = build trigger, GFM rendering with DOMPurify"
metadata: 
  node_type: memory
  type: project
  originSessionId: 04959b8e-b4aa-43d0-8790-1f13691d15c1
---

## Chat Session Architecture Decisions (2026-06-21)

### Core Mapping
- **ChatSession** ↔ **GitHub Issue**
- **ChatMessage** ↔ **Issue Comment** (user) / **Label-driven state** (system)
- **Build Trigger** ↔ `/create` comment (owner only)
- **Session List** ↔ `GET /repos/{owner}/{repo}/issues?state=open`

### Why Issue (not Discussions/Projects/Gists)
- Only solution with native CI trigger + labels + comments + full API
- Discussions: no CI trigger
- Projects: overkill, no CI
- Gists: no CI, no labels

### /create Security Gate
```
issue_comment.created → check: /create in body
  → check: author === repo.owner
  → check: has app/{name} label
  → check: no status:building label (dedup)
  → trigger agent loop
```

### History Recovery
1. `listUserIssues(open)` sorted by `updated_at` desc
2. Take first Issue → `getIssueComments()` → sort by `created_at` → restore messages[]

### Local Debug Strategy
1. **Mock mode**: `VITE_USE_LOCAL_MOCK=true` → localStorage-backed GitHub API simulation
2. **Proxy mode**: `node agent/github-proxy.js` → real GitHub API via localhost:5174
3. **Production**: direct api.github.com access

### GFM Rendering
- `marked` + `DOMPurify` with whitelist tags/attrs
- Forbidden: `<script>`, `<iframe>`, `<form>`, `javascript:` URLs

### Related
- `docs/architecture.md` — 会话管理架构章节
- `prd/chat-session-design.md` — 详细设计文档
- `docs/decisions.md` — ADR-012 ~ ADR-015
