#!/usr/bin/env bash
# verifiers/create-trigger.sh
# 验证 C6-C9: /create 触发 + CI 侧 owner 安全门控

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

echo "[verifier] C6-C9: /create Trigger + CI Owner Gate"
echo ""

# C6: 创建 Issue 不自动触发（createIssue 和 agent loop 分离）
CREATE_COUNT=$(grep -r "createIssue\|createSession\|openIssue" src/ 2>/dev/null | wc -l | tr -d ' ')
TRIGGER_COUNT=$(grep -r "triggerAgentLoop\|startBuild\|agentLoop\|onCreate" src/ .github/ 2>/dev/null | wc -l | tr -d ' ')

if [[ "$CREATE_COUNT" -gt 0 ]]; then
  check "Issue creation code exists (C6)" "pass"
else
  check "Issue creation code exists (C6)" "missing"
fi

# C6: 创建 Issue 函数中不直接调用构建触发
if grep -rq "createIssue\|createSession" src/ 2>/dev/null; then
  # Check that createIssue doesn't call agent loop trigger directly
  if grep -A5 "createIssue\|createSession" src/ 2>/dev/null | grep -q "triggerAgentLoop\|startBuild\|agentLoop"; then
    check "Issue creation does NOT auto-trigger build (C6)" "fail: found trigger call in createIssue"
  else
    check "Issue creation does NOT auto-trigger build (C6)" "pass"
  fi
else
  check "Issue creation does NOT auto-trigger build (C6)" "missing (no createIssue found)"
fi

# C7: /create 检测逻辑存在
if grep -rq "/create\|create.*command\|onCreateCommand" src/ .github/ 2>/dev/null; then
  check "/create detection exists (C7)" "pass"
else
  check "/create detection exists (C7)" "missing"
fi

# C8: CI 侧 owner 验证（关键安全边界）
if [[ -f ".github/workflows/mitosis.yml" ]]; then
  check "mitosis.yml exists (C8)" "pass"

  # Check for issue_comment event
  if grep -q "issue_comment" .github/workflows/mitosis.yml; then
    check "CI listens to issue_comment event (C8)" "pass"
  else
    check "CI listens to issue_comment event (C8)" "missing"
  fi

  # Check for owner comparison in CI
  if grep -q "GITHUB_REPOSITORY_OWNER\|github.actor\|comment.user" .github/workflows/mitosis.yml; then
    check "CI checks comment author identity (C8)" "pass"
  else
    check "CI checks comment author identity (C8)" "missing"
  fi

  # Check for /create in CI condition
  if grep -q "/create" .github/workflows/mitosis.yml; then
    check "CI checks for /create in comment body (C8)" "pass"
  else
    check "CI checks for /create in comment body (C8)" "missing"
  fi
else
  check "mitosis.yml exists (C8)" "missing"
  check "CI listens to issue_comment event (C8)" "missing"
  check "CI checks comment author identity (C8)" "missing"
  check "CI checks for /create in comment body (C8)" "missing"
fi

# C9: CI 仅响应 issue_comment 事件，不响应 issues 事件（opened/closed/reopened）
echo ""
echo "[verifier] C9: Event type gate (issue_comment only, not issues)"
if [[ -f ".github/workflows/mitosis.yml" ]]; then
  # 检查 issue_comment 事件存在
  if grep -q "issue_comment" .github/workflows/mitosis.yml; then
    check "CI listens to issue_comment event (C9)" "pass"
  else
    check "CI listens to issue_comment event (C9)" "missing"
  fi

  # 检查不使用 issues 事件作为触发器
  # issues 事件包括: opened, closed, reopened, edited, deleted, transferred, pinned, unpinned, assigned, unassigned, labeled, unlabeled, locked, unlocked, milestoned, demilestoned
  ISSUES_EVENT_TRIGGER=$(grep -E "^\s*issues:" .github/workflows/mitosis.yml 2>/dev/null || true)
  if [[ -z "$ISSUES_EVENT_TRIGGER" ]]; then
    check "CI does NOT use issues event trigger (C9)" "pass"
  else
    check "CI does NOT use issues event trigger (C9)" "fail: found issues: trigger in workflow"
  fi
else
  check "CI listens to issue_comment event (C9)" "missing"
  check "CI does NOT use issues event trigger (C9)" "missing"
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
