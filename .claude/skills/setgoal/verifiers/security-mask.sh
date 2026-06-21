#!/usr/bin/env bash
# verifiers/security-mask.sh
# 验证安全脱敏：密码/敏感信息不被明文存储

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

echo "[verifier] Security: Sensitive Data Masking"
echo ""

# 1. 脱敏函数/工具存在
if grep -rq "maskPassword\|maskSecret\|sanitizeInput\|maskSensitive\|redact" src/ 2>/dev/null; then
  check "masking utility exists" "pass"
else
  check "masking utility exists" "missing"
fi

# 2. 敏感字段正则存在
if grep -rq "password.*\*\*\*\|passwd.*\*\*\*\|pwd.*\*\*\*\|secret.*\*\*\*\|MASK_PATTERN\|SENSITIVE_KEYS" src/ 2>/dev/null; then
  check "sensitive field pattern exists" "pass"
else
  check "sensitive field pattern exists" "missing"
fi

# 3. 存储前脱敏（在写入 GitHub 前调用）
if grep -rq "mask.*before.*store\|sanitize.*before.*create\|mask.*issue\|mask.*comment" src/ 2>/dev/null; then
  check "mask before storage" "pass"
else
  check "mask before storage" "missing"
fi

# 4. 日志脱敏
if grep -rq "mask.*log\|log.*mask\|redact.*log\|log.*redact\|\[REDACTED\]\|\[MASKED\]" src/ 2>/dev/null; then
  check "log masking exists" "pass"
else
  check "log masking exists" "missing"
fi

# 5. 无明文密码硬编码
echo ""
echo "[verifier] Security scan for hardcoded secrets..."
HARDCODED=$(rg "(password|passwd|pwd|secret|token|api_key)\s*[:=]\s*['\"][^'\*]" \
  --type-add 'code:*.{ts,js,vue}' \
  -g '!*.md' \
  src/ 2>/dev/null | grep -v "mask\|sanitize\|redact\|MASK\|\\*\\*\\*" | head -5 || true)

if [[ -z "$HARDCODED" ]]; then
  check "no hardcoded secrets" "pass"
else
  check "no hardcoded secrets" "found: $(echo "$HARDCODED" | head -1)"
fi

# 6. TypeScript 编译通过
echo ""
echo "[verifier] TypeScript check..."
if npm run typecheck > /dev/null 2>&1; then
  check "TypeScript compiles" "pass"
else
  check "TypeScript compiles" "typecheck failed"
fi

echo ""
echo "[verifier] Result: $PASS/$((PASS + FAIL)) checks passed"

if [[ $FAIL -eq 0 ]]; then
  echo "VERDICT: PASS"
  exit 0
else
  echo "VERDICT: FAIL ($FAIL checks failed)"
  exit 1
fi
