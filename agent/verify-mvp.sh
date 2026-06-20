#!/bin/bash
# agent/verify-mvp.sh — Mitosis MVP 构建验证脚本（Phase 2: 构建 + 安全 + 结构）
# 用法: bash agent/verify-mvp.sh [--skip-build] [--skip-app]
#
# 退出码: 0 = PASS, 1 = FAIL, 2 = SKIP (Phase 2 跳过，Phase 1/3 在其他地方验证)
#
# 这是 Verifier subagent 的 Phase 2 实现。
# Phase 1 (Playwright 浏览器) 和 Phase 3 (GitHub 状态) 由 subagent 直接使用 MCP 工具完成。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

SKIP_BUILD=false
SKIP_APP=false
VERBOSE=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --skip-app) SKIP_APP=true ;;
    --verbose) VERBOSE=true ;;
  esac
done

ERRORS=0
WARNINGS=0
RESULTS=()

log_pass()  { echo -e "  \033[0;32m✅ $1\033[0m"; RESULTS+=("PASS: $1"); }
log_fail()  { echo -e "  \033[0;31m❌ $1\033[0m"; ERRORS=$((ERRORS + 1)); RESULTS+=("FAIL: $1"); }
log_warn()  { echo -e "  \033[1;33m⚠️  $1\033[0m"; WARNINGS=$((WARNINGS + 1)); RESULTS+=("WARN: $1"); }
log_info()  { echo -e "  ℹ️  $1"; }

echo "═══════════════════════════════════════════════════════════"
echo "  Phase 2: 构建验证 (agent/verify-mvp.sh)"
echo "═══════════════════════════════════════════════════════════"

# ── 2.1 平台构建 ──────────────────────────────────────────
echo ""
echo "-- 2.1 平台构建 --"

if [ "$SKIP_BUILD" = "true" ]; then
  log_info "跳过平台构建 (--skip-build)"
else
  BUILD_LOG=$(mktemp)
  if npm run build > "$BUILD_LOG" 2>&1; then
    log_pass "npm run build 通过"
  else
    log_fail "npm run build 失败"
    if [ "$VERBOSE" = "true" ]; then
      echo "  构建日志:"
      tail -30 "$BUILD_LOG" | sed 's/^/    /'
    fi
  fi
  rm -f "$BUILD_LOG"
fi

# ── 2.2 TypeScript strict ──────────────────────────────────
echo ""
echo "-- 2.2 TypeScript 检查 --"

TSC_LOG=$(mktemp)
if npx vue-tsc -b --noEmit > "$TSC_LOG" 2>&1; then
  log_pass "vue-tsc: 0 errors"
else
  ERROR_COUNT=$(grep -c "error TS" "$TSC_LOG" 2>/dev/null || echo "?")
  log_fail "vue-tsc 发现错误 (约 ${ERROR_COUNT} 个)"
  if [ "$VERBOSE" = "true" ]; then
    echo "  类型错误 (前 20 行):"
    head -20 "$TSC_LOG" | sed 's/^/    /'
  fi
fi
rm -f "$TSC_LOG"

# ── 2.3 生成应用构建 ──────────────────────────────────────
echo ""
echo "-- 2.3 生成应用构建 --"

if [ "$SKIP_APP" = "true" ]; then
  log_info "跳过生成应用构建 (--skip-app)"
else
  # 找最新的生成应用目录
  LATEST_APP=$(find apps -maxdepth 2 -type d -name 'v[0-9]*' 2>/dev/null | sort | tail -1)
  if [ -z "$LATEST_APP" ]; then
    log_warn "未找到生成应用目录，跳过应用构建验证"
  else
    APP_NAME=$(echo "$LATEST_APP" | sed 's#apps/\([^/]*\).*#\1#')
    APP_VERSION=$(echo "$LATEST_APP" | sed 's#.*/\(v[0-9]*\)#\1#')

    pushd "$LATEST_APP" >/dev/null

    APP_BUILD_LOG=$(mktemp)
    if npm install > "$APP_BUILD_LOG" 2>&1 && npm run build >> "$APP_BUILD_LOG" 2>&1; then
      log_pass "生成应用 $APP_NAME $APP_VERSION 构建通过"
    else
      log_fail "生成应用 $APP_NAME $APP_VERSION 构建失败"
      if [ "$VERBOSE" = "true" ]; then
        echo "  构建日志 (最后 20 行):"
        tail -20 "$APP_BUILD_LOG" | sed 's/^/    /'
      fi
    fi
    rm -f "$APP_BUILD_LOG"

    # 运行 worker/verify-build.sh
    VERIFY_LOG=$(mktemp)
    if bash "$SCRIPT_DIR/../worker/verify-build.sh" > "$VERIFY_LOG" 2>&1; then
      log_pass "worker/verify-build.sh PASS ($APP_NAME $APP_VERSION)"
    else
      log_fail "worker/verify-build.sh FAIL ($APP_NAME $APP_VERSION)"
      if [ "$VERBOSE" = "true" ]; then
        echo "  verifier 日志 (最后 30 行):"
        tail -30 "$VERIFY_LOG" | sed 's/^/    /'
      fi
    fi
    rm -f "$VERIFY_LOG"

    popd >/dev/null
  fi
fi

# ── 2.4 安全扫描 ──────────────────────────────────────────
echo ""
echo "-- 2.4 安全扫描（敏感信息） --"

SECRET_PATTERNS='(ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{35}|eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*)'

# 扫描 src/, apps/, worker/, .github/ 下的代码文件，排除 markdown
HITS=$(rg "$SECRET_PATTERNS" \
  --type-add 'code:*.{ts,js,vue,json,yml,yaml,sh,env,md}' \
  -g '*.ts' -g '*.js' -g '*.vue' -g '*.json' -g '*.yml' -g '*.yaml' -g '*.sh' -g '*.env' \
  src/ apps/ worker/ .github/ 2>/dev/null | grep -v '\.md:' | grep -v 'node_modules' | grep -v 'dist/' | head -5 || true)

if [ -z "$HITS" ]; then
  log_pass "未发现真实 token/key/secret"
else
  log_fail "发现疑似敏感信息:"
  echo "$HITS" | sed 's/^/    /'
fi

# ── 2.5 Vite base 配置检查 ─────────────────────────────────
echo ""
echo "-- 2.5 Vite base 配置 --"

# 平台主站 base: '/'
PLATFORM_BASE=$(node -e "
const fs = require('fs');
try {
  const c = fs.readFileSync('vite.config.ts', 'utf8');
  const m = c.match(/base:\s*['\"]([^'\"]+)['\"]/);
  console.log(m ? m[1] : 'not_found');
} catch(e) { console.log('error'); }
" 2>/dev/null)
if [ "$PLATFORM_BASE" = "/" ]; then
  log_pass "平台主站 vite base: '/'"
else
  log_fail "平台主站 vite base 不正确 (当前: $PLATFORM_BASE，应为 '/')"
fi

# 检查 worker/prompt.txt 要求生成应用使用 base: './'
PROMPT_BASE=$(grep -oP "base:\s*['\"][^'\"]+['\"]" worker/prompt.txt 2>/dev/null | head -1 | grep -oP "'[^']+'" | tr -d "'" || echo "")
if [ "$PROMPT_BASE" = "./" ]; then
  log_pass "生成应用要求 vite base: './' (prompt.txt)"
else
  # 尝试另一种 grep 方式
  PROMPT_BASE2=$(grep "base" worker/prompt.txt 2>/dev/null | grep "\.\/" | head -1 || echo "")
  if [ -n "$PROMPT_BASE2" ]; then
    log_pass "生成应用要求 vite base: './' (prompt.txt)"
  else
    log_fail "worker/prompt.txt 中未找到生成应用 base: './' 要求"
  fi
fi

# ── 2.6 关键文件存在性 ────────────────────────────────────
echo ""
echo "-- 2.6 关键文件存在性 --"

CRITICAL_FILES=(
  "src/App.vue"
  "src/components/Workspace.vue"
  "src/components/Gallery.vue"
  "src/components/LoginPage.vue"
  "src/components/SetupPage.vue"
  "src/composables/useGitHubAPI.ts"
  "src/composables/useStepFun.ts"
  "src/composables/usePolling.ts"
  "src/stores/auth.ts"
  "src/config/repo.ts"
  "worker/verify-build.sh"
  "worker/prompt.txt"
  ".github/workflows/mitosis.yml"
  ".github/workflows/deploy.yml"
)

for f in "${CRITICAL_FILES[@]}"; do
  if [ -f "$f" ]; then
    log_pass "$f"
  else
    log_fail "缺失关键文件: $f"
  fi
done

# ── 2.7 Claude Code 规则位置检查 ───────────────────────────
echo ""
echo "-- 2.7 Claude Code 规则位置 --"

RULE_FILES=$(find .claude -maxdepth 3 -type f ! -name 'settings.local.json' ! -name '.goal-state.json' ! -name '.goal-verdict' 2>/dev/null | sort)
if [ -n "$RULE_FILES" ]; then
  FILE_COUNT=$(echo "$RULE_FILES" | wc -l | tr -d ' ')
  log_pass "Claude Code 规则文件在官方位置 (.claude/ 下, $FILE_COUNT 个文件)"
  if [ "$VERBOSE" = "true" ]; then
    echo "$RULE_FILES" | sed 's/^/    /'
  fi
else
  log_warn "未在 .claude/ 下找到规则文件"
fi

# ── 2.8 CI --bare 检查 ─────────────────────────────────────
echo ""
echo "-- 2.8 CI --bare 检查 --"

if grep -q "\-\-bare" .github/workflows/mitosis.yml; then
  log_pass "CI 使用 --bare 模式"
else
  log_fail "CI 未使用 --bare 模式"
fi

# ── 2.9 CI verify-build.sh 检查 ────────────────────────────
echo ""
echo "-- 2.9 CI verifier 检查 --"

if grep -q "verify-build.sh" .github/workflows/mitosis.yml; then
  log_pass "CI 显式运行 verify-build.sh"
else
  log_fail "CI 未显式运行 verify-build.sh"
fi

# ── 结果汇总 ──────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Phase 2 结果汇总"
echo "═══════════════════════════════════════════════════════════"
echo "  错误: $ERRORS"
echo "  警告: $WARNINGS"
echo "═══════════════════════════════════════════════════════════"

if [ "$VERBOSE" = "true" ]; then
  echo ""
  echo "  详细结果:"
  for r in "${RESULTS[@]}"; do
    echo "    $r"
  done
fi

if [ "$ERRORS" -gt 0 ]; then
  exit 1
else
  echo ""
  echo "✅ Phase 2 验证通过 (错误: $ERRORS, 警告: $WARNINGS)"
  exit 0
fi
