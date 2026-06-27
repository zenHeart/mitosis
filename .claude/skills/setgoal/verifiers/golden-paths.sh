#!/usr/bin/env bash
# verifiers/golden-paths.sh
# 验证三场景分流 + 生命周期命令 + CI 平台构建支持

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

echo "[verifier] Golden Paths: Three Scenarios + Session Commands + Platform CI"
echo ""

# ── 三场景分流 ──────────────────────────────────────────

echo "[verifier] Scenario Routing"
echo ""

# S1: triageMessage 返回 scenario 字段
if grep -rq "scenario.*platform.*app_create.*app_iterate\|scenario:.*platform\|scenario:.*app_create\|scenario:.*app_iterate" src/ 2>/dev/null; then
  check "triageMessage returns scenario field (C8)" "pass"
else
  check "triageMessage returns scenario field (C8)" "missing"
fi

# S2: triageMessage 对 platform 关键词返回 scenario='platform'
if grep -rq "isPlatform.*scenario.*platform\|scenario: 'platform'\|scenario: \"platform\"" src/ 2>/dev/null; then
  check "platform keywords → scenario='platform' (C8)" "pass"
else
  check "platform keywords → scenario='platform' (C8)" "missing"
fi

# S3: triageMessage 对 app_create 场景返回 scenario='app_create'
if grep -rq "app_create" src/ 2>/dev/null; then
  check "app_create scenario exists (C8)" "pass"
else
  check "app_create scenario exists (C8)" "missing"
fi

# S4: triageMessage 对 app_iterate 场景返回 scenario='app_iterate'
if grep -rq "app_iterate" src/ 2>/dev/null; then
  check "app_iterate scenario exists (C8)" "pass"
else
  check "app_iterate scenario exists (C8)" "missing"
fi

# S5: ChatSession 类型包含 scenario 字段
if grep -rq "scenario.*platform.*app_create.*app_iterate\|scenario?:" src/types/ 2>/dev/null; then
  check "ChatSession has scenario field (C1)" "pass"
else
  check "ChatSession has scenario field (C1)" "missing"
fi

# ── createBuild 按场景设 label ──────────────────────────

echo ""
echo "[verifier] createBuild Label Routing"
echo ""

# S6: createBuild 对 platform 场景设置 platform label
if grep -rq "'platform'" src/components/Workspace.vue 2>/dev/null || grep -rq '"platform"' src/components/Workspace.vue 2>/dev/null; then
  check "createBuild/platform sets platform label (C9)" "pass"
else
  check "createBuild/platform sets platform label (C9)" "missing"
fi

# S7: createBuild 对 app_create 场景设置 app/{name} label
if grep -q 'app/\${appName}' src/components/Workspace.vue 2>/dev/null; then
  check "createBuild/app_create sets app/{name} label (C9)" "pass"
else
  check "createBuild/app_create sets app/{name} label (C9)" "missing"
fi

# S8: createBuild 对 app_iterate 场景设置 app/{name} + update label
if grep -rq "'update'\|\\\"update\\\"" src/components/Workspace.vue 2>/dev/null; then
  check "createBuild/app_iterate sets update label (C9)" "pass"
else
  check "createBuild/app_iterate sets update label (C9)" "missing"
fi

# ── 生命周期命令 ────────────────────────────────────────

echo ""
echo "[verifier] Session Lifecycle Commands"
echo ""

# S9: /status 命令检测
if grep -rq "detectStatusCommand\|/status" src/composables/useMockGitHub.ts 2>/dev/null; then
  check "/status command detection exists (C12)" "pass"
else
  check "/status command detection exists (C12)" "missing"
fi

# S10: /stop 命令检测
if grep -rq "detectStopCommand\|/stop" src/composables/useMockGitHub.ts 2>/dev/null; then
  check "/stop command detection exists (C13)" "pass"
else
  check "/stop command detection exists (C13)" "missing"
fi

# S11: /start 命令检测
if grep -rq "detectStartCommand\|/start" src/composables/useMockGitHub.ts 2>/dev/null; then
  check "/start command detection exists (C14)" "pass"
else
  check "/start command detection exists (C14)" "missing"
fi

# S12: /status 在 Workspace.vue 中有处理逻辑
if grep -rq "checkAgentStatus\|statusCmd\|statusResult" src/components/Workspace.vue 2>/dev/null; then
  check "/status handler in Workspace.vue (C12)" "pass"
else
  check "/status handler in Workspace.vue (C12)" "missing"
fi

# S13: /stop 在 Workspace.vue 中有处理逻辑
if grep -rq "stopCmd\|status:cancelled\|updateIssue.*closed" src/components/Workspace.vue 2>/dev/null; then
  check "/stop handler in Workspace.vue (C13)" "pass"
else
  check "/stop handler in Workspace.vue (C13)" "missing"
fi

# S14: /start 在 Workspace.vue 中有处理逻辑
if grep -rq "startCmd\|updateIssue.*open" src/components/Workspace.vue 2>/dev/null; then
  check "/start handler in Workspace.vue (C14)" "pass"
else
  check "/start handler in Workspace.vue (C14)" "missing"
fi

# S15: checkAgentStatus 在 session store 中
if grep -rq "checkAgentStatus" src/stores/session.ts 2>/dev/null; then
  check "checkAgentStatus in session store (C12)" "pass"
else
  check "checkAgentStatus in session store (C12)" "missing"
fi

# ── CI 平台构建支持 ─────────────────────────────────────

echo ""
echo "[verifier] CI Platform Build Support"
echo ""

# S16: mitosis.yml parse step 使用 gh CLI 检测 platform label
if grep -q 'gh issue view.*--json labels.*--jq' .github/workflows/mitosis.yml 2>/dev/null && grep -q "grep.*'^platform\$'" .github/workflows/mitosis.yml 2>/dev/null; then
  check "mitosis.yml detects platform label (C23)" "pass"
else
  check "mitosis.yml detects platform label (C23)" "missing"
fi

# S17: mitosis.yml 设置 is_platform 输出
if grep -q "is_platform" .github/workflows/mitosis.yml 2>/dev/null; then
  check "mitosis.yml sets is_platform output (C23)" "pass"
else
  check "mitosis.yml sets is_platform output (C23)" "missing"
fi

# S18: 平台构建在 repo root 执行（不 cd apps/）
if grep -q "IS_PLATFORM" .github/workflows/mitosis.yml 2>/dev/null; then
  check "mitosis.yml uses IS_PLATFORM for conditional execution (C24)" "pass"
else
  check "mitosis.yml uses IS_PLATFORM for conditional execution (C24)" "missing"
fi

# S19: 平台构建 verifier 使用 npm run build + typecheck
if grep -q "npm run build" .github/workflows/mitosis.yml 2>/dev/null && grep -q "npm run typecheck" .github/workflows/mitosis.yml 2>/dev/null; then
  check "mitosis.yml platform verifier uses npm run build + typecheck (C26)" "pass"
else
  check "mitosis.yml platform verifier uses npm run build + typecheck (C26)" "missing"
fi

# S20: 平台构建 Commit 步骤必须 checkout -B 创建 branch（agent 提交到 master，需要从中创建 branch）
# 且不能有 git checkout -- .（会丢弃 agent 对 tracked files 的修改）
PLATFORM_COMMIT=$(sed -n '/IS_PLATFORM.*true/,/^          else$/p' .github/workflows/mitosis.yml 2>/dev/null || echo "")
if echo "$PLATFORM_COMMIT" | grep -q "git checkout -B" && echo "$PLATFORM_COMMIT" | grep -q "git push --force-with-lease" && ! echo "$PLATFORM_COMMIT" | grep -q "git checkout -- \."; then
  check "mitosis.yml platform commit creates branch + push, no checkout-reset (C26)" "pass"
else
  check "mitosis.yml platform commit creates branch + push, no checkout-reset (C26)" "missing"
fi

# ── Mock 模式命令测试准备 ───────────────────────────────

echo ""
echo "[verifier] Mock Mode Command Support"
echo ""

# S21: Mock 模式有 /status 检测
if grep -rq "detectStatusCommand" src/composables/useMockGitHub.ts 2>/dev/null; then
  check "Mock mode: /status detection (C15)" "pass"
else
  check "Mock mode: /status detection (C15)" "missing"
fi

# S22: Mock 模式有 /stop 检测
if grep -rq "detectStopCommand" src/composables/useMockGitHub.ts 2>/dev/null; then
  check "Mock mode: /stop detection (C15)" "pass"
else
  check "Mock mode: /stop detection (C15)" "missing"
fi

# S23: Mock 模式有 /start 检测
if grep -rq "detectStartCommand" src/composables/useMockGitHub.ts 2>/dev/null; then
  check "Mock mode: /start detection (C15)" "pass"
else
  check "Mock mode: /start detection (C15)" "missing"
fi

# S24: updateIssue 函数存在（用于 /stop 和 /start）
if grep -rq "updateIssue" src/composables/useGitHubAPI.ts 2>/dev/null; then
  check "updateIssue function exists for /stop and /start (C13, C14)" "pass"
else
  check "updateIssue function exists for /stop and /start (C13, C14)" "missing"
fi

# ── 类型检查 ────────────────────────────────────────────

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
