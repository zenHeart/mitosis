#!/usr/bin/env bash
# verifiers/gfm-render.sh
# 验证 C10-C13: 渲染拦截（DOMPurify XSS 防护）

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

echo "[verifier] C10-C13: Render Interception (DOMPurify)"
echo ""

# C10: DOMPurify 依赖 + sanitize 调用
if grep -q '"dompurify"' package.json 2>/dev/null || grep -q '"@types/dompurify"' package.json 2>/dev/null; then
  check "DOMPurify dependency (C10)" "pass"
else
  check "DOMPurify dependency (C10)" "missing"
fi

if grep -rq "DOMPurify\|dompurify" src/ 2>/dev/null; then
  check "DOMPurify sanitize called (C10)" "pass"
else
  check "DOMPurify sanitize called (C10)" "missing"
fi

# C11: 白名单配置
if grep -rq "ALLOWED_TAGS" src/ 2>/dev/null; then
  check "ALLOWED_TAGS whitelist (C11)" "pass"
else
  check "ALLOWED_TAGS whitelist (C11)" "missing"
fi

if grep -rq "ALLOWED_ATTR" src/ 2>/dev/null; then
  check "ALLOWED_ATTR whitelist (C11)" "pass"
else
  check "ALLOWED_ATTR whitelist (C11)" "missing"
fi

# C12: a 标签安全 + on* 事件移除
if grep -rq 'noopener\|noreferrer' src/ 2>/dev/null; then
  check "a tag rel=noopener noreferrer (C12)" "pass"
else
  check "a tag rel=noopener noreferrer (C12)" "missing"
fi

if grep -rq "on\w*\s*:" src/ 2>/dev/null | grep -q "ALLOWED_TAGS\|ALLOWED_ATTR"; then
  check "on* events not in whitelist (C12)" "pass"
else
  # Check that on* is NOT in ALLOWED_ATTR
  if grep -rq "ALLOWED_ATTR" src/ 2>/dev/null && ! grep -rq "ALLOWED_ATTR.*onclick\|ALLOWED_ATTR.*onerror" src/ 2>/dev/null; then
    check "on* events excluded (C12)" "pass"
  else
    check "on* events excluded (C12)" "missing"
  fi
fi

# C13: 渲染拦截覆盖所有入口
RENDER_COUNT=$(grep -r "sanitize\|DOMPurify" src/ 2>/dev/null | grep -v "node_modules" | grep -v ".d.ts" | wc -l | tr -d ' ')
if [[ "$RENDER_COUNT" -ge 2 ]]; then
  check "sanitize called in multiple places (C13)" "pass"
else
  check "sanitize called in multiple places (C13)" "missing (found $RENDER_COUNT)"
fi

# TypeScript 编译通过
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
