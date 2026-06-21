---
name: security-audit
description: |
  安全审计技能。当 setgoal 每轮执行时，必须在完成代码修改后调用此技能进行快速安全扫描。
  扫描内容：敏感数据泄露检测、DOMPurify 配置验证、CI owner 门控检查、环境变量暴露、token/secret 硬编码、XSS 向量。
  不要在代码修改前调用（此时应该先做变更影响分析）。每轮只做快速模式匹配扫描，不做深度人工审计。
  触发条件：setgoal 的 Phase C 验证阶段，或任何涉及 auth/CI/渲染/数据存储的代码修改后。
---

# Security Audit — 快速安全扫描

## 执行时机

在 setgoal 的 **Phase C（验证阶段）** 执行，或在以下情况立即执行：
- 代码修改涉及 auth、CI、渲染、数据存储、GitHub API
- 任何 `src/` 或 `.github/` 的代码变更

## 扫描步骤（5 步，每步独立）

### Step 1: 敏感数据泄露扫描

使用 `rg` (ripgrep) 扫描以下模式：

```bash
# Token 泄露检测
rg -i "(ghp_|gho_|github_pat_|sk-|AKIA|AIza|eyJ[bJ][a-zA-Z0-9_-]*\.eyJ)" --type-add 'code:*.{ts,js,vue,json,yml,yaml,sh,env}' -g '!*.md' src/ apps/ worker/ .github/ || echo "SECURE: No tokens found"

# Secret 关键词检测
rg -i "(password|passwd|pwd|secret|api_key|api_secret|private_key)\s*[:=]\s*['\"][^'\"]{4,}" src/ apps/ worker/ -g '!*.md' || echo "SECURE: No hardcoded secrets"

# 环境变量引用（检查非 VITE_ 变量）
rg "process\.env\.[A-Z_]+" src/ apps/ worker/ --type ts --type js | grep -v "VITE_" | grep -v "node_modules" || echo "SECURE: No non-VITE env vars"
```

**判定：**
- 发现 token/secret → `FAIL`，立即停止，回退修改
- 发现非 VITE_ env var → `WARN`，检查是否必要
- 全部通过 → `PASS`

### Step 2: DOMPurify 配置验证

```bash
# 检查 DOMPurify 使用
rg "DOMPurify|dompurify|sanitize" src/ --type ts --type vue

# 检查 ALLOWED_TAGS 白名单
rg "ALLOWED_TAGS" src/ --type ts --type vue

# 检查 ALLOWED_ATTR 白名单
rg "ALLOWED_ATTR" src/ --type ts --type vue

# 检查 on* 事件是否被排除
rg "ALLOWED_ATTR" src/ --type ts --type vue -A 5 | grep -i "onclick\|onerror\|onload" && echo "FAIL: on* events in whitelist" || echo "PASS: on* events excluded"
```

**判定：**
- DOMPurify 未使用 → `FAIL`（C10 要求）
- ALLOWED_TAGS/ALLOWED_ATTR 未配置 → `FAIL`（C11 要求）
- on* 事件在白名单中 → `FAIL`（C12 要求）
- 全部通过 → `PASS`

### Step 3: CI Owner 门控验证

```bash
# 检查 CI workflow 文件
if [[ -f ".github/workflows/mitosis.yml" ]]; then
  # 检查 issue_comment 事件
  rg "issue_comment" .github/workflows/mitosis.yml && echo "PASS: issue_comment event found" || echo "FAIL: issue_comment event missing"

  # 检查 owner 验证
  rg "GITHUB_REPOSITORY_OWNER|github\.actor|comment\.user" .github/workflows/mitosis.yml && echo "PASS: owner check found" || echo "FAIL: owner check missing"

  # 检查 /create 检测
  rg "/create" .github/workflows/mitosis.yml && echo "PASS: /create check found" || echo "FAIL: /create check missing"
else
  echo "FAIL: mitosis.yml not found"
fi
```

**判定：**
- 任意一项 FAIL → `FAIL`（C8 要求）
- 全部通过 → `PASS`

### Step 4: 脱敏逻辑验证

```bash
# 检查脱敏函数/工具
rg "mask|sanitize|redact|\*\*\*|replace.*password|replace.*token" src/ --type ts --type vue | grep -v "node_modules"

# 检查 Mock 模式是否使用脱敏
rg "VITE_USE_MOCK_GITHUB" src/ --type ts --type vue -A 3 | grep -i "mask\|sanitize\|\*\*\*" && echo "PASS: Mock mode uses masking" || echo "WARN: Mock mode masking not confirmed"
```

**判定：**
- 无脱敏逻辑 → `FAIL`（C14 要求）
- Mock 模式未使用脱敏 → `WARN`
- 通过 → `PASS`

### Step 5: fetchWithTimeout 覆盖率

```bash
# 检查所有 fetch 调用是否使用 timeout
rg "fetch\(" src/ --type ts --type vue | grep -v "fetchWithTimeout" | grep -v "node_modules" && echo "WARN: fetch without timeout found" || echo "PASS: All fetches use timeout"

# 检查 fetchWithTimeout 定义
rg "fetchWithTimeout" src/ --type ts --type vue -A 5
```

**判定：**
- 发现无 timeout 的 fetch → `WARN`（C3 要求）
- 无 fetchWithTimeout 定义 → `FAIL`
- 通过 → `PASS`

---

## 输出格式

审计完成后，输出：

```markdown
## Security Audit Result

| Step | Check | Result |
|------|-------|--------|
| 1 | 敏感数据泄露 | PASS/FAIL/WARN |
| 2 | DOMPurify 配置 | PASS/FAIL/WARN |
| 3 | CI Owner 门控 | PASS/FAIL/WARN |
| 4 | 脱敏逻辑 | PASS/FAIL/WARN |
| 5 | fetchWithTimeout | PASS/FAIL/WARN |

### Failed Items
- [如果有 FAIL] 列出具体文件和问题

### Warnings
- [如果有 WARN] 列出需要关注的地方

### Verdict
- PASS: 无 FAIL，可继续
- FAIL: 存在安全漏洞，必须修复
- WARN: 有潜在风险，需要人工确认
```

---

## 与 Verifier 的关系

| 工具 | 用途 | 执行时机 |
|------|------|----------|
| security-audit skill | 快速模式扫描 | 每轮 setgoal |
| verifiers/security-mask.sh | 脱敏专项测试 | C14-C16 验证 |
| verifiers/create-trigger.sh | CI 门控测试 | C8-C9 验证 |
| verifiers/gfm-render.sh | DOMPurify 测试 | C10-C13 验证 |

**原则：**
- security-audit skill 是快速扫描（5 分钟以内）
- Verifier 是深度验证（需要时手动运行）
- 两者互补，不重复

---

## 禁止事项

1. 禁止在安全审计中修改代码（只读扫描）
2. 禁止跳过 Step 1（敏感数据扫描是最优先的）
3. 禁止将 WARN 当作 PASS（WARN 需要人工确认）
4. 禁止在审计通过前执行 `git push`
