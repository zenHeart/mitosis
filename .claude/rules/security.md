# Security Rules — 铁律

## 核心原则

1. **Public repo 无法阻止外部评论** — GitHub 不提供此能力，安全边界必须在 CI 侧
2. **前端拦截 = UX，不是安全** — 唯一真正的安全边界是 CI 侧 owner 验证
3. **GitHub Issues 是公开的** — 任何存入 Issue 的数据（body、comments）都视为公开
4. **Static hosting 无服务器** — 所有代码和 token 对用户可见，不能存储敏感信息
5. **AI 读取 Issue 内容作为 prompt** — Issue 内容是攻击面，必须当作不可信输入

---

## 禁止清单（Do NOT）

| # | 禁止 | 原因 |
|---|------|------|
| S1 | 在 Issue body/comment 中存储密码、token、secret | Issues 是公开的 |
| S2 | 在 localStorage 中存储未加密的 GitHub token | XSS 可窃取 |
| S3 | 在客户端代码中引用 `VITE_*` 以外的 env var | Vite 暴露所有 `VITE_*` 到浏览器 |
| S4 | 前端做 owner 验证作为安全边界 | public repo 无法阻止评论 |
| S5 | 渲染 Issue 内容前不经过 DOMPurify | XSS 攻击面 |
| S6 | CI workflow 不验证 `comment.user.login === owner` | 任何人都可发 `/create` |
| S7 | 在 CI 日志中打印 secrets/tokens | GitHub Actions 日志公开 |
| S8 | 使用 `innerHTML` 直接渲染用户内容 | XSS 向量 |
| S9 | 信任 Issue title/body 中的任何 HTML/JS | 攻击者可注入恶意内容 |
| S10 | 在 prompt 中直接拼接 Issue 内容 | Prompt 注入攻击 |

---

## 强制清单（MUST）

| # | 强制 | 实现 |
|---|------|------|
| M1 | 所有 GitHub API 调用使用 `fetchWithTimeout` | 默认 15s |
| M2 | 所有 HTML 渲染前经过 DOMPurify `sanitize()` | 白名单模式 |
| M3 | DOMPurify 配置 `ALLOWED_TAGS` + `ALLOWED_ATTR` | 不允许 on* 事件 |
| M4 | 存储前对敏感字段脱敏 | `password/token/secret/api_key → ***` |
| M5 | CI 验证 `comment.user.login === GITHUB_REPOSITORY_OWNER` | 执行 `/create` 前 |
| M6 | CI 仅响应 `issue_comment` 事件 | Issue opened 不触发 |
| M7 | OAuth 使用 `state` 参数防 CSRF | 随机字符串 |
| M8 | Mock 模式也执行脱敏逻辑 | 与生产一致 |
| M9 | 日志中敏感字段显示 `***` | 不打印原始值 |
| M10 | a 标签强制 `target="_blank" rel="noopener noreferrer"` | 防止钓鱼 |

---

## 威胁模型（已知攻击面）

```
攻击面 1: 公开 Issue 评论注入
  ├─ 攻击者: 在 Issue 中发布包含恶意 HTML/JS 的评论
  ├─ 影响: XSS，窃取 token，篡改 UI
  └─ 缓解: DOMPurify (M2, M3) + 白名单

攻击面 2: 非 Owner /create 触发构建
  ├─ 攻击者: 在公开 Issue 中评论 "/create malicious"
  ├─ 影响: 滥用 CI 资源，恶意代码执行
  └─ 缓解: CI owner 验证 (M5, M6)

攻击面 3: 敏感信息泄露
  ├─ 攻击者: 诱导 AI/用户输出密码、token
  ├─ 影响: 密钥泄露，账户被接管
  └─ 缓解: 脱敏 (M4, M9) + 不存储 token (S2)

攻击面 4: OAuth 劫持
  ├─ 攻击者: CSRF 或 authorization code 拦截
  ├─ 影响: 账户被接管
  └─ 缓解: state 参数 (M7) + redirect_uri 验证

攻击面 5: Prompt 注入
  ├─ 攻击者: 在 Issue 内容中嵌入隐藏指令
  ├─ 影响: AI 执行非预期操作
  └─ 缓解: 不信任 Issue 内容 + 沙箱执行

攻击面 6: 依赖供应链攻击
  ├─ 攻击者: 发布恶意 npm 包
  ├─ 影响: 代码执行，数据泄露
  └─ 缓解: lockfile 严格版本 + CI 扫描
```

---

## 安全 Checklist（每轮 setgoal 必须检查）

### 代码修改前
- [ ] 修改是否涉及 auth/路由/配置/CI/git？（如果是 → 变更影响分析）
- [ ] 是否读取/存储 GitHub token？（如果是 → 检查 M2, M3, M5）
- [ ] 是否渲染用户输入？（如果是 → 检查 M2, M3, M10）
- [ ] 是否存储 Issue 内容？（如果是 → 检查 M4, M8, M9）
- [ ] 是否修改 CI workflow？（如果是 → 检查 M5, M6）

### 代码修改后
- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] 安全扫描（rg 检查 token/secret 泄露）
- [ ] 运行对应 verifier（create-trigger.sh / gfm-render.sh / security-mask.sh）

### 每次提交前
- [ ] 无真实 token/key/secret 在代码中
- [ ] 无 `VITE_*` 以外 env var 被引用
- [ ] 无 `innerHTML` 或 `dangerouslySetInnerHTML`
- [ ] 无未加密敏感数据存储路径

---

## 回退方案

安全相关变更出问题时的快速回退：
```bash
# 1. 查看最近的安全相关提交
git log --oneline --grep="security\|auth\|sanitize\|mask\|CI"

# 2. 回退到上一个安全验证通过的 commit
git revert <commit>

# 3. 或者使用 git worktree 在隔离环境修复
git worktree add .claude/worktrees/security-fix <commit>^
```

---

## 相关记忆

- [[auth-exchange-must-be-in-store-init]]
- [[gallery-api-timeout-protection]]
- [[ci-env-vars-not-passed-by-default]]
- [[oauth-redirect-loop-github-pages]]
- [[chat-session-architecture]]
