#!/usr/bin/env bash
# UX Review Engine — Entry Script
#
# 本地和远程 CI 均可执行的 UX 审查入口脚本。
# 本地由 setgoal Phase C 调用，远程由 CI workflow 调用。
#
# 用法:
#   bash ux-review.sh incremental [files...]
#   bash ux-review.sh full
#   bash ux-review.sh incremental -- ChatInput.vue Workspace.vue

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
BASE_URL="${BASE_URL:-http://localhost:5173/}"
MODE="${1:-incremental}"
shift || true
FILES=("$@")

echo "========================================"
echo "  UX Review Engine — $MODE mode"
echo "========================================"
echo "Base URL: $BASE_URL"
echo "Mode: $MODE"
if [ ${#FILES[@]} -gt 0 ]; then
  echo "Files: ${FILES[*]}"
fi
echo ""

# ─── 检查依赖 ─────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  echo "[ux-review] ERROR: Node.js is not installed"
  exit 1
fi

NODE_VERSION=$(node -e "console.log(process.version)")
echo "[ux-review] Node.js: $NODE_VERSION"

# 检查 Playwright
if ! node -e "require('playwright')" 2>/dev/null; then
  echo "[ux-review] Playwright not found, installing..."
  cd "$SKILL_DIR" && npm install playwright 2>/dev/null || {
    echo "[ux-review] WARNING: Cannot install playwright, measurement will be limited"
  }
fi

# ─── 检查应用是否运行 ─────────────────────────────────────────

if [ "$CI" != "true" ]; then
  echo "[ux-review] Checking if app is running at $BASE_URL..."
  if ! curl -sf "$BASE_URL" > /dev/null 2>&1; then
    echo "[ux-review] App is not running at $BASE_URL"
    echo "[ux-review] Please start the dev server first: npm run dev"
    exit 1
  fi
  echo "[ux-review] App is running"
fi

# ─── 创建输出目录 ─────────────────────────────────────────────

mkdir -p "$SCRIPT_DIR/output"

MEASUREMENTS_OUT="$SCRIPT_DIR/output/measurements.json"
SCORES_OUT="$SCRIPT_DIR/output/scores.json"
REPORT_OUT="$SCRIPT_DIR/output/report.json"

# ─── Step 1: 测量 ─────────────────────────────────────────────

echo ""
echo "[ux-review] Step 1: Measuring UX dimensions..."

MEASURE_ARGS=(
  node "$SCRIPT_DIR/scripts/measure.mjs"
  --mode "$MODE"
  --output "$MEASUREMENTS_OUT"
)

if [ ${#FILES[@]} -gt 0 ]; then
  MEASURE_ARGS+=(--files "${FILES[*]}")
fi

if [ "$MODE" = "full" ]; then
  MEASURE_ARGS+=(--viewport "1440x900" --mobileViewport "390x844")
fi

echo "[ux-review] Running: ${MEASURE_ARGS[*]}"
"${MEASURE_ARGS[@]}" || {
  echo "[ux-review] WARNING: Measurement failed, using fallback"
  # 创建空测量结果
  echo '{"mode":"'$MODE'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","dimensions":{}}' > "$MEASUREMENTS_OUT"
}

# ─── Step 2: 评分 ─────────────────────────────────────────────

echo ""
echo "[ux-review] Step 2: Scoring against rubric..."

SCORE_ARGS=(
  node "$SCRIPT_DIR/scripts/score.mjs"
  --measurements "$MEASUREMENTS_OUT"
  --output "$SCORES_OUT"
)

echo "[ux-review] Running: ${SCORE_ARGS[*]}"
"${SCORE_ARGS[@]}"

# ─── Step 3: 聚合（多输入模式） ─────────────────────────────────

echo ""
echo "[ux-review] Step 3: Aggregating results..."

AGGREGATE_ARGS=(
  node "$SCRIPT_DIR/scripts/aggregate.mjs"
  --inputs "$SCORES_OUT"
  --output "$REPORT_OUT"
)

echo "[ux-review] Running: ${AGGREGATE_ARGS[*]}"
"${AGGREGATE_ARGS[@]}"

# ─── 输出报告摘要 ─────────────────────────────────────────────

echo ""
echo "========================================"
echo "  UX Review Complete"
echo "========================================"

# 读取报告并输出摘要
REPORT=$(cat "$REPORT_OUT")
OVERALL=$(echo "$REPORT" | node -e "const d=require('fs').readFileSync(0,'utf-8'); const j=JSON.parse(d); console.log(j.overall_score ?? 'N/A');")
VERDICT=$(echo "$REPORT" | node -e "const d=require('fs').readFileSync(0,'utf-8'); const j=JSON.parse(d); console.log(j.verdict);")

echo "Overall Score: $OVERALL/100"
echo "Verdict: $VERDICT"
echo "Report: $REPORT_OUT"
echo ""

# 输出 next_actions
NEXT_ACTIONS=$(echo "$REPORT" | node -e "
  const d=require('fs').readFileSync(0,'utf-8');
  const j=JSON.parse(d);
  if (j.next_actions && j.next_actions.length > 0) {
    console.log('Next actions:');
    j.next_actions.forEach(a => console.log('  ' + a));
  }
")

if [ -n "$NEXT_ACTIONS" ]; then
  echo "$NEXT_ACTIONS"
fi

# 返回退出码
if [ "$VERDICT" = "PASS" ]; then
  echo ""
  echo "[ux-review] PASS — All dimensions meet threshold"
  exit 0
elif [ "$VERDICT" = "PARTIAL" ]; then
  echo ""
  echo "[ux-review] PARTIAL — Some dimensions need attention"
  exit 1
else
  echo ""
  echo "[ux-review] FAIL — Critical issues found"
  exit 1
fi
