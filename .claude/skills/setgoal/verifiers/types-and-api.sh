#!/usr/bin/env bash
# verifiers/types-and-api.sh
# 验证 Phase 1: 类型定义 + GitHub API 扩展
# 对应 goal.md Stage: types-api

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

echo "[verifier] Phase 1: Types + API Extension"
echo ""

# 1. IssueComment 类型存在
if grep -q "IssueComment" src/types/app.ts 2>/dev/null; then
  check "IssueComment type defined" "pass"
else
  check "IssueComment type defined" "missing"
fi

# 2. ChatSession 类型存在
if grep -q "ChatSession" src/types/app.ts 2>/dev/null; then
  check "ChatSession type defined" "pass"
else
  check "ChatSession type defined" "missing"
fi

# 3. listUserIssues API 存在
if grep -q "listUserIssues" src/composables/useGitHubAPI.ts 2>/dev/null; then
  check "listUserIssues API exists" "pass"
else
  check "listUserIssues API exists" "missing"
fi

# 4. getIssueComments API 存在
if grep -q "getIssueComments" src/composables/useGitHubAPI.ts 2>/dev/null; then
  check "getIssueComments API exists" "pass"
else
  check "getIssueComments API exists" "missing"
fi

# 5. createIssueComment API 存在
if grep -q "createIssueComment" src/composables/useGitHubAPI.ts 2>/dev/null; then
  check "createIssueComment API exists" "pass"
else
  check "createIssueComment API exists" "missing"
fi

# 6. fetchWithTimeout 存在（超时保护）
if grep -q "fetchWithTimeout" src/composables/useGitHubAPI.ts 2>/dev/null; then
  check "fetchWithTimeout exists" "pass"
else
  check "fetchWithTimeout exists" "missing"
fi

# 7. TypeScript 编译通过
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
