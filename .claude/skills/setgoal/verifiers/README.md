# Verifier 脚本使用指南

## 格式规范

每个 verifier 脚本必须：
1. 使用 `bash` shebang
2. 设置 `set -euo pipefail`
3. 输出格式：`[verifier]` 前缀 + 检查结果
4. 最终输出 `VERDICT: PASS` 或 `VERDICT: FAIL (<N> checks failed)`
5. exit 0 = PASS, exit 1 = FAIL

## 模板

```bash
#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0
CHECKS=()

check() {
  local name="$1"
  local result="$2"
  if [[ "$result" == "pass" ]]; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name: $result"
    FAIL=$((FAIL + 1))
  fi
  CHECKS+=("$name:$result")
}

echo "[verifier] <名称>"
echo ""

# 检查项...

echo ""
echo "[verifier] Result: $PASS/$((PASS + FAIL)) checks passed"

if [[ $FAIL -eq 0 ]]; then
  echo "VERDICT: PASS"
  exit 0
else
  echo "VERDICT: FAIL ($FAIL checks failed)"
  exit 1
fi
```

## 已有 Verifier

| 脚本/技能 | 用途 |
|-----------|------|
| `types-and-api.sh` | C1-C3: 类型定义 + GitHub API 扩展 + 超时保护 |
| `session-restore.sh` | C4-C5: 会话存储层 + Mock 模式 |
| `create-trigger.sh` | C6-C9: /create 触发 + CI Owner 安全门控 |
| `gfm-render.sh` | C10-C13: DOMPurify 渲染拦截 + XSS 防护 |
| `security-mask.sh` | C14-C16: 敏感信息脱敏 + 日志脱敏 |
| `security-audit` skill | 每轮 Phase C 快速安全扫描（5 步） |

## 安全审计技能

每轮 setgoal 执行时，Phase C 必须调用 `security-audit` skill：

```
Skill(skill: "security-audit")
```

该技能执行 5 步快速模式扫描：
1. 敏感数据泄露（token/secret/env var）
2. DOMPurify 配置验证
3. CI Owner 门控验证
4. 脱敏逻辑验证
5. fetchWithTimeout 覆盖率

**判定规则：**
- PASS: 无安全问题，继续 verifier
- FAIL: 存在安全漏洞，必须修复
- WARN: 潜在风险，需要人工确认
