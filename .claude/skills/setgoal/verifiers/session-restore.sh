#!/usr/bin/env bash
# verifiers/session-restore.sh
# 验证 C4-C5: 会话存储层 + Mock 模式

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

echo "[verifier] C4-C5: Session Store + Mock Mode"
echo ""

# C4: session store 存在
if [[ -f "src/stores/session.ts" ]] || grep -rq "defineStore.*session" src/stores/ 2>/dev/null; then
  check "session store exists (C4)" "pass"
else
  check "session store exists (C4)" "missing"
fi

# C4: Issues API 存在
if grep -q "listUserIssues\|getIssueComments\|createIssueComment" src/composables/useGitHubAPI.ts 2>/dev/null; then
  check "GitHub Issue APIs exist (C4)" "pass"
else
  check "GitHub Issue APIs exist (C4)" "missing"
fi

# C5: Mock 模式 composable 存在
if grep -rq "useMockGitHub\|VITE_USE_MOCK_GITHUB\|mock.*github" src/ 2>/dev/null; then
  check "Mock mode composable exists (C5)" "pass"
else
  check "Mock mode composable exists (C5)" "missing"
fi

# C5: localStorage 使用
if grep -rq "localStorage" src/stores/session.ts src/composables/ 2>/dev/null; then
  check "localStorage used in session store (C5)" "pass"
else
  check "localStorage used in session store (C5)" "missing"
fi

# C17: Mock 模式完整流程（创建 → 发消息 → 渲染 → 脱敏）
# 检查 mock composable 是否有完整流程支持
if grep -rq "useMockGitHub\|VITE_USE_MOCK_GITHUB" src/ 2>/dev/null; then
  # 检查是否有创建 session 的能力
  if grep -rq "createSession\|createIssue\|mock.*create" src/composables/ src/stores/ 2>/dev/null; then
    check "Mock mode: session creation (C17)" "pass"
  else
    check "Mock mode: session creation (C17)" "warn: not confirmed"
  fi

  # 检查脱敏在 mock 模式中也被使用
  if grep -rq "mask\|sanitize\|redact\|\*\*\*" src/stores/session.ts src/composables/ 2>/dev/null; then
    check "Mock mode: privacy masking (C17)" "pass"
  else
    check "Mock mode: privacy masking (C17)" "warn: not confirmed"
  fi
fi

# C18: /create Mock 触发（owner 通过，非 owner 静默忽略）
# 检查 mock composable 中是否有 /create 检测逻辑
if grep -rq "/create\|createCommand\|onCreateCommand" src/composables/ src/stores/ 2>/dev/null; then
  check "/create detection in mock mode (C18)" "pass"

  # 检查是否有 owner 验证逻辑（mock 模式下的模拟 owner check）
  if grep -rq "owner\|isOwner\|mockOwner" src/composables/ src/stores/ 2>/dev/null; then
    check "Mock mode: owner check for /create (C18)" "pass"
  else
    check "Mock mode: owner check for /create (C18)" "warn: owner check not confirmed"
  fi
else
  check "/create detection in mock mode (C18)" "missing"
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
